/* A short, manual tour. The example never changes the player's sandbox. */
(function(){
 'use strict';
 window.IdleTutorial=function({onOpen,onClose}){
  const $=id=>document.getElementById(id),dialog=$('tutorial');
  const steps=[
   {title:'A little chip with lots of cores!',text:"Hi! I'm Turt. This multicore CPU packs four small chips, called chiplets, into one package. Each chiplet holds four cores. They share a power budget!",caption:'EXAMPLE PACKAGE · 4 CHIPLETS / 16 CORES',focus:'package'},
   {title:'Application cores do the work.',text:'Green application cores run your app: a web server, for example, or a compute-heavy task. More app work per second means higher application throughput.',caption:'GREEN = APPLICATION WORK',focus:'app'},
   {title:'Network cores handle packets.',text:'Blue network cores are datapath cores: they process incoming packets. Traffic arrives in bursts. No packets? They go idle until more arrive. How should they wait?',caption:'BLUE = NETWORK / DATAPATH WORK',focus:'network'},
   {title:'One package. One power budget.',text:'All cores share a limited power supply. When demand hits the package limit, they share the available power and run slower. Letting network cores rest can free power for apps.',caption:'SHARED POWER · MORE DEMAND = LESS PER CORE',focus:'power'},
   {title:'Too much work? Things heat up!',text:'In this game, keeping 13 or more cores active long enough heats the package to 100. Flames mean overheating! All cores slow down until the chip cools and gradually recovers.',caption:'SUSTAINED LOAD → HEAT → FLAMES → SLOWDOWN',focus:'heat'},
   {title:'Busy: always on the lookout.',text:'Busy cores keep polling for packets. They respond immediately, but burn power while idle. That leaves less power for apps and adds heat.',caption:'BUSY · FAST RESPONSE / HIGH IDLE POWER',focus:'busy'},
   {title:'Pause: take a tiny breather.',text:'Pause uses very little idle power and wakes quickly. Released power can go to app cores. Less activity also lets the chip cool, with only a short delay when packets return.',caption:'PAUSE · LOW IDLE POWER / QUICK WAKE',focus:'pause'},
   {title:'Block & lend: help the app.',text:'An idle network core switches to application work. You gain an app worker, but it still uses power and makes heat. Switching back takes longer, so packets may miss their deadline.',caption:'LEND · MORE APP WORK / SLOW NETWORK WAKE',focus:'lend'},
   {title:'Block & sleep: get some rest.',text:'Sleeping cores use minimal idle power and cool down, leaving headroom for existing app cores. Waking takes longer, so returning packets may miss their deadline.',caption:'SLEEP · MINIMAL IDLE POWER / SLOW WAKE',focus:'sleep'},
   {title:'Your turn to paint!',text:'Choose App or Network, then tap cores to assign them. For network cores, pick a waiting strategy first. Aim for high throughput and few latency deadline misses. Try different mixes!',caption:'YOUR SANDBOX STARTS WITH UNASSIGNED CORES',focus:'ready'},
  ];
  let index=0,returnFocus=null,animation=0,stepStarted=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function turtle(id,frame){
   const ctx=$(id).getContext('2d');
   const r=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
   // Each frame is a complete, transparent sprite on a 40 × 32 grid.
   const ink='#203B3A',skin='#8FD79E',light='#C8EDAD',shell='#3B9276',shade='#256756';
   ctx.clearRect(0,0,40,32);
   r(7,28,25,2,'#203B3A18');
   // Tail and alternating little feet stay inside the sprite bounds.
   r(3,20,5,3,ink);r(4,20,4,1,skin);
   r(9,24,6,4,ink);r(frame?10:8,27,6,2,ink);r(frame?11:9,27,4,1,skin);
   r(24,24,6,4,ink);r(frame?23:25,27,6,2,ink);r(frame?24:26,27,4,1,skin);
   // Rounded, stepped shell silhouette and a small honeycomb pattern.
   r(14,5,9,2,ink);r(10,7,17,2,ink);r(8,9,21,3,ink);
   r(6,12,25,10,ink);r(8,22,21,3,ink);
   r(14,7,9,2,shell);r(10,9,17,3,shell);r(8,12,21,9,shell);
   r(11,10,6,2,light);r(10,12,3,4,'#9ED799');
   r(18,10,2,3,shade);r(14,14,10,1,shade);r(13,15,2,6,shade);
   r(23,15,2,6,shade);r(17,16,5,4,'#67B58B');
   r(9,21,18,2,light);r(11,23,14,1,'#B3DA93');
   // An oversized head, blank little eye and a flat, unbothered mouth.
   r(29,11,6,2,ink);r(27,13,10,2,ink);r(26,15,12,7,ink);r(28,22,8,2,ink);
   r(29,13,6,2,skin);r(28,15,8,7,skin);r(27,17,1,4,skin);
   r(29,14,3,1,light);r(32,16,3,3,ink);r(34,16,1,1,'#FFFFFF');
   r(33,21,3,1,ink);
   r(29,22,5,1,light);

  }
  function example(focus,time=0){
   const ctx=$('tutorial-chip').getContext('2d'),t=reduced?2.8:time;
   const r=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);};
   const glyphs={D:['110','101','101','101','110'],I:['111','010','010','010','111'],E:['111','100','110','100','111'],P:['110','101','110','100','100'],O:['111','101','101','101','111'],W:['101','101','101','111','101'],R:['110','101','110','101','101'],'1':['010','110','010','010','111'],'2':['110','001','010','100','111'],'3':['110','001','010','001','110'],'4':['101','101','111','001','001']};
   const label=(text,x,y,color='#C8BFDA')=>[...text].forEach((c,k)=>(glyphs[c]||[]).forEach((row,j)=>[...row].forEach((v,i)=>{if(v==='1')r(x+k*4+i,y-6+j,1,1,color);})));

   const line=(points,color)=>{points.slice(1).forEach(([x,y],i)=>{const [a,b]=points[i],n=Math.max(Math.abs(x-a),Math.abs(y-b));for(let j=0;j<=n;j++)r(a+(x-a)*j/(n||1),b+(y-b)*j/(n||1),1,1,color);});};
   const bolt=(x,y)=>['...11','..111','.111.','11111','..11.','.11..','.1...'].forEach((row,j)=>[...row].forEach((v,i)=>{if(v==='1')r(x+i,y+j,1,1,'#E5D9FF');}));
   const railPacket=(x,returning,progress)=>{
    const points=[[x,112],[x,129],[180,129],[180,139]];
    if(!returning)points.reverse();
    const lengths=points.slice(1).map((p,i)=>Math.abs(p[0]-points[i][0])+Math.abs(p[1]-points[i][1]));
    let distance=progress*lengths.reduce((sum,v)=>sum+v,0);
    for(let i=0;i<lengths.length;i++){
     if(distance<=lengths[i]){const f=distance/(lengths[i]||1);bolt(points[i][0]+(points[i+1][0]-points[i][0])*f-3,points[i][1]+(points[i+1][1]-points[i][1])*f-4);return;}
     distance-=lengths[i];
    }
   };
   const cooling=focus==='pause'||focus==='sleep',transfer=cooling||focus==='power';
   const hot=focus==='heat'&&t%6>2,heat=focus==='heat'?Math.min(1,(t%6)/2):0;
   const lending=focus==='lend'&&(reduced||t%5>1.5);
   const busy=focus==='busy',network=['network','busy','pause','lend','sleep'].includes(focus);
   ctx.clearRect(0,0,360,144);r(0,0,360,144,'#1D1C30');
   for(let x=0;x<360;x+=12)for(let y=0;y<144;y+=12)r(x,y,1,1,'#302940');
   ctx.save();ctx.translate(0,-14);
   const centers=[];
   for(let die=0;die<4;die++){
    const x=10+die*87,app=die<2,active=focus==='package'||focus==='ready'||focus==='power'||focus==='heat'||(focus==='app'?app:network&&!app);
    r(x,30,79,82,hot?'#DC267F':active?'#B6A7F6':'#514A70');r(x+2,32,75,78,hot?'#4C213C':'#28243C');
    label('DIE '+(die+1),x+9,43);
    centers.push([x+39,118]);
    for(let core=0;core<4;core++){
     const cx=x+12+(core%2)*32,cy=51+Math.floor(core/2)*28;
     let color=app?'#009E73':'#648FFF';
     if(focus==='ready')color='#817995';
     else if(!app){if(focus==='pause')color='#B6A7F6';if(lending)color='#009E73';if(focus==='sleep')color='#A3B7EA';}
     if(heat)color=hot?'#DC267F':t%6>1?'#FFB000':color;
     r(cx-2,cy-2,24,24,'#141426');r(cx,cy,20,20,color);
     const asleep=!app&&focus==='sleep';
     r(cx+4,cy+5,2,asleep?1:3,'#141426');r(cx+14,cy+5,2,asleep?1:3,'#141426');r(cx+8,cy+11,4,1,'#141426');
     if(asleep){r(cx+14,cy+13,4,1,'#BCD0FF');r(cx+16,cy+14,1,1,'#BCD0FF');r(cx+15,cy+15,1,1,'#BCD0FF');r(cx+14,cy+16,4,1,'#BCD0FF');}
     if(app&&focus!=='ready'||!app&&lending){r(cx+3,cy+16,14,2,'#134B45');r(cx+3,cy+16,Math.floor(((t*(hot?.3:1)+core*.2)%1)*14),2,'#BAE09B');}
     if(!app&&busy){const spin=Math.floor(t*5)%4;[[4,16],[7,16],[10,16],[13,16]].forEach(([dx,dy],i)=>{if(i===spin)r(cx+dx,cy+dy,3,3,'#141426');});}
     if(!app&&focus==='pause'){r(cx+7,cy+15,2,3,'#141426');r(cx+12,cy+15,2,3,'#141426');}
    }
    if(hot){
     const frame=Math.floor(t*4)%2;
     const flame=['...r....','..ryr...','.ryyyr..','.rywyr..','..rrr...'];
     flame.forEach((row,j)=>[...row].forEach((v,i)=>{if(v!=='.')r(x+28+i*3,16+j*3-(frame&&j<2?2:0),3,3,{r:'#DC267F',y:'#FE6100',w:'#FFB000'}[v]);}));
    }
    if(cooling&&!app){
     const y=38-(t%2)*8;
     line([[x+65,y-4],[x+65,y+4]],'#BCD0FF');line([[x+61,y],[x+69,y]],'#BCD0FF');
    }
   }
   // Network packets travel into the datapath; quiet strategies show no traffic.
   if(focus==='network')for(let n=0;n<3;n++){
    const x=194+((t*.25+n/3)%1)*135;
    r(x,20,10,6,'#648FFF');line([[x,20],[x+5,24],[x+10,20]],'#E5EDFF');
   }
   // All four chiplets connect to the same supply. Released power travels from
   // network chiplets to POWER, then out to the application chiplets.
   centers.forEach(([x,y])=>line([[x,112],[x,129],[180,129],[180,141]],'#66518E'));
   r(146,139,68,18,'#39304F');label('POWER',163,151,'#D4C7FF');bolt(151,143);
   if(transfer){
    const phase=(t%4)/4;
    if(phase<.5){const p=phase*2;[2,3].forEach(i=>railPacket(centers[i][0],true,p));}
    else{const p=(phase-.5)*2;[0,1].forEach(i=>railPacket(centers[i][0],false,p));}
   }else if(focus==='package'||busy||focus==='heat'||focus==='app'||focus==='lend'){
    centers.forEach(([x],i)=>railPacket(x,false,(t*.5+i*.25)%1));
   }
   ctx.restore();
   $('tutorial-state').textContent=hot?'THROTTLED':cooling?'COOLING':lending?'LENDING TO APP':focus==='network'?'PACKETS ARRIVING':'SHARED POWER';
   $('tutorial-state').dataset.state=hot?'hot':cooling?'cool':'normal';
   const note=focus==='heat'?(hot?'100 / 100 · Half speed':'Temperature rising'):cooling?'Less heat · More app headroom':focus==='ready'?'Unassigned cores · Your mix next':lending?'Idle network cores run app work':busy?'Polling keeps using power':'Green: app · Blue: network';
   $('tutorial-visual-note').textContent=note;
   const meter=$('tutorial-heat').parentElement;
   meter.hidden=focus!=='heat'&&!cooling;
   $('tutorial-heat').style.width=Math.round(100*(cooling?.8-(t%4)/4*.6:heat))+'%';
   $('tutorial-heat').dataset.state=hot?'hot':cooling?'cool':'warm';

  }
  function animate(now){
   if(!dialog.open)return;
   example(steps[index].focus,(now-stepStarted)/1000);
   if(!reduced)animation=requestAnimationFrame(animate);
  }
  function render(){
   const step=steps[index];stepStarted=performance.now();
   $('tutorial-title').textContent=step.title;$('tutorial-text').textContent=step.text;
   $('tutorial-caption').textContent=step.caption;$('tutorial-progress').textContent=`${index+1} / ${steps.length}`;
   $('tutorial-back').disabled=index===0;
   $('tutorial-next').textContent=index===steps.length-1?"Let's play! ▸":'Next ▸';
   example(step.focus,reduced?2.8:0);
  }
  function open(){
   if(dialog.open)return;
   returnFocus=document.activeElement;index=0;render();onOpen();dialog.showModal();animation=requestAnimationFrame(animate);
  }
  $('tutorial-next').addEventListener('click',()=>{if(index===steps.length-1)dialog.close();else{index++;render();}});
  $('tutorial-back').addEventListener('click',()=>{if(index>0){index--;render();}});
  $('tutorial-skip').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{cancelAnimationFrame(animation);onClose();if(returnFocus instanceof HTMLElement&&returnFocus!==document.body)returnFocus.focus();else $('help-button').focus();});
  turtle('turtle-a',false);turtle('turtle-b',true);
  return {open};
 };
})();
