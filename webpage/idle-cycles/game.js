// Palette source: behemoth-paper/plots/colours.gnuplot.
(function(){
 'use strict';
 const {CAP,BURSTS,POLICIES}=SchedulerModel,$=id=>document.getElementById(id);
 const counters=Object.fromEntries(['app-throughput','network-throughput','slo-violations','power-value','temperature-value'].map(id=>[id,Object.assign(new MetricMotion.Counter(id==='temperature-value'?20:null),{fresh:true})]));
 const Campaign=IdleCampaign,P=Campaign.P;
 // Game state lasts only until reload; this game does not use browser storage.
 const progress=new Campaign.Progress();
 let currentLevel=progress.state.level,mode='campaign',phase='configure',runStarted=0,motionTime=0,hintDepth=0,onboarding=false;
 const canvas=$('chip'),ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let cores=[...progress.state.cores],strategy=cores.find(v=>!['app','free'].includes(v))||'busy',role='network',machine=new Campaign.Machine(cores,currentLevel),playing=false,previous=0,accumulator=0,lastUI=0,lastDraw=0,positions=[],compact=false;
 let illustration=null,temperatureBand='';
 const displayMachine=()=>illustration&&mode==='campaign'&&(phase==='running'||phase==='result')?illustration:machine;
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
 function layout(){
  compact=canvas.parentElement.clientWidth<600;canvas.width=compact?400:800;canvas.height=compact?550:392;
  positions=cores.map((_,i)=>{const die=i>>2,j=i%4;return compact?{x:12+(die%2)*194+20+(j%2)*78,y:34+Math.floor(die/2)*240+50+Math.floor(j/2)*98}:{x:24+(die%2)*388+24+j*86,y:42+Math.floor(die/2)*156+50};});
  $('core-buttons').replaceChildren();
  cores.forEach((_,i)=>{
   const b=document.createElement('button'),p=positions[i];b.className='core-button';b.dataset.core=i;
   b.style.left=(p.x-5)/canvas.width*100+'%';b.style.top=(p.y-13)/canvas.height*100+'%';b.style.width=64/canvas.width*100+'%';b.style.height=83/canvas.height*100+'%';
   b.addEventListener('click',()=>paint(i));$('core-buttons').appendChild(b);
  });updateLabels();draw();
 }
 function updateLabels(){
  document.querySelectorAll('[data-core]').forEach(b=>{
   const i=Number(b.dataset.core),state=displayMachine().lanes[i].state,illustrated=displayMachine()===illustration;
   b.dataset.assignment=cores[i];
   b.setAttribute('aria-label',`Core ${i+1}, die ${(i>>2)+1}: ${POLICIES[cores[i]]}, ${illustrated?'illustrative state: ':''}${state}. Set to ${role==='network'?POLICIES[strategy]:POLICIES[role]}.`);
   b.disabled=isRunning();
   b.title=cores[i]==='free'?'No app or network work assigned.':`${POLICIES[cores[i]]} · ${state==='lending'?'running application work':state}`;
  });
 }
 function announce(t){$('announcement').textContent=t;}
 function isRunning(){return mode==='campaign'&&phase==='running';}
 function remember(){
  progress.state.cores=[...cores];progress.state.level=currentLevel;progress.state.mode=mode;
  if(mode==='sandbox'){progress.state.sandboxBurst=Number($('burst').value);progress.state.sandboxDuty=Number($('traffic').value);}
 }
 function restart(preserveHeat=true){
  const old=machine;
  machine=new Campaign.Machine(cores,currentLevel,mode==='sandbox'?{sandbox:true,burst:Number($('burst').value),duty:Number($('traffic').value)/10}:{});
  if(mode==='sandbox'&&preserveHeat){
   machine.tick=old.tick;machine.t=old.t;machine.statsStart=old.t;machine.lastVisualTime=old.t;machine.history=[{t:old.t,work:0,done:0}];
   machine.packageTemp=old.packageTemp;machine.temps=[...old.temps];machine.clockFactor=old.clockFactor;machine.recovering=old.recovering;machine.lanes.forEach(l=>l.idleSince=old.t);
  }
  illustration=isRunning()?new IdleIllustration(cores,Campaign.LEVELS[currentLevel]):null;
  temperatureBand='';
  Object.keys(counters).forEach(id=>{counters[id]=Object.assign(new MetricMotion.Counter(id==='temperature-value'?machine.packageTemp:null),{fresh:true});});
  accumulator=0;updateLabels();updateUI();draw();
 }
 function paint(i){
  if(isRunning())return;
  if(mode==='campaign'&&phase==='result'){phase='configure';tutorial.close('edit');}
  cores[i]=role==='network'?strategy:role;restart(mode==='sandbox');remember();renderCampaign();announce(`Core ${i+1}: ${POLICIES[cores[i]]}.`);
 }
 function updateSelection(){
  document.querySelectorAll('.range-labels span').forEach((el,i)=>el.classList.toggle('active',i===Number($('burst').value)));
  document.querySelectorAll('[data-role]').forEach(b=>{const selected=b.dataset.role===role;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  document.querySelectorAll('[data-policy]').forEach(b=>{const selected=b.dataset.policy===strategy;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});updateLabels();
 }
 function pauseIcon(x,y){rect(x+20,y+31,4,8,C.ink);rect(x+28,y+31,4,8,C.ink);}
 function spinner(x,y){
  const points=[[25,30],[30,33],[25,36],[20,33]],active=reduced?0:Math.floor(motionTime/.2)%4;
  points.forEach(([dx,dy],i)=>rect(x+dx,y+dy,3,3,i===active?C.ink:'#ffffff55'));
 }
 function wakeClock(x,y,l){
  // Use the displayed wake interval, including stretched illustrative timing.
  rect(x+20,y+30,12,2,C.ink);rect(x+18,y+32,2,6,C.ink);rect(x+32,y+32,2,6,C.ink);rect(x+20,y+38,12,2,C.ink);
  rect(x+25,y+33,2,4,C.ink);
  const progress=Math.max(0,Math.min(1,(displayMachine().t-l.wakeStarted)/(l.wakeUntil-l.wakeStarted||1)));
  const points=[[25,32],[29,34],[25,36],[21,34]],p=points[Math.min(3,Math.floor(progress*4))];rect(x+p[0],y+p[1],3,3,C.ink);
 }
 function core(i){
  const {x,y}=positions[i],policy=cores[i],l=displayMachine().lanes[i],temp=displayMachine().temps[i>>2],lending=l.state==='lending';
  const throttled=displayMachine().packageHot,sweaty=temp>=65&&!throttled;
  const waiting=['waiting','sleeping'].includes(l.state),cold=waiting&&temp<40;
  let color=policy==='free'?mix('#77718F','#88819D',reduced?.5:(1-Math.cos(motionTime*Math.PI/4))/2):policy==='app'||lending?C.app:l.state==='waiting'?C.pause:l.state==='sleeping'?C.sleep:C.network;
  if(l.state==='handoff')color=mix(C.network,C.app,Math.max(0,Math.min(1,displayMachine().t-l.idleSince)));
  if(l.state==='waking'){
   const from=policy==='pause'?C.pause:policy==='lend'?C.app:C.sleep,progress=Math.max(0,Math.min(1,(displayMachine().t-l.wakeStarted)/(l.wakeUntil-l.wakeStarted||1)));
   color=mix(from,C.network,progress);
  }
  if(policy!=='free'&&temp>45)color=mix(color,C.warm,(temp-45)/25);
  if(policy!=='free'&&temp>=65)color=mix(C.warm,'#FE6100',(temp-65)/15);
  if(throttled)color=C.hot;
  const pin=throttled?'#B84D89':temp>=65?'#C29243':'#7E7598';
  for(let k=0;k<3;k++){rect(x+10+k*12,y-4,5,4,pin);rect(x+10+k*12,y+46,5,4,pin);}
  rect(x+3,y,46,46,'#101020');rect(x,y+3,52,40,'#101020');rect(x+4,y+4,44,37,color);
  if(lending){rect(x+3,y+3,46,1,C.network);rect(x+3,y+40,46,1,C.network);}
  const shut=policy==='free'||l.state==='sleeping'||(l.state==='waking'&&displayMachine().t-l.wakeStarted<(l.wakeUntil-l.wakeStarted)/2);
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

  if(throttled)sprite(flame[reduced?0:Math.floor(motionTime/.25)%2],x+14,y-23,3,{r:'#DC267F',y:'#FE6100',w:'#FFB000'});
  else if(policy!=='free'&&sweaty){
   const fall=reduced?0:Math.floor(motionTime/.2)%4;
   sprite(drop,x+43,y+6+fall*2,1,{b:'#BCD0FF'});
  }else if(cold){sprite(snow,x-3,y-7,2,{b:C.ice});}
  const label={free:'UNASSIGNED',app:'APP',working:'NET',spinning:'BUSY',waiting:'PAUSE',sleeping:'SLEEP',handoff:'SWITCH',lending:'APP (LEND)',waking:'WAKING'}[l.state];
  centered(label,x+26,y+62,policy==='free'?C.muted:policy==='app'||lending?C.app:C.network,10);
 }
 function envelope(x,y,w=10){
  rect(x,y,w,7,C.network);rect(x+1,y+1,w-2,1,'#EEF2FF');
  rect(x+2,y+2,2,1,'#263B76');rect(x+w-4,y+2,2,1,'#263B76');rect(x+w/2-1,y+3,2,1,'#263B76');
 }
 function draw(){
  ctx.imageSmoothingEnabled=false;rect(0,0,canvas.width,canvas.height,C.bg);
  for(let x=0;x<canvas.width;x+=12)for(let y=0;y<canvas.height;y+=12)rect(x,y,1,1,C.grid);
  text('PACKAGE 01',compact?13:24,compact?19:23,C.muted,compact?8:10);
  const label=mode==='campaign'?(phase==='configure'?'CONFIGURE':phase==='result'?'RUN COMPLETE':displayMachine().activeBurst?'NETWORK BURST':'NO ARRIVALS'):!playing?'PAUSED':displayMachine().activeBurst?'NETWORK BURST':'NO ARRIVALS';
  if(displayMachine().activeBurst){
   rect(canvas.width-(compact?99:136),compact?8:10,compact?91:124,16,'#3D3D76');
   const start=compact?118:160,length=compact?150:400;
   rect(start,compact?17:21,length,1,'#423C64');
   for(let n=0;n<3;n++){
    const phase=reduced?(n+.5)/3:((motionTime/2+n/3)%1);
    envelope(start+phase*(length-12),compact?13:17,10);
   }
  }
  text(label,canvas.width-(compact?91:128),compact?19:23,displayMachine().activeBurst?'#EDF0FF':C.muted,compact?8:10);
  for(let die=0;die<4;die++){
   const x=compact?12+(die%2)*194:24+(die%2)*388,y=compact?34+Math.floor(die/2)*240:42+Math.floor(die/2)*156,w=compact?182:364,h=compact?228:140,temp=displayMachine().temps[die];
   const limited=displayMachine().packageHot;
   const tint=limited?'#9E376A':temp>=65?'#AA7A36':temp>=45?'#7F704C':C.line;
   rect(x,y,w,h,tint);rect(x+2,y+2,w-4,h-4,limited?'#4C213C':mix('#242137','#403127',(temp-40)/45));
   text('DIE 0'+(die+1),x+10,y+17,C.muted,9);
   const state=limited?'THROTTLED':temp>=65?'HIGH TEMP':temp>=45?'WARM':'NORMAL';
   text(state,x+w-(compact?67:75),y+17,limited?C.hot:temp>=45?C.warm:C.muted,8);
  }
  cores.forEach((_,i)=>core(i));updatePower();
 }
 function setMetric(id,target){
  const counter=counters[id];counter.set(target);
  if(counter.fresh&&target!==null&&machine.t>machine.statsStart){counter.value=counter.target;counter.fresh=false;}
 }
 function updateBudget(){
  const budget=$('power-budget'),inactive=mode==='campaign'&&phase==='configure';
  budget.classList.toggle('is-inactive',inactive);
  if(inactive){
   ['budget-app','budget-network','budget-other'].forEach(id=>$(id).style.width='0%');
   budget.setAttribute('aria-label','Power budget will be shown when the run starts.');return;
  }
  const view=displayMachine();let app=0,network=0,other=0;
  view.lanes.forEach((lane,i)=>{
   const state=lane.state,policy=cores[i];
   const demand=policy==='free'?P.freeIdlePower:policy==='app'||['working','spinning','lending'].includes(state)?P.workingPower:state==='sleeping'?P.sleepIdlePower:P.pauseIdlePower;
   if(policy==='app'||state==='lending')app+=demand;
   else if(policy==='free')other+=demand;
   else network+=demand;
  });
  const demand=app+network+other,thermalFactor=view.packageHot?.5:1;
  const factor=demand?Math.min(P.maximumClockFactor,P.powerCap/demand)*thermalFactor:0;
  const pct=value=>Math.max(0,Math.min(100,100*value*factor/P.powerCap));
  $('budget-app').style.width=pct(app)+'%';$('budget-network').style.width=pct(network)+'%';$('budget-other').style.width=pct(other)+'%';
  const remaining=Math.max(0,100-pct(app)-pct(network)-pct(other));
  budget.setAttribute('aria-label',`Illustrative power budget: app ${Math.round(pct(app))}%, network ${Math.round(pct(network))}%, other ${Math.round(pct(other))}%, available ${Math.round(remaining)}%.`);
 }
 function updatePower(){
  setMetric('power-value',machine.power/CAP*100);
  updateBudget();
  setMetric('temperature-value',machine.packageTemp);
 }
 function updateUI(){
  const rates=machine.rates(),elapsed=machine.t-machine.history[0].t;
  if(elapsed>=.1){setMetric('app-throughput',rates.app);setMetric('network-throughput',rates.network);}else{setMetric('app-throughput',null);setMetric('network-throughput',null);}
  setMetric('slo-violations',machine.assessed?machine.violations:null);updatePower();updateLabels();
  $('play').classList.toggle('is-paused',!playing);$('play').setAttribute('aria-label',playing?'Pause simulation':'Resume simulation');$('play').title=playing?'Pause simulation':'Resume simulation';
 }
 function animateMetrics(elapsed){
  Object.entries(counters).forEach(([id,counter])=>{
   const value=counter.advance(elapsed),display=value===null?'—':String(value);
   $(id).textContent=display+(id==='power-value'?'%':id==='temperature-value'?' / 100':'');
  });

  const temp=counters['temperature-value'].value||0;
  if(temperatureBand==='limited')temperatureBand=temp<87?(temp>=63?'warm':''):temperatureBand;
  else if(temp>=92)temperatureBand='limited';
  else if(temperatureBand==='warm')temperatureBand=temp<63?'':'warm';
  else if(temp>=67)temperatureBand='warm';
  $('temperature').className=temperatureBand;
  $('temperature').style.width=temp+'%';
 }
 const tutorial=IdleTutorial({onClose(reason){
  if(!onboarding)return;
  onboarding=false;progress.state.tutorialSeen=true;remember();
  if(['finish','skip','dismiss'].includes(reason)&&mode==='campaign'&&phase==='configure'){
   const level=Campaign.LEVELS[currentLevel];say(level.title,level.intro);
  }
 }});
 const essentialSteps=[
  {title:'Processor cores',text:'Hi, I am Behemoth, your guide to this machine. This processor has 16 cores. App cores run application work. Network cores process packets. You can change each core’s role and waiting strategy.',focus:'package',targets:['.chip-stage'],anchor:'#campaign-guide-anchor'},
  {title:'Assign core roles',text:'Choose App or Network, then tap a core. Choose Unassigned and tap a core to remove its assignment. Unassigned cores use less power.',focus:'app',targets:['#paint-tools','.chip-stage'],anchor:'.chip-toolbar'},
  {title:'Set network waiting strategies',text:'Choose a waiting strategy, then tap the network cores that should use it. This changes only those cores. Different network cores can use different strategies.',focus:'network',targets:['.rectangles'],anchor:'.controls fieldset:first-child'},
  {title:'Run a 10-second benchmark',text:'Press Run. You cannot change the configuration during the run. The score is an estimate until the run ends. Then retry or continue to the next level.',focus:'ready',targets:['#benchmark-start'],anchor:'#benchmark-panel'},
 ];
 function openTutorial(){
  if(isRunning())return;
  if(mode==='sandbox'){onboarding=false;tutorial.open();}
  else{onboarding=true;tutorial.open({steps:essentialSteps,finalLabel:'Done',intro:true});}
 }
 function say(title,text,anchor='#campaign-guide-anchor',focus='package'){
  tutorial.say({title,text,anchor,focus,targets:[]});
 }
 function closeStrategyHelp(){
  document.querySelectorAll('.strategy-help').forEach(button=>{
   button.setAttribute('aria-expanded','false');document.getElementById(button.getAttribute('aria-controls')).hidden=true;
   button.parentElement.classList.remove('help-open');
  });
 }
 function renderCampaign(){
  closeStrategyHelp();
  document.body.dataset.mode=mode;document.body.dataset.phase=phase;
  const sandbox=mode==='sandbox',level=Campaign.LEVELS[currentLevel],locked=isRunning();
  document.querySelectorAll('[data-level]').forEach(b=>{
   const n=Number(b.dataset.level);b.disabled=false;
   b.title=locked?'Switch level and cancel the current run':'';
   if(!sandbox&&n===currentLevel)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');
   const medal=progress.state.medals[n],badge=b.querySelector('.level-medal');
   if(medal!=='none')badge.dataset.medal=medal;else delete badge.dataset.medal;
   b.setAttribute('aria-label',`${Campaign.LEVELS[n].title}. ${progress.state.completed[n]?'Completed. ':''}Best ${progress.state.scores[n]} points${medal!=='none'?', '+medal+' medal':''}.`);
  });
  $('sandbox-button').disabled=false;
  $('sandbox-button').setAttribute('aria-label','Enter sandbox');
  if(sandbox)$('sandbox-button').setAttribute('aria-current','page');else $('sandbox-button').removeAttribute('aria-current');
  $('level-title').textContent=sandbox?'Sandbox':level.title;
  $('level-goal').textContent=sandbox?'Set core roles, waiting strategies, network burst duration and the percentage of time packets arrive.':level.goal;
  $('campaign-total').textContent=progress.total.toLocaleString();
  $('level-best').textContent=sandbox?'':`Level best: ${progress.state.scores[currentLevel].toLocaleString()} / 1,000`;
  document.querySelectorAll('[data-role],[data-policy],.strategy-help,#tutorial-button,#hint-button').forEach(b=>b.disabled=locked);
  document.querySelectorAll('[data-core]').forEach(b=>b.disabled=locked);
  $('benchmark-start').hidden=locked||phase==='result';$('benchmark-cancel').hidden=!locked;
  $('benchmark-panel').hidden=sandbox;$('countdown').hidden=phase==='result';
  $('hint-button').hidden=locked;$('retry-button').hidden=phase!=='result';$('benchmark-start').disabled=locked;
  $('result-medal').hidden=phase!=='result';
  $('next-level').textContent=currentLevel===3?'Sandbox ▸':'Next level ▸';
  $('next-level').title=locked?'Cancel this run and continue':'';
  $('play').hidden=!sandbox;document.querySelector('.burst-control').hidden=!sandbox;document.querySelector('.traffic-control').hidden=!sandbox;
  $('burst').disabled=!sandbox;$('traffic').disabled=!sandbox;
  $('network-metric-label').textContent=sandbox?'Delivered packet rate':'On-time packet rate';
  $('network-metric-label').title=sandbox?'Rate of delivered packets, including late deliveries.':'Rate of packets delivered before their deadline.';
  document.querySelector('.metrics h2').title='Rate of completed application work, including work on lent network cores.';
  if(!sandbox&&!locked&&phase!=='result'){
   $('run-score').textContent='0';$('score-label').textContent='SCORE ESTIMATE';
   $('countdown').replaceChildren(document.createTextNode('10.0'),Object.assign(document.createElement('span'),{textContent:'s'}));
  }
 }
 function enterLevel(index,initial=false){
  if(!Campaign.LEVELS[index])return;
  if(isRunning())announce('Benchmark canceled. No score was recorded.');
  tutorial.close('navigate');mode='campaign';phase='configure';currentLevel=index;hintDepth=0;
  playing=false;$('hint-button').textContent='Hint';
  restart(false);updateSelection();remember();renderCampaign();
  if(initial&&index===0&&!progress.state.tutorialSeen)openTutorial();
  else say(Campaign.LEVELS[index].title,Campaign.LEVELS[index].intro);
 }
 function enterSandbox(){
  if(isRunning())announce('Benchmark canceled. No score was recorded.');
  tutorial.close('navigate');mode='sandbox';phase='sandbox';playing=true;
  $('burst').value=progress.state.sandboxBurst;$('traffic').value=progress.state.sandboxDuty;
  updateTraffic();restart(false);updateSelection();remember();renderCampaign();
  say('Sandbox controls.','You can now play around and explore different configurations in the sandbox.');
  announce('Sandbox opened. All traffic controls are available.');
 }
 function startRun(){
  if(mode!=='campaign'||isRunning()||phase==='result')return;
  tutorial.close('run');phase='running';playing=true;restart(false);runStarted=performance.now();previous=runStarted;
  remember();renderCampaign();
  $('benchmark-cancel').focus({preventScroll:true});
  const viewingTarget=document.querySelector('.power-strip');viewingTarget.style.scrollMarginTop=($('benchmark-panel').offsetHeight+20)+'px';viewingTarget.scrollIntoView({behavior:'instant',block:'start'});
  announce('Benchmark started. Configuration locked for ten seconds.');
 }
 function cancelRun(message='Run canceled. Your configuration is kept; no score was recorded.'){
  if(!isRunning())return;
  phase='configure';playing=false;restart(false);renderCampaign();
  $('benchmark-start').focus({preventScroll:true});$('benchmark-panel').scrollIntoView({behavior:'instant',block:'nearest'});announce(message);
 }
 function updateBenchmark(now){
  if(!isRunning())return;
  const seconds=Math.min(P.presentationSeconds,Math.max(0,(now-runStarted)/1000));
  machine.advanceToTicks(seconds>=P.presentationSeconds?machine.totalTicks:Math.floor(seconds/P.presentationSeconds*machine.totalTicks));
  illustration.advance(seconds,machine);
  const result=Campaign.evaluate(machine),left=Math.max(0,P.presentationSeconds-seconds);
  $('run-score').textContent=result.score.toLocaleString();
  $('countdown').firstChild.textContent=left.toFixed(1);
  $('countdown').setAttribute('aria-label',left.toFixed(1)+' seconds remaining');
  if(machine.finished)finishRun(result);
 }
 function explanation(result){
  const nets=cores.filter(v=>!['app','free'].includes(v)).length,lends=cores.filter(v=>v==='lend').length;
  const misses=(result.miss*100).toFixed(1);
  if(!nets)return 'Every packet missed its deadline because no cores were assigned to network processing. Assign network cores before running again.';
  if(result.appRate<.1)return 'Application throughput was 0 work / s. Assign App cores, or use Block & lend to run application work on network cores between bursts.';
  if(machine.hotTime>1)return `The processor reached its temperature limit. Clock speed was reduced for ${(machine.hotTime/P.simulationSeconds*10).toFixed(2)} seconds. Assign fewer active cores, or use Pause or Block & sleep to reduce power use between bursts.`;
  if(currentLevel===1&&result.appRate<65)return `Application throughput was ${result.appRate.toFixed(1)} work / s, below the required 65. Assign more App cores or reduce the power used by network cores.`;
  if(result.miss>P.missLimit)return `${misses}% of packets missed their deadlines. The limit is 5%. `+(lends?'Lent cores also need time to reload network data into their caches. Try fewer lent cores or more network cores using Busy or Pause.':'Assign more network cores, or use Busy or Pause to reduce delays before packet processing starts.');
  if(currentLevel===0)return (cores.includes('pause')?'Network cores using Pause consumed less power while waiting for packets.':'Try Pause on network cores to reduce their power use between bursts.');
  if(currentLevel===1)return 'The app throughput and missed-deadline requirements were met. Delivering packets earlier earns additional points.';
  if(currentLevel===2)return `With longer network bursts, wake-up delays affect a smaller percentage of packets. Sleep uses less idle power; lent cores must also reload network data into their caches.`;
  return lends?`Cores assigned to Block & lend ran application work between network bursts. More lending keeps more cores active and can overheat the processor.`:`No cores used Block & lend. Try assigning a few network cores to Block & lend so they run application work between bursts.`;
 }
 function finishRun(result){
  if(machine.pending!==0){cancelRun('This run could not be finalized. Your configuration is kept; please try again.');return;}
  phase='result';playing=false;machine.snapshot();
  progress.record(currentLevel,result);remember();renderCampaign();
  $('score-label').textContent='FINAL SCORE';$('run-score').textContent=result.score.toLocaleString();
  $('result-medal').hidden=result.medal==='none';$('result-medal').dataset.medal=result.medal;
  const award=result.medal==='none'?'Run complete':result.medal[0].toUpperCase()+result.medal.slice(1)+' medal';
  $('result-medal').setAttribute('aria-label',award);
  const qualification=!result.qualified&&result.score>=350?' Silver and gold require deadline misses ≤ 5%'+(currentLevel===1?' and app throughput ≥ 65 work / s.':'.'):'';
  say('Run results',explanation(result)+qualification,'#benchmark-panel',machine.hotTime>1?'heat':'package');
  $('run-score').focus({preventScroll:true});$('benchmark-panel').scrollIntoView({behavior:'instant',block:'nearest'});
  announce(`${award}. ${result.score} points. You can retry or continue.`);
 }
 function updateTraffic(){
  $('traffic-value').textContent=Number($('traffic').value)*10+'%';
  $('traffic').setAttribute('aria-valuetext',`${Number($('traffic').value)*10}% receiving packets`);
  $('burst').setAttribute('aria-valuetext',BURSTS[Number($('burst').value)].name);
 }
 document.querySelectorAll('[data-role]').forEach(b=>b.addEventListener('click',()=>{if(isRunning())return;role=b.dataset.role;updateSelection();announce(`Select cores to assign ${role==='network'?POLICIES[strategy]:POLICIES[role]}.`);}));
 document.querySelectorAll('[data-policy]').forEach(b=>b.addEventListener('click',()=>{if(isRunning())return;strategy=b.dataset.policy;role='network';updateSelection();announce(`Select network cores to assign ${POLICIES[strategy]}.`);}));
 document.querySelectorAll('.strategy-help').forEach(button=>button.addEventListener('click',()=>{
  const wasOpen=button.getAttribute('aria-expanded')==='true';
  closeStrategyHelp();
  if(!wasOpen){
   const description=document.getElementById(button.getAttribute('aria-controls'));
   button.setAttribute('aria-expanded','true');button.parentElement.classList.add('help-open');
   description.classList.remove('place-above');description.hidden=false;
   const bounds=button.getBoundingClientRect(),height=description.offsetHeight;
   if(innerHeight-bounds.bottom<height+8&&bounds.top>innerHeight-bounds.bottom)description.classList.add('place-above');
  }
 }));
 document.querySelectorAll('.strategy-help').forEach(button=>button.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&button.getAttribute('aria-expanded')==='true'){event.stopPropagation();closeStrategyHelp();}
 }));
 document.addEventListener('click',event=>{
  if(!event.target.closest('.strategy-help, .strategy-choice p'))closeStrategyHelp();
 });
 ['burst','traffic'].forEach(id=>$(id).addEventListener('input',()=>{if(mode!=='sandbox'||isRunning())return;updateTraffic();updateSelection();restart();remember();}));
 $('play').addEventListener('click',()=>{if(mode!=='sandbox')return;playing=!playing;accumulator=0;updateUI();draw();});
 document.querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>enterLevel(Number(b.dataset.level))));
 $('sandbox-button').addEventListener('click',enterSandbox);$('benchmark-start').addEventListener('click',startRun);
 $('benchmark-cancel').addEventListener('click',()=>cancelRun());
 $('retry-button').addEventListener('click',()=>{if(isRunning())return;tutorial.close('retry');phase='configure';restart(false);renderCampaign();$('benchmark-start').focus({preventScroll:true});});
 $('next-level').addEventListener('click',()=>{if(mode!=='campaign')return;if(currentLevel===3)enterSandbox();else enterLevel(currentLevel+1);});
 $('hint-button').addEventListener('click',()=>{if(isRunning()||mode!=='campaign')return;hintDepth=Math.min(2,hintDepth+1);const level=Campaign.LEVELS[currentLevel];say(hintDepth===1?'Hint':'Strategy suggestion',hintDepth===1?level.hint:level.strongHint,phase==='result'?'#benchmark-panel':'#campaign-guide-anchor');$('hint-button').textContent=hintDepth===1?'More hints':'Hint';});
 $('tutorial-button').addEventListener('click',openTutorial);
 function frame(now){
  const elapsed=previous?Math.min((now-previous)/1000,.1):0;previous=now;motionTime=now/1000;
  if(isRunning())updateBenchmark(now);
  else if(mode==='sandbox'&&playing&&!document.hidden){
   accumulator+=elapsed*P.simulationSeconds/P.presentationSeconds;
   const ticks=Math.floor(accumulator/P.validationStepSeconds);
   if(ticks){machine.advanceToTicks(machine.tick+ticks);accumulator-=ticks*P.validationStepSeconds;}
  }
  if(now-lastDraw>=(reduced?150:1000/30)){machine.snapshot();draw();lastDraw=now;}
  if(now-lastUI>100){updateUI();lastUI=now;}
  if(!document.hidden)animateMetrics(elapsed);
  requestAnimationFrame(frame);
 }
 new ResizeObserver(layout).observe(canvas.parentElement);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&isRunning())cancelRun('Run canceled while the game was out of view. Your configuration is kept.');previous=0;accumulator=0;});
 updateTraffic();updateSelection();layout();enterLevel(currentLevel,true);requestAnimationFrame(frame);
})();
