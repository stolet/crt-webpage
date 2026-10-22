/* Shared wire geometry and arc-length motion. All distances are canvas pixels. */
(function(root){
 'use strict';
 const SPEED=216,ARRIVAL_HOLD=.25,STAGE_GAP=.1;
 function route(points){
  const path=points.map(p=>[...p]),lengths=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));
  return {path,lengths,length:lengths.reduce((sum,n)=>sum+n,0)};
 }
 function pointAt(wire,distance){
  let remaining=Math.max(0,Math.min(wire.length,distance));
  for(let i=0;i<wire.lengths.length;i++){
   const length=wire.lengths[i];
   if(remaining<=length||i===wire.lengths.length-1){
    const f=length?remaining/length:0,a=wire.path[i],b=wire.path[i+1];return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
   }
   remaining-=length;
  }
  return wire.path[0];
 }
 function duration(routes){return Math.max(0,...routes.map(r=>r.wire.length))/SPEED+ARRIVAL_HOLD+STAGE_GAP;}
 root.PowerMotion={SPEED,ARRIVAL_HOLD,route,pointAt,duration};
})(typeof window!=='undefined'?window:globalThis);
