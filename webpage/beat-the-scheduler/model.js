/* Round-number teaching model, deliberately paced in exhibit seconds. */
(function(root){
 'use strict';
 const DT=.02, CAP=8, WORK=20, DEADLINE=2, WINDOW=4;
 const BURSTS=[{name:'Short',period:13.6,duration:4},{name:'Medium',period:27.2,duration:8},{name:'Long',period:40.8,duration:12}];
 const POLICIES={app:'App',busy:'Busy',pause:'Pause',lend:'Block & lend',sleep:'Block & sleep'};
 function defaults(){return Array.from({length:16},(_,i)=>i%4===3?'pause':'app');}
 function approach(value,target,speed){return value<target?Math.min(target,value+speed*DT):Math.max(target,value-speed*DT);}
 class Machine{
  constructor(cores=defaults(),burst=1){
   this.cores=[...cores];this.burst=Number(burst);this.t=0;this.work=0;this.received=0;this.done=0;this.onTime=0;this.assessed=0;this.missed=0;
   this.power=0;this.demand=0;this.pressure=0;this.packageTemp=20;this.temps=Array(4).fill(20);this.thermalLimited=false;this.clockFactor=1;this.recovering=false;
   this.requestedPower=Array(16).fill(0);this.hasPowerSnapshot=false;this.powerEvents=[];this.powerEventSequence=0;this.powerEpochs=Array(16).fill(0);
   this.corePower=Array(16).fill(0);this.factors=Array(4).fill(1);this.activeByDie=Array(4).fill(0);this.appByDie=Array(4).fill(0);
   this.credit=0;this.deadlines=[];this.seed=4242;this.history=[{t:0,work:0,done:0}];
   this.lanes=cores.map(policy=>({queue:[],credit:0,wakeUntil:0,wakeStarted:0,idleSince:0,state:policy==='app'?'app':policy==='busy'?'spinning':policy==='pause'?'waiting':policy==='lend'?'handoff':'sleeping'}));
  }
  get period(){return BURSTS[this.burst].period;}
  // Keep 4/8/12-second bursts; quiet gaps are 60% of their original length.
  // The initial four-second introduction is unchanged.
  get activeBurst(){return (this.t+this.period-4)%this.period<BURSTS[this.burst].duration;}
  get violations(){return this.assessed?this.missed/this.assessed*100:0;}
  get percent(){return this.assessed?this.onTime/this.assessed*100:0;}
  get networkCount(){return this.cores.filter(c=>c!=='app').length;}
  random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
  step(){
   const t=this.t,end=t+DT,active=this.activeBurst,net=this.cores.map((c,i)=>c==='app'?-1:i).filter(i=>i>=0);
   const previousStates=this.lanes.map(l=>l.state);
   for(const i of net){
    const l=this.lanes[i],policy=this.cores[i];
    if(active||l.queue.length){
     if(['sleeping','lending','handoff','waiting','spinning'].includes(l.state)){
      l.wakeStarted=t;l.wakeUntil=t+(policy==='busy'?0:policy==='pause'?.8:3);
     }
     l.state=t+1e-8<l.wakeUntil?'waking':'working';
    }else{
     if(['working','waking'].includes(l.state))l.idleSince=t;
     l.state=policy==='busy'?'spinning':policy==='pause'?'waiting':policy==='sleep'?'sleeping':t-l.idleSince<1?'handoff':'lending';
    }
   }
   this.credit+=(active?20:0)*DT;
   while(this.credit>=1-1e-8){
    this.credit=Math.max(0,this.credit-1);this.received++;
    const packet={t,settled:false};this.deadlines.push(packet);
    if(!net.length)continue;
    let best=net[Math.floor(this.random()*net.length)];
    for(const i of net)if(this.lanes[i].queue.length<this.lanes[best].queue.length)best=i;
    if(this.lanes[best].queue.length<1024)this.lanes[best].queue.push(packet);
   }
   const previousDemand=this.demand,previousRequested=this.requestedPower,previousFactors=this.factors;
   const used=Array(4).fill(0),apps=Array(4).fill(0),requested=Array(16).fill(0);
   this.cores.forEach((policy,i)=>{
    const state=this.lanes[i].state,die=i>>2;
    // Equal shares: app, useful networking, and busy polling each use one unit.
    if(policy==='app'||['working','spinning','lending'].includes(state)){requested[i]=1;used[die]++;}
    if(policy==='app'||state==='lending')apps[die]++;
   });
   this.activeByDie=used;this.appByDie=apps;this.demand=used.reduce((a,b)=>a+b,0);
   this.power=Math.min(CAP,this.demand);this.pressure=this.demand/CAP;
   const share=this.demand>CAP?CAP/this.demand:1;
   this.corePower=requested.map(p=>p*share);
   // At least 13/16 active cores (80%) for long enough to reach thermal limit.
   const fullSpeedTarget=this.demand>=13?100:20+this.demand*5;
   const packageTarget=20+(fullSpeedTarget-20)*this.clockFactor;
   this.packageTemp=approach(this.packageTemp,packageTarget,2);
   if(this.packageTemp>=100-1e-8){this.clockFactor=.5;this.recovering=false;}
   else if(this.clockFactor<1){
    // First reclaim 30 heat units of headroom, then raise clocks slowly.
    if(this.packageTemp<=70)this.recovering=true;
    if(this.recovering)this.clockFactor=Math.min(1,this.clockFactor+.05*DT);
   }
   this.thermalLimited=this.clockFactor<1;
   if(!this.thermalLimited)this.recovering=false;
   for(let die=0;die<4;die++){
    // A saturated die alone tops out at 80: orange and sweaty, never throttled.
    const target=Math.min(100,20+used[die]*15*this.clockFactor+Math.max(0,this.packageTemp-80));
    this.temps[die]=approach(this.temps[die],target,2);
   }
   // Thermal throttling first halves the shared budget, then recovers. Power sharing is
   // exactly 20 work/core up to eight cores, and 160 total work thereafter.
   this.factors=Array(4).fill(share*this.clockFactor);
   // A transition token prevents a delayed animation from reaching a core in a
   // later burst. Handoff -> borrowed app remains the same network-idle epoch;
   // starting a wake invalidates that epoch immediately.
   const phase=state=>state==='working'?'net':state==='waking'?'wake':'idle';
   net.forEach(i=>{if(phase(previousStates[i])!==phase(this.lanes[i].state))this.powerEpochs[i]++;});
   if(this.hasPowerSnapshot){
    const released=[],claimed=[],beneficiaries=[];
    requested.forEach((p,i)=>{
     if(this.cores[i]!=='app'&&this.cores[i]!=='busy'){
      if(previousStates[i]==='working'&&phase(this.lanes[i].state)==='idle'&&previousRequested[i]&&!p)released.push(i);
      if(previousStates[i]==='waking'&&this.lanes[i].state==='working'&&!previousRequested[i]&&p)claimed.push(i);
     }
     if(previousRequested[i]&&p&&(this.cores[i]==='app'||this.lanes[i].state==='lending')&&this.factors[i>>2]>previousFactors[i>>2]+1e-8)beneficiaries.push(i);
    });
    // Busy already owns a share. Borrowed app execution and thermal recovery
    // are not network power transfers either.
    if(released.length||claimed.length)this.powerEvents.push({id:++this.powerEventSequence,t:end,released,claimed,networkStarted:[...claimed],epochs:[...this.powerEpochs],
     beneficiaries:released.length&&previousDemand>CAP&&this.demand<previousDemand?beneficiaries:[],
     before:previousDemand,after:this.demand,beforeFactors:[...previousFactors],beforeShare:Math.min(1,CAP/Math.max(1,previousDemand))});
   }
   this.requestedPower=requested;this.hasPowerSnapshot=true;
   this.powerEvents=this.powerEvents.filter(event=>end-event.t<3).slice(-24);
   this.work+=apps.reduce((a,b)=>a+b,0)*WORK*this.factors[0]*DT;
   for(const i of net){
    const l=this.lanes[i];if(l.state!=='working')continue;
    l.credit+=20*this.factors[i>>2]*DT;
    while(l.credit>=1-1e-8&&l.queue.length){
     const packet=l.queue.shift();l.credit=Math.max(0,l.credit-1);this.done++;
     if(!packet.settled&&end-packet.t<=DEADLINE+1e-8){packet.settled=true;this.onTime++;this.assessed++;}
    }
    if(!l.queue.length)l.credit=0;
   }
   while(this.deadlines.length&&this.deadlines[0].t+DEADLINE<=end+1e-8){
    const packet=this.deadlines.shift();if(!packet.settled){packet.settled=true;this.missed++;this.assessed++;}
   }
   this.t=end;this.history.push({t:this.t,work:this.work,done:this.done});
   while(this.history.length>1&&this.history[1].t<=this.t-WINDOW)this.history.shift();
  }
  rates(){const a=this.history[0],elapsed=this.t-a.t;if(elapsed<DT)return {app:0,network:0};return {app:(this.work-a.work)/elapsed,network:(this.done-a.done)/elapsed};}
 }
 root.SchedulerModel={DT,CAP,WORK,DEADLINE,WINDOW,BURSTS,POLICIES,Machine,defaults};
})(typeof window!=='undefined'?window:globalThis);
