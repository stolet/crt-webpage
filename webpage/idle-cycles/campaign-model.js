/* Deterministic campaign physics. Keep in agreement with the balance study. */
(function(root){
 'use strict';
 const P=root.IdleBalance,ROLES=['free','app','busy','pause','sleep','lend'];
 const INITIAL=['free','app','spinning','waiting','sleeping','handoff'];
 const LEVELS=[
  {title:'Level 1',burst:'Short',duty:.1,goal:'Maximize application throughput. Miss no more than 5% of packet deadlines.',intro:'In this level network bursts occur at the microsecond scale and the network core is often idle. Application throughput earns points. Keep missed packet deadlines at 5% or less.',hint:'Packets arrive only 10% of the time. Network cores that keep polling between bursts consume power that application cores could use.',strongHint:'Use Pause on network cores. It uses little power between bursts and resumes packet processing quickly. Then adjust how many cores run the app and the network.'},
  {title:'Level 2',burst:'Short',duty:.9,goal:'Deliver the most packets on time. Keep app throughput at 65 work / s or higher and deadline misses at 5% or less.',intro:'Network bursts are still at the microsecond scale, but the workload is more network intensive. Network cores are not often idle. On-time packets earn points; faster delivery earns a small bonus. Keep application throughput at 65 work / s or higher.',hint:'Packets arrive 90% of the time. Wake-up delays can make packets miss their deadlines. Check that the app still completes at least 65 work / s.',strongHint:'Use Busy polling for fast packet responses. Remove unnecessary core assignments to reduce power consumption, but keep enough App cores to reach 65 work / s.'},
  {title:'Level 3',burst:'Long',duty:.9,goal:'Maximize application throughput. Miss no more than 5% of packet deadlines.',intro:'Workload is still network intensive, but bursts now last 1 second. Application throughput earns points. Keep missed packet deadlines at 5% or less.',hint:'With longer network bursts, wake-up delays affect a smaller percentage of packets. Lent cores also process packets more slowly while reloading network data into their caches.',strongHint:'Try Block & sleep. Longer bursts reduce the percentage of packets affected by its wake-up delay. Pause can also score well. Lending adds cache-recovery delays.'},
  {title:'Level 4',burst:'Long',duty:.1,goal:'Maximize application throughput. Miss no more than 5% of packet deadlines.',intro:'Bursts are still at the scale of seconds, but now the workload is less network intensive. Application throughput earns points. Keep missed packet deadlines at 5% or less.',hint:'No packets arrive for 90% of this workload. During that time, a lent network core can run application work. Too many active cores can cause overheating.',strongHint:'Use Block & lend on some network cores and Block & sleep on others. Lending increases application work between bursts. Sleeping cores reduce power use and heat.'},
 ].map((level,i)=>Object.freeze({...level,id:i+1,duration:i<2?P.shortBurstSeconds:P.longBurstSeconds}));
 const approach=(value,target,amount)=>value<target?Math.min(target,value+amount):Math.max(target,value-amount);
 const initialCores=()=>Array(8).fill('app').concat(Array(8).fill('busy'));
 const validCores=value=>Array.isArray(value)&&value.length===16&&value.every(v=>ROLES.includes(v));
 class Machine{
  constructor(cores,level,options={}){
   if(!validCores(cores)||!LEVELS[level])throw new Error('Invalid campaign configuration');
   this.campaign=true;this.endless=Boolean(options.sandbox);this.cores=[...cores];this.level=level;this.dt=P.validationStepSeconds;
   this.totalTicks=this.endless?Infinity:Math.round(P.simulationSeconds/this.dt);this.tick=0;this.t=0;this.statsStart=0;
   this.duration=this.endless?[P.shortBurstSeconds,48,P.longBurstSeconds][options.burst??2]:LEVELS[level].duration;this.period=this.duration/(this.endless?(options.duty??.1):LEVELS[level].duty);this.offset=(this.period+this.duration)/2;
   this.seed=P.seed;this.credit=0;this.work=0;this.done=0;this.received=0;this.onTime=0;this.missed=0;this.latencySum=0;this.assessCursor=0;
   this.packageTemp=20;this.clockFactor=1;this.recovering=false;this.hotTime=0;this.maxTemp=20;this.power=0;this.demand=0;this.pressure=0;this.energy=0;
   this.packetIds=new Float64Array(131072);this.packetIds.fill(-1);this.arrivals=new Float64Array(131072);this.settled=new Uint8Array(131072);
   this.nets=[];this.temps=Array(4).fill(20);this.factors=Array(4).fill(1);this.corePower=Array(16).fill(0);this.requestedPower=Array(16).fill(0);
   this.powerEpochs=Array(16).fill(0);this.powerEvents=[];this.powerEventSequence=0;this.lastVisualTime=0;this.lastPhases=Array(16).fill('idle');
   this.history=[{t:0,work:0,done:0}];
   this.lanes=cores.map((policy,i)=>{
    const role=ROLES.indexOf(policy);if(role>=2)this.nets.push(i);
    return {role,state:INITIAL[role],queue:{length:0},packets:new Int32Array(2048),head:0,credit:0,idleSince:0,wakeStarted:0,wakeUntil:0,cacheUntil:0,borrowed:false};
   });
  }
  get activeBurst(){return this.tick<this.totalTicks&&(this.t+this.offset+1e-8)%this.period<this.duration;}
  get assessed(){return this.onTime+this.missed;}
  get pending(){return this.received-this.assessed;}
  get violations(){return this.assessed?100*this.missed/this.assessed:0;}
  get thermalLimited(){return this.clockFactor<1;}
  get packageHot(){return this.thermalLimited&&!this.recovering&&this.packageTemp>=80;}
  get finished(){return this.tick===this.totalTicks;}
  random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
  settle(until){
   while(this.assessCursor<this.received){
    const slot=this.assessCursor%this.arrivals.length;
    if(this.packetIds[slot]===this.assessCursor&&this.arrivals[slot]+P.packetDeadlineSeconds>until+1e-8)break;
    if(!this.settled[slot]){this.settled[slot]=1;this.missed++;}
    this.assessCursor++;
   }
  }
  advanceToTicks(target){
   target=Math.min(this.totalTicks,Math.max(this.tick,Math.floor(target)));
   const dt=this.dt,lanes=this.lanes,nets=this.nets;
   while(this.tick<target){
    const t=this.tick*dt,end=t+dt,active=(t+this.offset+1e-8)%this.period<this.duration;
    for(let ni=0;ni<nets.length;ni++){
     const l=lanes[nets[ni]],old=l.state;
     if(active||l.queue.length){
      if(old!=='working'&&old!=='waking'){
       l.wakeStarted=t;l.wakeUntil=t+(l.role===2?0:l.role===3?P.pauseWakeSeconds:P.blockWakeSeconds);
       if(l.role===5&&l.borrowed)l.cacheUntil=l.wakeUntil+P.lendCacheRecoverySeconds;
       l.borrowed=false;
      }
      l.state=t+1e-8<l.wakeUntil?'waking':'working';
     }else{
      if(old==='working'||old==='waking')l.idleSince=t;
      l.state=l.role===2?'spinning':l.role===3?'waiting':l.role===4?'sleeping':t-l.idleSince<P.lendHandoffSeconds?'handoff':'lending';
      if(l.state==='lending')l.borrowed=true;
     }
    }
    this.credit+=(active?P.peakPacketRate:0)*dt;
    while(this.credit>=1-1e-8){
     this.credit=Math.max(0,this.credit-1);const id=this.received++;
     const slot=id%this.arrivals.length;this.packetIds[slot]=id;this.arrivals[slot]=t;this.settled[slot]=0;
     if(!nets.length)continue;
     let best=nets[Math.floor(this.random()*nets.length)];
     for(let n=0;n<nets.length;n++)if(lanes[nets[n]].queue.length<lanes[best].queue.length)best=nets[n];
     const l=lanes[best];if(l.queue.length<2048){l.packets[(l.head+l.queue.length)%2048]=id;l.queue.length++;}
    }
    let demand=0,used=0,apps=0;
    for(let i=0;i<16;i++){
     const l=lanes[i];let requested=P.freeIdlePower;
     if(l.role===1||l.state==='working'||l.state==='spinning'||l.state==='lending'){requested=1;used++;}
     else if(l.state==='waiting'||l.state==='waking'||l.state==='handoff')requested=P.pauseIdlePower;
     else if(l.state==='sleeping')requested=P.sleepIdlePower;
     if(l.role===1||l.state==='lending')apps++;
     this.requestedPower[i]=requested;demand+=requested;
    }
    const targetTemp=used>=13?100:20+demand*5;
    this.packageTemp=approach(this.packageTemp,20+(targetTemp-20)*this.clockFactor,P.heatDegreesPerSimulatedSecond*dt);
    if(this.packageTemp>=100-1e-8){this.clockFactor=.5;this.recovering=false;}
    else if(this.clockFactor<1){if(this.packageTemp<=70)this.recovering=true;if(this.recovering)this.clockFactor=Math.min(1,this.clockFactor+.05*dt);}
    const factor=Math.min(P.maximumClockFactor,P.powerCap/demand)*this.clockFactor;
    this.work+=apps*20*factor*dt;this.energy+=demand*factor*dt;
    if(this.clockFactor<1)this.hotTime+=dt;
    this.maxTemp=Math.max(this.maxTemp,this.packageTemp);
    this.demand=demand;this.power=demand*factor;this.pressure=demand/P.powerCap;this.factors.fill(factor);
    for(let ni=0;ni<nets.length;ni++){
     const l=lanes[nets[ni]];if(l.state!=='working')continue;
     const cold=l.role===5&&t<l.cacheUntil?P.lendCacheRateMultiplier:1;
     l.credit+=20*factor*cold*dt;
     while(l.credit>=1-1e-8&&l.queue.length){
      const id=l.packets[l.head];l.head=(l.head+1)%2048;l.queue.length--;l.credit=Math.max(0,l.credit-1);this.done++;
      const slot=id%this.arrivals.length;
      if(this.packetIds[slot]===id&&!this.settled[slot]&&end-this.arrivals[slot]<=P.packetDeadlineSeconds+1e-8){this.settled[slot]=1;this.onTime++;this.latencySum+=end-this.arrivals[slot];}
     }
     if(!l.queue.length)l.credit=0;
    }
    this.settle(end);this.tick++;
    // Integrate quiet spans exactly, bounded by both physics events and the caller's frame.
    if(this.tick<target&&!active&&this.clockFactor===1){
     let empty=true,nextTime=target*dt;
     const phase=(end+this.offset+1e-8)%this.period;
     for(let n=0;n<nets.length;n++){const l=lanes[nets[n]];if(l.queue.length||l.state==='working'||l.state==='waking')empty=false;}
     if(empty&&phase>=this.duration){
      nextTime=Math.min(nextTime,end+this.period-phase);
      for(let n=0;n<nets.length;n++){const l=lanes[nets[n]];if(l.state==='handoff')nextTime=Math.min(nextTime,l.idleSince+P.lendHandoffSeconds);}
      if(targetTemp>=100&&this.packageTemp<100)nextTime=Math.min(nextTime,end+(100-this.packageTemp)/P.heatDegreesPerSimulatedSecond);
      const nextTick=Math.min(target,Math.floor((nextTime+1e-8)/dt));
      if(nextTick>this.tick){
       const skip=(nextTick-this.tick)*dt;
       this.work+=apps*20*factor*skip;this.energy+=demand*factor*skip;
       this.packageTemp=approach(this.packageTemp,targetTemp,P.heatDegreesPerSimulatedSecond*skip);
       this.maxTemp=Math.max(this.maxTemp,this.packageTemp);this.settle(nextTick*dt);this.tick=nextTick;
      }
     }
    }
    this.t=this.tick*dt;
   }
   return this;
  }
  snapshot(){
   const span=this.t-this.lastVisualTime;this.lastVisualTime=this.t;
   const released=[],claimed=[];
   for(let i=0;i<16;i++){
    const l=this.lanes[i],phase=l.state==='working'?'net':l.state==='waking'?'wake':'idle';
    this.corePower[i]=this.requestedPower[i]*this.factors[0];
    if(phase!==this.lastPhases[i]){
     this.powerEpochs[i]++;
     if(this.lastPhases[i]==='net'&&phase==='idle'&&l.role>=3)released.push(i);
     if(phase==='net'&&l.role>=3)claimed.push(i);
    }
    this.lastPhases[i]=phase;
   }
   if(released.length||claimed.length){this.powerEvents.push({id:++this.powerEventSequence,t:this.t,released,networkStarted:claimed,epochs:[...this.powerEpochs]});if(this.powerEvents.length>8)this.powerEvents.shift();}
   for(let die=0;die<4;die++){
    let demand=0;for(let i=die*4;i<die*4+4;i++)demand+=this.requestedPower[i];
    const temp=Math.min(100,20+demand*15*this.clockFactor+Math.max(0,this.packageTemp-80));
    this.temps[die]=approach(this.temps[die],temp,P.heatDegreesPerSimulatedSecond*span);
   }
  }
  rates(){const span=this.t-this.statsStart;return span?{app:this.work/span,network:(this.endless?this.done:this.onTime)/span}:{app:0,network:0};}
 }
 function evaluate(machine){
  const elapsed=Math.max(machine.t,P.validationStepSeconds),appRate=machine.work/elapsed;
  const miss=machine.assessed?machine.missed/machine.assessed:null;
  const penalty=Math.exp(-P.violationPenaltyExponent*Math.max(0,(miss||0)-P.missLimit));
  const meanLatency=machine.onTime?machine.latencySum/machine.onTime:P.packetDeadlineSeconds;
  const headroom=Math.max(0,Math.min(1,1-meanLatency/P.packetDeadlineSeconds));
  let raw=machine.work/P.simulationSeconds*penalty;
  if(machine.level===1)raw=machine.onTime/P.simulationSeconds*((1-P.latencyBonusWeight)+P.latencyBonusWeight*headroom)*Math.min(1,appRate/P.level2MinimumApplicationRate)**P.applicationRequirementExponent*penalty;
  const score=Math.max(0,Math.min(1000,Math.floor(1000*raw/P.scoreReferences[String(machine.level+1)]+.5)));
  const qualified=miss!==null&&miss<=P.missLimit+1e-9&&(machine.level!==1||appRate>=P.level2MinimumApplicationRate-1e-6);
  const medal=qualified&&score>=P.medalThresholds.gold?'gold':qualified&&score>=P.medalThresholds.silver?'silver':score>=P.medalThresholds.bronze?'bronze':'none';
  return {score,medal,qualified,miss,appRate,onTimeRate:machine.onTime/elapsed,meanLatency,headroom,raw};
 }
 const rank={none:0,bronze:1,silver:2,gold:3};
 class Progress{
  constructor(){
   this.state={completed:Array(4).fill(false),scores:Array(4).fill(0),medals:Array(4).fill('none'),level:0,cores:initialCores(),tutorialSeen:false,mode:'campaign',sandboxBurst:2,sandboxDuty:1};
  }
  get sandboxUnlocked(){return this.state.completed.every(Boolean);}
  get total(){return this.state.scores.reduce((sum,n)=>sum+n,0);}
  record(level,result){
   const record=!this.state.completed[level]||result.score>this.state.scores[level];
   this.state.completed[level]=true;this.state.scores[level]=Math.max(this.state.scores[level],result.score);
   if(rank[result.medal]>rank[this.state.medals[level]])this.state.medals[level]=result.medal;
   return record;
  }
 }
 root.IdleCampaign={P,LEVELS,Machine,evaluate,Progress,initialCores,validCores};
})(typeof window!=='undefined'?window:globalThis);
