/* A short, manual tour. The example never changes the player's sandbox. */
(function(){
 'use strict';
 window.IdleTutorial=function({onOpen,onClose}){
  const $=id=>document.getElementById(id),dialog=$('tutorial');
  const steps=[
   {title:'A chip with lots of cores!',text:"I'm Behemoth. Your guide to this infernal machine. Four chiplets share one power budget, with four cores on each chiplet. Let's see what happens when some of them wait.",caption:'EXAMPLE PACKAGE · 4 CHIPLETS / 16 CORES',focus:'package'},
   {title:'Application cores do the work.',text:'Green application cores run your app: a web server, for example, or a compute-heavy task. More app work per second means higher application throughput.',caption:'GREEN = APPLICATION WORK',focus:'app'},
   {title:'Network cores handle packets.',text:'Blue network cores are datapath cores: they process incoming packets. Traffic arrives in bursts. No packets? They go idle until more arrive. How should they wait?',caption:'BLUE = NETWORK / DATAPATH WORK',focus:'network'},
   {title:'One package. One power budget.',text:'All cores share a limited power supply. When demand hits the package limit, they share the available power and run slower. Letting network cores rest can free power for apps.',caption:'SHARED POWER · MORE DEMAND = LESS PER CORE',focus:'power'},
   {title:'Too much work? Things heat up!',text:'In this sandbox, keeping 13 or more cores active long enough heats the package to 100. Flames mean overheating! All cores slow down until the chip cools and gradually recovers.',caption:'SUSTAINED LOAD → HEAT → FLAMES → SLOWDOWN',focus:'heat'},
   {title:'Busy: always on the lookout.',text:'Busy cores keep polling for packets. They respond immediately, but burn power while idle. That leaves less power for apps and adds heat.',caption:'BUSY · FAST RESPONSE / HIGH IDLE POWER',focus:'busy'},
   {title:'Pause: take a tiny breather.',text:'Pause uses very little idle power and wakes quickly. Released power can go to app cores. Less activity also lets the chip cool, with only a short delay when packets return.',caption:'PAUSE · LOW IDLE POWER / QUICK WAKE',focus:'pause'},
   {title:'Block & lend: help the app.',text:'An idle network core switches to application work. You gain an app worker, but it still uses power and makes heat. Switching back takes longer, so packets may miss their deadline.',caption:'LEND · MORE APP WORK / SLOW NETWORK WAKE',focus:'lend'},
   {title:'Block & sleep: get some rest.',text:'Sleeping cores use minimal idle power and cool down, leaving headroom for existing app cores. Waking takes longer, so returning packets may miss their deadline.',caption:'SLEEP · MINIMAL IDLE POWER / SLOW WAKE',focus:'sleep'},
   {title:'Your turn to explore!',text:"There's no win condition. Explore the paper's tradeoffs: choose App or Network, pick a waiting strategy, then tap cores. Change one choice at a time and watch throughput, latency and heat.",caption:"EXPLORE THE PAPER'S TRADEOFFS",focus:'ready'},
  ];
  let index=0,returnFocus=null,animation=0,stepStarted=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Layer the reference sprite into a breathing body, expressive head and articulated bottle arm.
  const behemothArt=new Image(),behemothSprite=document.createElement('canvas');
  behemothSprite.width=56;behemothSprite.height=65;
  const bottlePixels=document.createElement('canvas');bottlePixels.width=32;bottlePixels.height=32;
  let lastBehemothFrame='',behemothReady=false;
  behemothArt.addEventListener('load',()=>{
   const pixels=behemothSprite.getContext('2d');pixels.imageSmoothingEnabled=false;
   pixels.drawImage(behemothArt,0,0,56,65);
   behemothReady=true;lastBehemothFrame='';
   behemoth(dialog.open?(performance.now()-stepStarted)/1000:0);
  });
  // Precomputed 64 × 74, 16-colour sprite. Embed it so file:// previews also
  // work without canvas readback or a separate asset request.
  behemothArt.src='data:image/png;base64,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';
  function behemoth(time=0){
   if(!behemothReady)return;
   const hot=steps[index].focus==='heat',t=reduced?0:time;
   const ease=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
   // Twelve deliberate poses per second, with six stepped bottle angles.
   const poseTime=Math.floor(t*12)/12;
   const lift=hot?ease((poseTime-.9)/1.1)*(1-ease((poseTime-3.3)/.9)):0;
   const tip=hot?Math.round(5*ease((poseTime-2)/.55)*(1-ease((poseTime-3.05)/.45)))/5:0;
   const flame=hot?ease((t-4.85)/.3)*(1-ease((t-5.7)/.65)):0;
   const frame=reduced?'still':(hot?'heat:':'idle:')+Math.floor(t*24);
   if(frame===lastBehemothFrame)return;
   lastBehemothFrame=frame;
   const ctx=$('behemoth').getContext('2d');
   ctx.setTransform(4,0,0,4,0,0);ctx.clearRect(0,0,64,74);
   ctx.imageSmoothingEnabled=false;
   const r=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));};
   // Source coordinates stay in the original 64 × 74 art grid. The stored
   // layer is 56 × 65, so its larger, clean pixels remain visible at game size.
   const patch=(sx,sy,sw,sh,dx,dy,dw=sw,dh=sh)=>ctx.drawImage(behemothSprite,sx*56/64,sy*65/74,sw*56/64,sh*65/74,dx,dy,dw,dh);
   const breath=reduced?0:Math.sin(t*1.65)*.55;
   const bob=-breath*.65;
   // Keep feet planted while the torso expands and the head settles gently.
   patch(0,23,64,51,0,23-breath,64,51+breath);
   // Rebuild the resting forearm area with matching belly fur underneath the
   // movable limb. The paw belongs to the animated arm, not to the base layer.
   patch(26,35,13,17,39,35-breath,13,17);
   patch(0,0,64,24,0,bob);
   const blink=!reduced&&t%5.8>5.6;
   if(blink){
    r(29,13+bob,5,3,'#282A3B');r(38,13+bob,5,3,'#282A3B');
    r(30,14+bob,4,1,'#BA7E35');r(38,14+bob,4,1,'#BA7E35');
   }
   // Connected shoulder → elbow → wrist. Each link follows the same eased
   // movement as the bottle, so he holds it all the way to his mouth.
   const sway=reduced?0:Math.sin(t*1.65+.4)*.3;
   const gx=Math.round(48-4*lift+sway*(1-lift)),gy=Math.round(44-21*lift-breath*.5);
   const shoulder=[50,Math.round(33-breath)],elbow=[Math.round(53-2*lift),Math.round(39-10*lift-breath*.5)];
   const limb=(a,b,radius,color)=>{
    const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);
    for(let n=0;n<=steps;n++){
     const x=a[0]+(b[0]-a[0])*n/(steps||1),y=a[1]+(b[1]-a[1])*n/(steps||1);
     for(let j=-radius;j<=radius;j++){
      const width=Math.floor(Math.sqrt(Math.max(0,radius*radius-j*j)));
      r(x-width,y+j,Math.max(1,width*2),1,color);
     }
    }
   };
   limb(shoulder,elbow,4,'#1C1D29');limb(elbow,[gx,gy+1],3,'#373B50');
   limb([elbow[0]-1,elbow[1]-2],[gx-1,gy-1],1,'#626C83');
   // Long-neck green vodka bottle, cream label and red neck seal. The neck
   // lands at the muzzle when tilted; the gripping paw rotates with the bottle.
   const bottle=bottlePixels.getContext('2d');
   bottle.setTransform(1,0,0,1,0,0);bottle.clearRect(0,0,32,32);
   bottle.imageSmoothingEnabled=false;
   bottle.translate(16,16);bottle.rotate(-tip*1.1);
   const pixel=(x,y,w,h,c)=>{bottle.fillStyle=c;bottle.fillRect(x,y,w,h);};
   pixel(-2,-10,3,4,'#A9CA8D');pixel(-2,-7,4,2,'#648B65');
   pixel(-3,-5,6,10,'#244D47');pixel(-2,-5,4,10,'#44765E');
   pixel(-2,-4,1,7,'#8DB78A');pixel(-2,-10,3,1,'#D5C3A2');
   pixel(-2,-8,3,1,'#B65170');pixel(-2,-2,4,4,'#E4D5AB');
   // A tiny V on the label reads at this scale without blurred lettering.
   pixel(-1,-1,1,1,'#81344C');pixel(1,-1,1,1,'#81344C');pixel(0,0,1,1,'#81344C');
   pixel(-4,1,4,3,'#282A3B');pixel(-4,1,3,1,'#626C83');
   pixel(-3,3,4,1,'#1C1D29');pixel(-3,2,1,1,'#8792A5');
   ctx.drawImage(bottlePixels,gx-16,gy-16,32,32);
   if(flame>0){
    const mouthY=18+Math.round(bob);
    r(35,mouthY-1,3,2,'#11121B');r(35,mouthY+1,3,1,'#BA7E35');
    // Four hand-shaped flame frames on a two-pixel grid. Solid colour blocks
    // replace the subpixel sine wave; length grows and fades in whole columns.
    const flames=[
     ['.....oo..o..','..oooyoooo..','ooyywwwyyooo','..ooyyyoooo.','.....oo..o..'],
     ['....oo...o..','..ooyyooooo.','oyywwwwyyooo','..ooyyoooo..','....ooo...o.'],
     ['.....o..oo..','..ooyooooo..','oyyywwwyyyoo','..ooyyyoooo.','.....ooo.o..'],
     ['....ooo..o..','..ooyyoooo..','ooywwwwyyyoo','..ooyyooooo.','.....oo...o.']
    ];
    const cells=flames[Math.floor(t*10)%flames.length];
    const columns=Math.max(1,Math.round(12*flame));
    const colors={o:'#ED7046',y:'#FFD36A',w:'#FFF0BC'};
    cells.forEach((row,y)=>[...row].forEach((c,x)=>{
     if(colors[c]&&x<columns)r(36+x*2,mouthY-4+y*2,2,2,colors[c]);
    }));
    const sparkFrame=Math.floor(t*10);
    for(let n=0;n<2;n++){
     const step=(sparkFrame+n*3)%6;
     if(step<4)r(40+step*4,mouthY+(n?1:-1)*(2+step),2,2,'#FFD36A');
    }
   }
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
   const time=(now-stepStarted)/1000;
   example(steps[index].focus,time);behemoth(time);
   if(!reduced)animation=requestAnimationFrame(animate);
  }
  function render(){
   const step=steps[index];stepStarted=performance.now();
   $('tutorial-title').textContent=step.title;$('tutorial-text').textContent=step.text;
   $('tutorial-caption').textContent=step.caption;$('tutorial-progress').textContent=`${index+1} / ${steps.length}`;
   $('tutorial-back').disabled=index===0;
   $('tutorial-next').textContent=index===steps.length-1?'Explore ▸':'Next ▸';
   example(step.focus,reduced?2.8:0);behemoth();
  }
  function open(){
   if(dialog.open)return;
   returnFocus=document.activeElement;index=0;render();onOpen();dialog.showModal();animation=requestAnimationFrame(animate);
  }
  $('tutorial-next').addEventListener('click',()=>{if(index===steps.length-1)dialog.close();else{index++;render();}});
  $('tutorial-back').addEventListener('click',()=>{if(index>0){index--;render();}});
  $('tutorial-skip').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{cancelAnimationFrame(animation);onClose();if(returnFocus instanceof HTMLElement&&returnFocus!==document.body)returnFocus.focus();else $('help-button').focus();});
  return {open};
 };
})();
