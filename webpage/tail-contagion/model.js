/* One live microsecond clock drives packets, conveyors, service, and metrics.
 * Wall-clock slowdown belongs only to the controller. All displayed totals are
 * observations of this model; there is no accelerated/off-screen workload. */
(function(root) {
  'use strict';
  const DT = 1 / 40, DEADLINE = 4, MAX_QUEUE = 400, SETUP = .4;
  const INGRESS = .65, OUTPUT = .5, OUTPUT_GAP = .55;
  const TENANTS = [{name:'Victim',color:'#009E73',rate:.55},{name:'Adversary',color:'#DC267F',rate:.55}];
  const MODES = {
    packets:{name:'Packet limit',description:'Every packet costs one token. Larger packets and extra checks still consume more core time, so a neighbor can miss deadlines.'},
    bytes:{name:'Byte limit',description:'Packets pay for their bytes. Extra checks add CPU work without adding bytes, so they can still delay a neighbor.'},
    time:{name:'Time budget',description:'Finish each batch, then charge the actual CPU time. Funded senders go next; spare capacity remains available.'},
    dedicated:{name:'Dedicated',description:'Each sender reserves a private datapath core. An idle core cannot help the other sender.'}
  };
  function defaults(){return {mode:'packets',size:64,extra:3,batch:4,traffic:'steady',allowance:.7,cap:1,period:.1};}
  function phasesFor(packet){
    const result=[{name:'Open & identify',kind:'identify',duration:.07},{name:'Read label',kind:'scan',duration:.12},
      {name:'Copy payload',kind:'copy',duration:.08+1.2*packet.bytes/1024}];
    for(let i=0;i<packet.extra;i++)result.push({name:'Extra lookup '+(i+1),kind:'inspect',duration:.26,pass:i});
    result.push({name:'Stamp & send',kind:'stamp',duration:.1});return result;
  }
  function costOf(packet){return phasesFor(packet).reduce((n,p)=>n+p.duration,0);}
  class Sorter {
    constructor(config={}){
      this.config={...defaults(),...config,batch:4};
      if(!Object.hasOwn(MODES,this.config.mode))throw Error('Unknown policy');
      this.t=0;this.sequence=0;this.cursor=0;this.completedBatches=0;this.nextRefill=this.config.period;
      this.receipt=null;this.deliveries=[];this.events=[];this.deadlineEvents=[];this.nextVisualAt=0;
      this.tenants=TENANTS.map((t,id)=>({...t,id,queue:[],nextArrival:.25+id*.15,arrived:0,processed:0,
        delivered:0,assessed:0,missed:0,dropped:0,bytes:0,cpu:0,admitted:0,chargedBytes:0,balance:this.cap()}));
      this.workers=Array.from({length:this.config.mode==='dedicated'?2:1},()=>({job:null,busy:0}));
    }
    get cores(){return this.workers.length;}
    cap(){return this.config.mode==='packets'?Math.max(1,4*this.config.cap):this.config.mode==='bytes'?Math.max(1024,2048*this.config.cap):.55*this.config.cap;}
    refillRate(){return this.config.allowance*(this.config.mode==='packets'?1:this.config.mode==='bytes'?256:.75);}
    spawn(id,at=this.t){
      const tenant=this.tenants[id],packet={id:++this.sequence,tenant:id,bytes:id===1?this.config.size:64,
        extra:id===1?this.config.extra:0,arrived:at,readyAt:at+INGRESS,deadline:at+DEADLINE,
        settled:false,missedAt:null,deliveredAt:null};
      tenant.arrived++;
      if(tenant.queue.length>=MAX_QUEUE){tenant.dropped++;this.miss(packet);}else tenant.queue.push(packet);
      return packet;
    }
    miss(packet){
      if(packet.settled)return;
      packet.settled=true;packet.missedAt=this.t;
      const tenant=this.tenants[packet.tenant];tenant.missed++;tenant.assessed++;
      this.deadlineEvents.push({t:this.t,packet});
    }
    assess(packet,onTime){
      if(packet.settled)return;
      if(!onTime){this.miss(packet);return;}
      packet.settled=true;this.tenants[packet.tenant].assessed++;
    }
    eligible(tenant){
      const packet=tenant.queue[0];if(!packet||packet.readyAt>this.t+1e-8)return false;
      return this.config.mode==='packets'?tenant.balance>=1-1e-8:this.config.mode==='bytes'?tenant.balance>=packet.bytes-1e-8:
        this.config.mode==='time'?tenant.balance>1e-8:true;
    }
    start(worker,onlyTenant=null){
      const items=[],mode=this.config.mode;
      for(let n=0;n<4;n++){
        const candidates=onlyTenant===null?this.tenants.map((_,o)=>(this.cursor+o)%2):[onlyTenant];
        let id=candidates.find(i=>this.eligible(this.tenants[i])),slack=false;
        if(id===undefined&&mode==='time'&&!items.length){
          id=candidates.find(i=>this.tenants[i].queue[0]?.readyAt<=this.t+1e-8);slack=id!==undefined;
        }
        if(id===undefined)break;
        const tenant=this.tenants[id],packet=tenant.queue.shift();
        if(mode==='packets')tenant.balance-=1;
        if(mode==='bytes')tenant.balance-=packet.bytes;
        tenant.admitted++;tenant.chargedBytes+=packet.bytes;
        items.push({packet,spent:0,slack});this.cursor=(id+1)%2;
      }
      if(!items.length)return;
      const stages=[{name:'Load batch',kind:'setup',duration:SETUP,item:-1}];
      items.forEach((item,i)=>phasesFor(item.packet).forEach(p=>stages.push({...p,item:i})));
      worker.job={items,stages,stage:0,elapsed:0,started:this.t,total:stages.reduce((n,s)=>n+s.duration,0)};
    }
    finish(worker){
      const job=worker.job,perTenant=[0,0];
      job.items.forEach(item=>{
        const packet=item.packet,tenant=this.tenants[packet.tenant],charge=item.spent+SETUP/job.items.length;
        perTenant[packet.tenant]+=charge;tenant.cpu+=charge;tenant.processed++;
        if(this.config.mode==='time')tenant.balance-=charge;
        const visualAt=Math.max(this.t,this.nextVisualAt);this.nextVisualAt=visualAt+OUTPUT_GAP;
        this.events.push({t:this.t,visualAt,landsAt:visualAt+OUTPUT,packet,delivered:false});
      });
      this.completedBatches++;
      this.receipt={number:this.completedBatches,t:this.t,perTenant,count:job.items.length,
        bytes:job.items.reduce((n,i)=>n+i.packet.bytes,0),cpu:perTenant.reduce((a,b)=>a+b,0)};
      worker.job=null;
    }
    step(dt=DT){
      this.t+=dt;
      // Refill once per elapsed interval; missed ticks are never silently lost.
      while(this.t+1e-8>=this.nextRefill){
        this.tenants.forEach(t=>t.balance=Math.min(this.cap(),t.balance+this.refillRate()*this.config.period));
        this.nextRefill+=this.config.period;
      }
      for(const tenant of this.tenants){
        while(tenant.nextArrival<=this.t+1e-8){
          const at=tenant.nextArrival;
          if(tenant.id===0||this.config.traffic!=='bursty'||at%10<4)this.spawn(tenant.id,at);
          tenant.nextArrival+=1/tenant.rate;
        }
      }
      for(const worker of this.workers){
        if(!worker.job)continue;
        let remaining=dt;
        while(worker.job&&remaining>1e-9){
          const job=worker.job,stage=job.stages[job.stage],used=Math.min(remaining,stage.duration-job.elapsed);
          job.elapsed+=used;remaining-=used;worker.busy+=used;
          if(stage.item>=0)job.items[stage.item].spent+=used;
          if(job.elapsed>=stage.duration-1e-8){job.elapsed=0;job.stage++;if(job.stage===job.stages.length)this.finish(worker);}
        }
      }
      // Bin arrivals are the only place that increments delivered totals.
      for(const event of this.events)if(!event.delivered&&this.t+1e-8>=event.landsAt){
        event.delivered=true;event.packet.deliveredAt=event.landsAt;
        this.assess(event.packet,event.landsAt<=event.packet.deadline+1e-8);
        this.tenants[event.packet.tenant].delivered++;
        this.deliveries.push({t:event.landsAt,packet:event.packet});
      }
      const pending=this.tenants.flatMap(t=>t.queue).concat(this.workers.flatMap(w=>w.job?w.job.items.map(i=>i.packet):[]),this.events.filter(e=>!e.delivered).map(e=>e.packet));
      pending.forEach(packet=>{if(this.t+1e-8>=packet.deadline)this.miss(packet);});
      this.workers.forEach((w,id)=>{if(!w.job)this.start(w,this.cores>1?id:null);});
      this.events=this.events.filter(e=>!e.delivered||this.t-e.landsAt<.2);
      this.deadlineEvents=this.deadlineEvents.filter(e=>this.t-e.t<.5);
      this.deliveries=this.deliveries.filter(e=>this.t-e.t<12);
    }
    run(seconds){for(let i=0;i<Math.round(seconds/DT);i++)this.step();return this;}
    metrics(){
      const victim=this.tenants[0];
      return {delivered:this.tenants.reduce((n,t)=>n+t.delivered,0),missed:victim.missed,
        arrived:victim.arrived,misses:victim.arrived?victim.missed/victim.arrived*100:0,
        utilization:this.workers.reduce((n,w)=>n+w.busy,0)/Math.max(DT,this.t*this.cores)*100};
    }
  }
  root.TailContagion={DT,DEADLINE,MAX_QUEUE,SETUP,INGRESS,OUTPUT,TENANTS,MODES,defaults,phasesFor,costOf,Sorter};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.TailContagion;
})(typeof window!=='undefined'?window:globalThis);
