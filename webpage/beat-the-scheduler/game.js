// Palette source: behemoth-paper/plots/colours.gnuplot.
(function(){
 'use strict';
 const {Machine,DT,CAP,BURSTS,POLICIES,defaults}=SchedulerModel,$=id=>document.getElementById(id);
 const {SPEED:POWER_SPEED,ARRIVAL_HOLD,route:powerRoute,pointAt:powerPoint,duration:powerDuration}=PowerMotion;
 const canvas=$('chip'),ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let cores=defaults(),strategy='pause',role='network',machine=new Machine(cores,1),playing=true,previous=0,accumulator=0,lastUI=0,lastDraw=0,positions=[],compact=false,currentTransfer=null,powerBatches=[],lastPowerEvent=0,lastNetworkClaim=0;
 const C={bg:'#1D1C30',grid:'#27243A',line:'#514A70',app:'#009E73',network:'#648FFF',pause:'#B6A7F6',sleep:'#A3B7EA',ice:'#BCD0FF',ink:'#141426',muted:'#B9B2CC',warm:'#FFB000',hot:'#DC267F'};
 const flame=[['....r...','...ry...','..ryyr..','..ryyrr.','.rywyyr.','.rywyyr.','..ryyr..','...rr...'],['...r....','...yr...','..ryr...','..ryyr..','.ryyyrr.','.rywyyr.','..yyyrr.','...rr...']];
 const snow=['...b....','.b.b.b..','..bbb...','bbbbbbb.','..bbb...','.b.b.b..','...b....','........'];
 const zGlyph=['bbbbb','...b.','..b..','.b...','bbbbb'];
 const drop=['..b..','.bbb.','.bbb.','bbbbb','.bbb.'];
 function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
 function text(t,x,y,c=C.muted,size=9){ctx.fillStyle=c;ctx.font=`${size}px monospace`;ctx.fillText(t,Math.round(x),Math.round(y));}
 function centered(t,x,y,c,size=9){ctx.fillStyle=c;ctx.font=`${size}px monospace`;ctx.fillText(t,Math.round(x-ctx.measureText(t).width/2),Math.round(y));}
 function sprite(data,x,y,scale,colors){data.forEach((row,j)=>[...row].forEach((v,i)=>{if(colors[v])rect(x+i*scale,y+j*scale,scale,scale,colors[v]);}));}
 function mix(a,b,f){const parse=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)),aa=parse(a),bb=parse(b);return '#'+aa.map((v,i)=>Math.round(v+(bb[i]-v)*Math.max(0,Math.min(1,f))).toString(16).padStart(2,'0')).join('');}
 function isUsed(i){return cores[i]==='app'||['working','spinning','lending'].includes(machine.lanes[i].state);}
 function layout(){
  const oldWidth=canvas.width,oldHeight=canvas.height;
  compact=canvas.parentElement.clientWidth<600;canvas.width=compact?400:800;canvas.height=compact?550:392;
  positions=cores.map((_,i)=>{const die=i>>2,j=i%4;return compact?{x:12+(die%2)*194+20+(j%2)*78,y:34+Math.floor(die/2)*240+50+Math.floor(j/2)*98}:{x:24+(die%2)*388+24+j*86,y:42+Math.floor(die/2)*156+50};});
  if(oldWidth!==canvas.width||oldHeight!==canvas.height){
   const batch=powerBatches[0];
   if(batch?.started){batch.stages.forEach(stage=>{stage.routes=null;});batch.nextStart=machine.t;}
  }
  $('core-buttons').replaceChildren();
  cores.forEach((_,i)=>{
   const b=document.createElement('button'),p=positions[i];b.className='core-button';b.dataset.core=i;
   b.style.left=(p.x-5)/canvas.width*100+'%';b.style.top=(p.y-13)/canvas.height*100+'%';b.style.width=64/canvas.width*100+'%';b.style.height=83/canvas.height*100+'%';
   b.addEventListener('click',()=>paint(i));$('core-buttons').appendChild(b);
  });updateLabels();draw();
 }
 function updateLabels(){
  document.querySelectorAll('[data-core]').forEach(b=>{
   const i=Number(b.dataset.core),state=machine.lanes[i].state;
   b.setAttribute('aria-label',`Core ${i+1}, die ${(i>>2)+1}: ${POLICIES[cores[i]]}, ${state}. Paint ${role==='app'?'App':POLICIES[strategy]}.`);
   b.title=`${POLICIES[cores[i]]} · ${state==='lending'?'running borrowed app work':state}`;
  });
  const n=cores.filter(c=>c!=='app').length;$('core-count').textContent=`${16-n} app · ${n} network`;
 }
 function announce(t){$('announcement').textContent=t;}
 function restart(preserveHeat=true){
  const old=machine;machine=new Machine(cores,$('burst').value);
  if(preserveHeat){machine.t=old.t;machine.packageTemp=old.packageTemp;machine.temps=[...old.temps];machine.thermalLimited=old.thermalLimited;machine.clockFactor=old.clockFactor;machine.recovering=old.recovering;machine.history=[{t:machine.t,work:0,done:0}];machine.lanes.forEach(l=>l.idleSince=machine.t);
  }
  // Configuration changes establish a fresh baseline; old roles, queues and
  // animation destinations must never leak into the new machine.
  powerBatches=[];currentTransfer=null;lastPowerEvent=0;lastNetworkClaim=0;
  machine.step();
  accumulator=0;updateLabels();updateUI();draw();
 }
 function paint(i){cores[i]=role==='app'?'app':strategy;restart();announce(`Core ${i+1}: ${POLICIES[cores[i]]}.`);}
 function updateSelection(){
  document.querySelectorAll('.range-labels span').forEach((el,i)=>el.classList.toggle('active',i===Number($('burst').value)));
  document.querySelectorAll('[data-role]').forEach(b=>{const selected=b.dataset.role===role;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  document.querySelectorAll('[data-policy]').forEach(b=>{const selected=b.dataset.policy===strategy;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});updateLabels();
 }
 function pauseIcon(x,y){rect(x+20,y+31,4,8,C.ink);rect(x+28,y+31,4,8,C.ink);}
 function spinner(x,y){
  const points=[[25,30],[30,33],[25,36],[20,33]],active=reduced?0:Math.floor(machine.t/0.8)%4;
  points.forEach(([dx,dy],i)=>rect(x+dx,y+dy,3,3,i===active?C.ink:'#ffffff55'));
 }
 function wakeClock(x,y,l){
  // Both clocks have the same geometry; one fills in 0.8 s, the other in 3 s.
  rect(x+20,y+30,12,2,C.ink);rect(x+18,y+32,2,6,C.ink);rect(x+32,y+32,2,6,C.ink);rect(x+20,y+38,12,2,C.ink);
  rect(x+25,y+33,2,4,C.ink);
  const progress=Math.max(0,Math.min(1,(machine.t-l.wakeStarted)/(l.wakeUntil-l.wakeStarted||1)));
  const points=[[25,32],[29,34],[25,36],[21,34]],p=points[Math.min(3,Math.floor(progress*4))];rect(x+p[0],y+p[1],3,3,C.ink);
 }
 function core(i){
  const {x,y}=positions[i],policy=cores[i],l=machine.lanes[i],temp=machine.temps[i>>2],lending=l.state==='lending',used=isUsed(i);
  const throttled=machine.thermalLimited&&!machine.recovering&&machine.packageTemp>=80&&used&&temp>=65,sweaty=temp>=65&&!throttled;
  const waiting=['waiting','sleeping'].includes(l.state),cold=waiting&&temp<40;
  let color=policy==='app'||lending?C.app:l.state==='waiting'?C.pause:l.state==='sleeping'?C.sleep:C.network;
  if(l.state==='handoff')color=mix(C.network,C.app,Math.max(0,Math.min(1,machine.t-l.idleSince)));
  if(l.state==='waking'){
   const from=policy==='pause'?C.pause:policy==='lend'?C.app:C.sleep,progress=Math.max(0,Math.min(1,(machine.t-l.wakeStarted)/(l.wakeUntil-l.wakeStarted||1)));
   color=mix(from,C.network,progress);
  }
  if(temp>45)color=mix(color,C.warm,(temp-45)/25);
  if(temp>=65)color=mix(C.warm,'#FE6100',(temp-65)/15);
  if(throttled)color=C.hot;
  const pin=throttled?'#B84D89':temp>=65?'#C29243':'#7E7598';
  for(let k=0;k<3;k++){rect(x+10+k*12,y-4,5,4,pin);rect(x+10+k*12,y+46,5,4,pin);}
  rect(x+3,y,46,46,'#101020');rect(x,y+3,52,40,'#101020');rect(x+4,y+4,44,37,color);
  if(lending){rect(x+3,y+3,46,1,C.network);rect(x+3,y+40,46,1,C.network);}
  const shut=l.state==='sleeping'||(l.state==='waking'&&machine.t-l.wakeStarted<(l.wakeUntil-l.wakeStarted)/2);
  rect(x+13,y+15,5,shut?2:5,C.ink);rect(x+34,y+15,5,shut?2:5,C.ink);
  if(throttled){rect(x+11,y+11,9,2,C.ink);rect(x+32,y+11,9,2,C.ink);}

  rect(x+23,y+23,6,2,C.ink); // The same small mouth on app and network cores.
  if(l.state==='sleeping'){
   sprite(zGlyph,x+42,y-8,2,{b:C.ice});rect(x+6,y+30,40,10,'#5269A3');rect(x+6,y+28,40,3,'#B6C7EF');
  }else if(l.state==='handoff'){
   rect(x+18,y+33,14,3,C.ink);rect(x+29,y+30,3,3,C.ink);rect(x+32,y+33,3,3,C.ink);rect(x+29,y+36,3,3,C.ink);
  }else if(l.state==='waking')wakeClock(x,y,l);
  else if(l.state==='waiting')pauseIcon(x,y);
  else if(l.state==='spinning')spinner(x,y);

  if(throttled)sprite(flame[reduced?0:Math.floor(machine.t/1.2)%2],x+14,y-23,3,{r:'#DC267F',y:'#FE6100',w:'#FFB000'});
  else if(sweaty){
   const fall=reduced?0:Math.floor(machine.t/0.6)%4;
   sprite(drop,x+43,y+6+fall*2,1,{b:'#BCD0FF'});
  }else if(cold){sprite(snow,x-3,y-7,2,{b:C.ice});}
  const label={app:'APP',working:'NET',spinning:'BUSY',waiting:'PAUSE',sleeping:'SLEEP',handoff:'LEND',lending:'APP*',waking:'WAKE'}[l.state];
  centered(label,x+26,y+62,policy==='app'||lending?C.app:C.network,10);
 }
 function envelope(x,y,w=10){
  rect(x,y,w,7,C.network);rect(x+1,y+1,w-2,1,'#EEF2FF');
  rect(x+2,y+2,2,1,'#263B76');rect(x+w-4,y+2,2,1,'#263B76');rect(x+w/2-1,y+3,2,1,'#263B76');
 }
 function draw(){
  ctx.imageSmoothingEnabled=false;rect(0,0,canvas.width,canvas.height,C.bg);
  for(let x=0;x<canvas.width;x+=12)for(let y=0;y<canvas.height;y+=12)rect(x,y,1,1,C.grid);
  text('PACKAGE 01',compact?13:24,compact?19:23,C.muted,compact?8:10);
  const label=!playing?'PAUSED':machine.activeBurst?'NETWORK BURST':'IDLE PHASE';
  if(machine.activeBurst){
   rect(canvas.width-(compact?99:136),compact?8:10,compact?91:124,16,'#3D3D76');
   const start=compact?118:160,length=compact?150:400;
   rect(start,compact?17:21,length,1,'#423C64');
   for(let n=0;n<3;n++){
    const phase=reduced?(n+.5)/3:((machine.t/4+n/3)%1);
    envelope(start+phase*(length-12),compact?13:17,10);
   }
  }
  text(label,canvas.width-(compact?91:128),compact?19:23,machine.activeBurst?'#EDF0FF':C.muted,compact?8:10);
  for(let die=0;die<4;die++){
   const x=compact?12+(die%2)*194:24+(die%2)*388,y=compact?34+Math.floor(die/2)*240:42+Math.floor(die/2)*156,w=compact?182:364,h=compact?228:140,temp=machine.temps[die];
   const limited=machine.thermalLimited&&!machine.recovering&&machine.packageTemp>=80&&machine.activeByDie[die]>0&&temp>=65;
   const tint=limited?'#9E376A':temp>=65?'#AA7A36':temp>=45?'#7F704C':C.line;
   rect(x,y,w,h,tint);rect(x+2,y+2,w-4,h-4,limited?'#4C213C':mix('#242137','#403127',(temp-40)/45));
   text('DIE 0'+(die+1),x+10,y+17,C.muted,9);
   const state=limited?'HOT':temp>=65?'SWEATING':temp>=45?'WARM':'COOL';
   text(state,x+w-(compact?67:75),y+17,limited?C.hot:temp>=45?C.warm:C.muted,8);
  }
  currentTransfer=powerTransfer();drawPowerRail();
  cores.forEach((_,i)=>core(i));drawPowerTransfers();updatePower();
 }
 // All rail geometry lives in empty gutters and below the cores' labels.
 function railGeometry(){return {x:canvas.width/2,nodeY:canvas.height-17};}
 function powerPath(i){
  const p=positions[i],die=i>>2,g=railGeometry();
  const localY=compact?34+Math.floor(die/2)*240+220:42+Math.floor(die/2)*156+132;
  return [[p.x+52,p.y+43],[p.x+76,p.y+43],[p.x+76,localY],[g.x,localY],[g.x,g.nodeY-12]];
 }
 function strokePath(points,color,width=1,alpha=1){
  // Render the actual wire polyline. Motion samples this same geometry.
  ctx.save();ctx.lineJoin='miter';ctx.lineCap='butt';ctx.strokeStyle=color;
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.globalAlpha=alpha*.12;ctx.lineWidth=width+2;ctx.stroke();
  ctx.globalAlpha=alpha;ctx.lineWidth=width;ctx.stroke();ctx.restore();
 }
 function powerBolt(point){
  // A compact, self-contained lightning glyph: no round head or trailing tail.
  const x=Math.round(point[0]),y=Math.round(point[1]);
  ctx.save();ctx.fillStyle='#E7DFFF';ctx.beginPath();
  [[1,-5],[-4,1],[0,1],[-2,5],[4,-1],[0,-1]].forEach(([dx,dy],i)=>i?ctx.lineTo(x+dx,y+dy):ctx.moveTo(x+dx,y+dy));
  ctx.closePath();ctx.fill();ctx.restore();
 }
 function drawPowerRail(){
  const g=railGeometry();
  // Only the quiet common spine is permanent. Branches appear when used.
  strokePath([[g.x,compact?46:58],[g.x,g.nodeY]],'#785EF0',1,.35);
  for(let row=0;row<2;row++){
   const y=compact?34+row*240+220:42+row*156+132;
   strokePath([[g.x-(compact?6:12),y],[g.x+(compact?6:12),y]],'#785EF0',1,.35);
  }
  rect(g.x-9,g.nodeY-9,18,18,C.bg);
  ctx.strokeStyle='#785EF0';ctx.lineWidth=1;ctx.strokeRect(g.x-8,g.nodeY-8,16,16);
  ctx.fillStyle='#D4C7FF';ctx.beginPath();
  [[1,-6],[-4,1],[0,1],[-2,6],[4,-2],[0,-2]].forEach(([x,y],i)=>i?ctx.lineTo(g.x+x,g.nodeY+y):ctx.moveTo(g.x+x,g.nodeY+y));ctx.closePath();ctx.fill();
  text('POWER',g.x+16,g.nodeY+3,'#B6A7F6',9);
 }
 function transferRef(i,epochs=machine.powerEpochs){return {i,epoch:epochs[i]};}
 function validTransferRef(ref,direction){
  const {i,epoch}=ref,state=machine.lanes[i].state;
  if(machine.powerEpochs[i]!==epoch)return false;
  if(direction==='grant')return cores[i]==='app'||state==='lending';
  if(cores[i]==='app'||cores[i]==='busy')return false;
  return direction==='network'?state==='working':['waiting','sleeping','handoff','lending'].includes(state);
 }
 function validGrant(stage){
  // A subsequent NET claim supersedes the old app redistribution. A wake also
  // invalidates its releasing source before that source turns back into NET.
  return stage.claimRevision===lastNetworkClaim&&stage.sources.some(ref=>validTransferRef(ref,'return'));
 }
 function powerTransfer(){
  const now=machine.t;
  const incoming=machine.powerEvents.filter(e=>e.id>lastPowerEvent);
  if(incoming.length){
   lastPowerEvent=incoming.at(-1).id;
   let batch=powerBatches.at(-1);
   // Collect close changes into one wave; while a wave plays, merge pending work.
   if(!batch||batch.started){batch={released:new Map(),net:new Map(),readyAt:now+.2,started:false};powerBatches.push(batch);}
   incoming.forEach(e=>{
    if(e.networkStarted.length)lastNetworkClaim=e.id;
    e.released.forEach(i=>{batch.released.set(i,transferRef(i,e.epochs));batch.claimRevision=lastNetworkClaim;});
    e.networkStarted.forEach(i=>batch.net.set(i,transferRef(i,e.epochs)));
   });
  }
  let batch=powerBatches[0];if(!batch||now<batch.readyAt)return null;
  if(!batch.started){
   const sources=[...batch.released.values()].filter(ref=>validTransferRef(ref,'return'));
   const nets=[...batch.net.values()].filter(ref=>validTransferRef(ref,'network'));
   batch.stages=[];
   if(sources.length){
    batch.stages.push({direction:'return',refs:sources});
    batch.stages.push({direction:'grant',sources,claimRevision:batch.claimRevision});
   }
   if(nets.length)batch.stages.push({direction:'network',refs:nets});
   batch.started=true;batch.index=0;batch.nextStart=now;
  }
  // Launch each wave together, then wait for the longest route to finish.
  while(batch.index<batch.stages.length){
   const stage=batch.stages[batch.index];
   if(stage.direction==='grant'&&!validGrant(stage)){batch.index++;batch.nextStart=now;continue;}
   if(!stage.routes){
    // Pick app recipients when the returned power actually reaches POWER,
    // including cores that have completed their lending handoff by then.
    if(stage.direction==='grant'&&!stage.refs)stage.refs=cores.map((_,i)=>transferRef(i)).filter(ref=>validTransferRef(ref,'grant'));
    stage.routes=stage.refs.filter(ref=>validTransferRef(ref,stage.direction)).map(ref=>{
     const {i}=ref;
     const path=powerPath(i);if(stage.direction!=='return')path.reverse();
     return {...ref,wire:powerRoute(path)};
    });
    stage.start=batch.nextStart;stage.duration=powerDuration(stage.routes);
   }
   // Check throughout the flight as well as at launch. Never revive a cancelled
   // route if a core happens to enter a matching state in a later burst.
   stage.routes=stage.routes.filter(ref=>validTransferRef(ref,stage.direction));
   if(!stage.routes.length){batch.index++;batch.nextStart=now;continue;}
   stage.duration=powerDuration(stage.routes);
   const age=now-stage.start;
   if(age<stage.duration)return {...stage,age};
   // A cancelled long route may shorten the wave after its other routes have
   // already arrived. Never backdate the next launch into the middle of a wire.
   batch.nextStart=now;batch.index++;
  }
  powerBatches.shift();return powerTransfer();
 }
 function transferPaths(){
  if(!currentTransfer)return [];
  const {age,routes}=currentTransfer;
  return routes.map(({i,wire})=>({
   i,path:wire.path,wire,distance:age*POWER_SPEED,
   visible:age<=wire.length/POWER_SPEED+ARRIVAL_HOLD,
  }));
 }
 function drawPowerTransfers(){
  const paths=transferPaths(),lines=new Map();
  // Merge shared and partially overlapping wire sections before drawing.
  paths.forEach(({path})=>path.slice(1).forEach((point,j)=>{
   const from=path[j],vertical=from[0]===point[0],axis=vertical?from[0]:from[1];
   const key=(vertical?'v':'h')+axis,values=vertical?[from[1],point[1]]:[from[0],point[0]];
   if(!lines.has(key))lines.set(key,{vertical,axis,intervals:[]});
   lines.get(key).intervals.push([Math.min(...values),Math.max(...values)]);
  }));
  lines.forEach(({vertical,axis,intervals})=>{
   const merged=[];intervals.sort((a,b)=>a[0]-b[0]).forEach(interval=>{
    const previous=merged.at(-1);if(previous&&interval[0]<=previous[1])previous[1]=Math.max(previous[1],interval[1]);else merged.push([...interval]);
   });
   merged.forEach(([start,end])=>strokePath(vertical?[[axis,start],[axis,end]]:[[start,axis],[end,axis]],'#B6A7F6',1,.25));
  });
  // Coincident packets share one symbol on the common trunk, then split at
  // junctions. Logical packets still exist for every source and destination.
  const drawn=new Set();
  paths.forEach(({wire,distance,visible})=>{
   if(!visible)return;
   const point=powerPoint(wire,reduced?wire.length/2:distance),key=point.map(Math.round).join(',');
   if(!drawn.has(key)){drawn.add(key);powerBolt(point);}
  });
 }
 function updatePower(){
  $('power').style.width=machine.power/CAP*100+'%';$('power-value').textContent=Math.round(machine.power/CAP*100)+'%';
  $('power').title=Math.round(machine.power/CAP*100)+'% of package power budget';
  $('temperature').style.width=machine.packageTemp+'%';$('temperature-value').textContent=Math.round(machine.packageTemp)+' / 100';
  $('temperature').className=machine.packageTemp>=90?'limited':machine.packageTemp>=65?'warm':'';
  const borrowed=machine.lanes.filter(l=>l.state==='lending').length;
  $('phase-status').textContent=machine.thermalLimited?(machine.recovering?'Recovering · ':'Cooling · ')+Math.round(machine.clockFactor*100)+'% speed':borrowed?borrowed+' borrowed app'+(borrowed>1?'s':''):machine.activeBurst?'Network burst':'Idle phase';
 }
 function updateUI(){
  const rates=machine.rates(),elapsed=machine.t-machine.history[0].t;
  $('app-throughput').textContent=elapsed<.1?'—':Math.round(rates.app);
  $('network-throughput').textContent=elapsed<.1?'—':Math.round(rates.network);
  $('slo-violations').textContent=machine.assessed?Math.round(machine.violations):'—';updatePower();updateLabels();
  $('play').classList.toggle('is-paused',!playing);$('play').setAttribute('aria-label',playing?'Pause simulation':'Resume simulation');$('play').title=playing?'Pause simulation':'Resume simulation';
 }
 document.querySelectorAll('[data-role]').forEach(b=>b.addEventListener('click',()=>{role=b.dataset.role;updateSelection();announce(`Paint ${role==='app'?'App':POLICIES[strategy]}.`);}));
 document.querySelectorAll('[data-policy]').forEach(b=>b.addEventListener('click',()=>{strategy=b.dataset.policy;role='network';updateSelection();announce(`Paint ${POLICIES[strategy]} network cores.`);}));
 $('burst').addEventListener('input',()=>{$('burst').setAttribute('aria-valuetext',BURSTS[Number($('burst').value)].name);updateSelection();restart();});
 $('play').addEventListener('click',()=>{playing=!playing;accumulator=0;updateUI();draw();});
 $('reset').addEventListener('click',()=>{cores=defaults();strategy='pause';role='network';$('burst').value=1;$('burst').setAttribute('aria-valuetext','Medium');playing=true;updateSelection();restart(false);announce('Sandbox reset.');});
 let helpWasPlaying=false;
 $('help-button').addEventListener('click',()=>{helpWasPlaying=playing;playing=false;accumulator=0;updateUI();$('help').showModal();});
 ['help-close','help-done'].forEach(id=>$(id).addEventListener('click',()=>$('help').close()));
 $('help').addEventListener('close',()=>{playing=helpWasPlaying;previous=0;accumulator=0;updateUI();});
 function frame(now){
  const elapsed=previous?Math.min((now-previous)/1000,.1):0;previous=now;
  if(playing&&!document.hidden){accumulator+=elapsed;while(accumulator>=DT){machine.step();accumulator-=DT;}}
  if(now-lastDraw>=(reduced?200:1000/30)){draw();lastDraw=now;}
  if(now-lastUI>500){updateUI();lastUI=now;}
  requestAnimationFrame(frame);
 }
 new ResizeObserver(layout).observe(canvas.parentElement);
 document.addEventListener('visibilitychange',()=>{previous=0;accumulator=0;});
 $('burst').setAttribute('aria-valuetext','Medium');updateSelection();layout();requestAnimationFrame(frame);
})();
