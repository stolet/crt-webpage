/* Calibrated teaching model, not a literal token-bucket implementation.
 * Policy curves choose a service calendar and a deterministic distribution of
 * scheduling waits. The live clock then executes every packet and CPU phase:
 * counters are event counts and utilization is measured busy / reserved time.
 * No policy curve is substituted into the displayed live metrics. */
(function(root) {
  'use strict';
  // Leave room in the 4 µs deadline for ingress, a complete heavy batch, and
  // output. Apply the same CPU-time scale to every policy and every receipt.
  const CPU_SCALE = .6;
  const DT = 1 / 40, DEADLINE = 4, MAX_QUEUE = 400, SETUP = .4 * CPU_SCALE;
  const INGRESS = .65, OUTPUT = .5, OUTPUT_GAP = .55;
  const TENANTS = [{name:'Victim',color:'#009E73'},{name:'Adversary',color:'#DC267F'}];
  const MODES = {
    packets:{name:'Packet limit',description:'Equal packet sizes suit a packet allowance. Larger packets and extra processing make packet counts a weaker guide to CPU work.'},
    bytes:{name:'Byte limit',description:'A byte allowance handles unequal packet sizes better. Extra processing still consumes CPU time without adding bytes.'},
    time:{name:'Virtuoso',description:'Charge actual CPU time. Small caps and frequent refills protect Victim; larger caps trade more utilization for more interference.'},
    dedicated:{name:'Dedicated',description:'Each sender reserves a private datapath core. Victim sees fewer deadline misses, but reserving twice the capacity halves utilization.'}
  };
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  function defaults(){return {mode:'packets',size:64,extra:3,batch:4,traffic:'steady',adversaryLoad:1,allowance:.7,cap:1,period:1};}
  function phasesFor(packet){
    const result=[{name:'Open & identify',kind:'identify',duration:.07},{name:'Read label',kind:'scan',duration:.12},
      {name:'Copy payload',kind:'copy',duration:.08+1.2*packet.bytes/1024}];
    for(let i=0;i<packet.extra;i++)result.push({name:'Extra lookup '+(i+1),kind:'inspect',duration:.26,pass:i});
    result.push({name:'Stamp packet',kind:'stamp',duration:.1});
    return result.map(phase=>({...phase,duration:phase.duration*CPU_SCALE}));
  }
  function costOf(packet){return phasesFor(packet).reduce((n,p)=>n+p.duration,0);}
  // These are calibration inputs to the trace generator, not observed metrics.
  // CPU demand is held comparable across workloads; heavier packets take longer
  // and therefore fewer fit into the same service share. Units remain CPU µs.
  function policyProfile(config){
    const c={...defaults(),...config}, a=clamp(c.allowance,.1,1);
    const pressure=profile=>({...profile,tailProbability:.01+(profile.tailProbability-.01)*clamp(c.adversaryLoad,0,1)});
    if(c.mode==='dedicated')return {serviceShare:.36,tailProbability:.01};
    if(c.mode==='time'){
      const small=(clamp(c.cap,1,5)-1)/4, large=(clamp(c.cap,5,20)-5)/15;
      const refill=(clamp(c.period,2,20)-2)/18;
      return pressure({serviceShare:.72+.05*small+.15*large-.06*refill,
        tailProbability:.04+.26*large+.22*refill});
    }
    const different=Math.log2(c.size/64)/4, checks=c.extra/4, burst=c.traffic==='bursty'?.01:0;
    const worst=c.mode==='packets' ? .225+.02*checks+.06*different+burst
      : .285+.02*checks-.08*different+burst;
    return pressure({serviceShare:.72*a,tailProbability:.02+(Math.min(.30,worst)-.02)*a});
  }
  function sample(index){return (index*.6180339887498949+.37)%1;}
  class Sorter {
    constructor(config={}){
      this.config={...defaults(),...config,batch:4};
      if(!Object.hasOwn(MODES,this.config.mode))throw Error('Unknown policy');
      if(![64,256,1024].includes(this.config.size))throw Error('Unknown packet size');
      this.config.cap=clamp(this.config.cap,1,20);this.config.period=clamp(this.config.period,1,20);
      this.config.allowance=clamp(this.config.allowance,.1,1);
      this.config.adversaryLoad=clamp(this.config.adversaryLoad,0,1);
      this.profile=policyProfile(this.config);
      this.t=0;this.sequence=0;this.cycle=0;this.nextCycle=.9;this.completedBatches=0;
      this.receipt=null;this.deliveries=[];this.events=[];this.deadlineEvents=[];this.nextVisualAt=0;this.plannedVisualAt=0;
      this.planned=[];
      this.tenants=TENANTS.map((tenant,id)=>({...tenant,id,queue:[],arrived:0,processed:0,
        delivered:0,dropped:0,bytes:0,cpu:0,admitted:0,chargedBytes:0,
        ...(id===0?{assessed:0,missed:0}:{})}));
      this.workers=Array.from({length:this.config.mode==='dedicated'?2:1},()=>({job:null,busy:0}));
      this.pairCost=2*SETUP+costOf({bytes:64,extra:0})+costOf({bytes:this.config.size,extra:this.config.extra});
      this.cyclePeriod=this.pairCost/(this.profile.serviceShare*this.cores);
      this.plan();this.arrive();
    }
    get cores(){return this.workers.length;}
    cap(){return this.config.cap;}
    maxAllowance(){
      const packetsPerMicrosecond=.72/this.pairCost;
      return this.config.mode==='bytes'?packetsPerMicrosecond*this.config.size:packetsPerMicrosecond;
    }
    allowanceRate(){return this.maxAllowance()*this.config.allowance;}
    adversaryRate(){return this.profile.serviceShare*this.cores/this.pairCost*this.config.adversaryLoad;}
    plan(){
      // Rearrange four pairs of work without changing their total CPU demand or
      // service period. Every third group coalesces four adversary packets into
      // one full batch; the other groups keep the smaller mixed batches.
      while(this.nextCycle<this.t+DEADLINE+1){
        const groupIndex=Math.floor(this.cycle/4), groupStart=this.nextCycle, full=groupIndex%3===0;
        // Thin only the adversary's offered work. The victim keeps four packets
        // per service group, and full-load allowance rates stay unchanged.
        const active=this.config.adversaryLoad>0&&(groupIndex===0||sample(groupIndex)<this.config.adversaryLoad);
        const victimCost=SETUP+costOf({bytes:64,extra:0}), adversaryCost=this.pairCost-victimCost;
        const batches=[];
        const add=(tenants,start,worker=0)=>{
          const entries=tenants.filter(tenant=>tenant===0||active).map(tenant=>({tenant,index:tenant===0?++this.cycle:null,releaseAt:start}));
          const cost=tenants.reduce((sum,tenant)=>sum+(tenant===0?victimCost:adversaryCost),0);
          const actualCost=entries.reduce((sum,entry)=>sum+(entry.tenant===0?victimCost:adversaryCost),0);
          if(entries.length)batches.push({entries,start,end:start+actualCost,worker});
          return cost;
        };
        if(this.cores===1){
          let start=groupStart;
          if(full&&active){
            start+=add([1,1,1,1],start)/this.profile.serviceShare;
            for(let n=0;n<4;n++)start+=add([0],start)/this.profile.serviceShare;
          }else{
            for(let n=0;n<4;n++)start+=add([0,1],start)/this.profile.serviceShare;
          }
        }else{
          for(let n=0;n<4;n++)add([0],groupStart+n*this.cyclePeriod);
          if(full)add([1,1,1,1],groupStart,1);
          else for(let n=0;n<4;n++)add([1],groupStart+n*this.cyclePeriod,1);
        }
        // Predict the same serialized output calendar that finish() executes.
        // Include batch holding AND exit-queue waiting when calibrating arrivals,
        // so grouping changes the visible bursts rather than the policy targets.
        batches.sort((a,b)=>a.end-b.end||a.worker-b.worker);
        for(const batch of batches)for(const entry of batch.entries){
          const visualAt=Math.max(batch.end,this.plannedVisualAt);
          this.plannedVisualAt=visualAt+OUTPUT_GAP;
          let at;
          if(entry.tenant===0){
            const q=sample(entry.index), tail=this.profile.tailProbability;
            const base=INGRESS+visualAt-batch.start+OUTPUT;
            const normalWait=Math.min(.65,DEADLINE-base-.25);
            const wait=q<tail ? DEADLINE-base+.20+.40*q/tail : .10+normalWait*(q-tail)/(1-tail);
            at=Math.max(.25,batch.start-INGRESS-wait);
          }else at=Math.max(.4,(this.config.traffic==='bursty'?groupStart:batch.start)-INGRESS);
          this.planned.push({...entry,at});
        }
        this.nextCycle=groupStart+4*this.cyclePeriod;
      }
      this.planned.sort((a,b)=>a.at-b.at||a.tenant-b.tenant);
    }
    arrive(){
      while(this.planned[0]?.at<=this.t+1e-8){
        const entry=this.planned.shift();this.spawn(entry.tenant,entry.at,entry.releaseAt);
      }
    }
    spawn(id,at=this.t,releaseAt=at+INGRESS){
      const tenant=this.tenants[id],packet={id:++this.sequence,tenant:id,bytes:id===1?this.config.size:64,
        extra:id===1?this.config.extra:0,arrived:at,readyAt:at+INGRESS,releaseAt,
        deadline:id===0?at+DEADLINE:null,settled:id!==0,missedAt:null,processedAt:null,releasedAt:null,deliveredAt:null};
      tenant.arrived++;
      if(tenant.queue.length>=MAX_QUEUE){tenant.dropped++;this.miss(packet);}
      else {tenant.queue.push(packet);tenant.queue.sort((a,b)=>a.releaseAt-b.releaseAt||a.id-b.id);}
      return packet;
    }
    miss(packet){
      if(packet.tenant!==0||packet.settled)return;
      packet.settled=true;packet.missedAt=this.t;
      const tenant=this.tenants[0];tenant.missed++;tenant.assessed++;
      this.deadlineEvents.push({t:this.t,packet});
    }
    assess(packet,onTime){
      if(packet.tenant!==0||packet.settled)return;
      if(!onTime){this.miss(packet);return;}
      packet.settled=true;this.tenants[0].assessed++;
    }
    eligible(tenant,at=this.t){
      const packet=tenant.queue[0];
      return !!packet&&packet.readyAt<=at+1e-8&&packet.releaseAt<=at+1e-8;
    }
    start(worker,onlyTenant=null,at=this.t){
      const items=[],candidates=onlyTenant===null?[0,1]:[onlyTenant];
      for(let n=0;n<4;n++){
        const id=candidates.find(i=>this.eligible(this.tenants[i],at));
        if(id===undefined)break;
        const tenant=this.tenants[id],packet=tenant.queue.shift();
        tenant.admitted++;tenant.chargedBytes+=packet.bytes;
        items.push({packet,spent:0});
      }
      if(!items.length)return;
      const stages=[];
      items.forEach((item,i)=>{
        // Every admitted packet pays its actual dispatch and processing costs.
        // Grouping packets changes the receipt, never the amount of CPU work.
        stages.push({name:i?'Load next packet':'Load batch',kind:i?'dispatch':'setup',duration:SETUP,item:i});
        phasesFor(item.packet).forEach(phase=>stages.push({...phase,item:i}));
      });
      worker.job={items,stages,stage:0,elapsed:0,started:at,total:stages.reduce((n,s)=>n+s.duration,0)};
    }
    complete(item,at){
      const packet=item.packet,tenant=this.tenants[packet.tenant];
      item.completed=true;packet.processedAt=at;
      tenant.cpu+=item.spent;tenant.processed++;tenant.bytes+=packet.bytes;
    }
    finish(worker,at){
      const job=worker.job,perTenant=[0,0];
      job.items.forEach(item=>perTenant[item.packet.tenant]+=item.spent);
      this.completedBatches++;
      // Processing completion only returns a packet to its batch slot. Release
      // every packet together after the last stage; serialize output afterward.
      job.items.forEach(({packet})=>{
        packet.releasedAt=at;
        const visualAt=Math.max(at,this.nextVisualAt);this.nextVisualAt=visualAt+OUTPUT_GAP;
        this.events.push({t:at,visualAt,landsAt:visualAt+OUTPUT,packet,batch:this.completedBatches,delivered:false});
      });
      this.receipt={number:this.completedBatches,t:at,perTenant,count:job.items.length,
        bytes:job.items.reduce((n,item)=>n+item.packet.bytes,0),cpu:perTenant.reduce((a,b)=>a+b,0)};
      worker.job=null;
    }
    step(dt=DT){
      const end=this.t+dt;
      this.plan();this.arrive();
      this.workers.forEach((worker,id)=>{
        let at=this.t;
        while(at<end-1e-9){
          if(!worker.job)this.start(worker,this.cores>1?id:null,at);
          if(!worker.job)break;
          const job=worker.job,stage=job.stages[job.stage],used=Math.min(end-at,stage.duration-job.elapsed);
          job.elapsed+=used;at+=used;worker.busy+=used;job.items[stage.item].spent+=used;
          if(job.elapsed>=stage.duration-1e-8){
            if(stage.kind==='stamp')this.complete(job.items[stage.item],at);
            job.elapsed=0;job.stage++;
            if(job.stage===job.stages.length)this.finish(worker,at);
          }
        }
      });
      this.t=end;this.arrive();
      for(const event of this.events)if(!event.delivered&&this.t+1e-8>=event.landsAt){
        event.delivered=true;event.packet.deliveredAt=event.landsAt;
        this.assess(event.packet,event.landsAt<=event.packet.deadline+1e-8);
        this.tenants[event.packet.tenant].delivered++;
        this.deliveries.push({t:event.landsAt,packet:event.packet});
      }
      const pending=this.tenants[0].queue.concat(this.workers.flatMap(worker=>worker.job?worker.job.items.map(item=>item.packet):[]),
        this.events.filter(event=>!event.delivered).map(event=>event.packet));
      pending.forEach(packet=>{if(packet.tenant===0&&this.t+1e-8>=packet.deadline)this.miss(packet);});
      this.events=this.events.filter(event=>!event.delivered||this.t-event.landsAt<.2);
      this.deadlineEvents=this.deadlineEvents.filter(event=>this.t-event.t<.5);
      this.deliveries=this.deliveries.filter(event=>this.t-event.t<12);
    }
    run(microseconds){for(let i=0;i<Math.round(microseconds/DT);i++)this.step();return this;}
    metrics(){
      const victim=this.tenants[0];
      return {delivered:this.tenants.reduce((n,tenant)=>n+tenant.delivered,0),missed:victim.missed,
        arrived:victim.arrived,misses:victim.arrived?victim.missed/victim.arrived*100:0,
        utilization:this.workers.reduce((n,worker)=>n+worker.busy,0)/Math.max(DT,this.t*this.cores)*100};
    }
  }
  root.TailContagion={DT,DEADLINE,MAX_QUEUE,SETUP,INGRESS,OUTPUT,TENANTS,MODES,defaults,phasesFor,costOf,policyProfile,Sorter};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.TailContagion;
})(typeof window!=='undefined'?window:globalThis);
