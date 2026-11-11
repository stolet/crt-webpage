/* Readable choreography only. Never used for scoring, queues or deadlines. */
(function(root){
 'use strict';
 const roles=['free','app','busy','pause','sleep','lend'];
 class Illustration{
  constructor(cores,level){
   this.cores=[...cores];this.t=0;this.activeBurst=false;
   // One complete cycle per run. Stretch the minority phase to 25% so
   // waiting/waking remains visible; actual workload ratios are unchanged.
   this.period=10;
   this.duration=this.period*(level.duty>.5?.75:.25);
   this.idle=this.period-this.duration;
   this.offset=this.duration+this.idle/2;
   this.temps=Array(4).fill(20);this.packageHot=false;this.hotUntil=0;this.lastHotTime=0;
   this.lanes=cores.map(policy=>({role:roles.indexOf(policy),state:'free',idleSince:0,wakeStarted:0,wakeUntil:0}));
   this.advance(0,{temps:this.temps,packageHot:false});
  }
  advance(seconds,actual){
   const dt=Math.max(0,seconds-this.t);this.t=seconds;
   const position=(seconds+this.offset)%this.period;
   this.activeBurst=position<this.duration;
   const age=this.activeBurst?position:position-this.duration;
   this.lanes.forEach((lane,i)=>{
    const policy=this.cores[i];
    const delay=policy==='pause'?.25:policy==='sleep'?.9:policy==='lend'?.8:0;
    lane.wakeStarted=seconds-age;lane.wakeUntil=lane.wakeStarted+delay;
    lane.idleSince=seconds-age;
    lane.state=policy==='free'?'free':policy==='app'?'app':this.activeBurst?(age<delay?'waking':'working'):policy==='busy'?'spinning':policy==='pause'?'waiting':policy==='sleep'?'sleeping':age<.5?'handoff':'lending';
   });
   // Temperature follows measured simulation heat, with gradual visual changes.
   const blend=1-Math.exp(-dt/0.6);
   this.temps=this.temps.map((temp,i)=>temp+(actual.temps[i]-temp)*blend);
   // The simulation can enter and leave throttling between rendered frames.
   const hotTime=actual.hotTime||0,thermalEvent=actual.packageHot||hotTime>this.lastHotTime;
   this.lastHotTime=hotTime;
   if(thermalEvent)this.hotUntil=seconds+1;
   this.packageHot=thermalEvent||seconds<this.hotUntil;
  }
 }
 root.IdleIllustration=Illustration;
})(typeof window!=='undefined'?window:globalThis);
