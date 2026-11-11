/* An in-place tour of the live sandbox, with no changes to player state. */
(function(){
 'use strict';
 window.IdleTutorial=function({onClose=()=>{}}={}){
  const $=id=>document.getElementById(id),dialog=$('tutorial');
  const sandboxSteps=[
   {title:'Processor cores',text:'The processor has 16 cores across four chiplets. Core assignments are kept when you enter the sandbox. You can change each core’s role and waiting strategy.',focus:'package',targets:['.chip-stage'],anchor:'.chip-stage'},
   {title:'Application cores',text:'App cores run application work. Application throughput measures how much work they complete per second. It also includes application work completed by lent network cores.',focus:'app',targets:['[data-role="app"]'],anchor:'.chip-toolbar'},
   {title:'Network cores',text:'Network cores process incoming packets. Packets arrive in bursts. A network core uses its waiting strategy when there are no packets to process.',focus:'network',targets:['[data-role="network"]'],anchor:'.chip-toolbar'},
   {title:'Busy polling',text:'Busy continuously checks for packets. It starts processing packets without a wake-up delay, but still consumes power when no packets arrive.',focus:'busy',targets:['[data-policy="busy"]'],anchor:'.controls fieldset:first-child'},
   {title:'Pause',text:'Pause reduces power use while waiting for packets. It resumes packet processing after a short delay. Lower network power use can increase application throughput when the processor reaches its power limit.',focus:'pause',targets:['[data-policy="pause"]'],anchor:'.controls fieldset:first-child'},
   {title:'Block & lend',text:'A network core assigned to Block & lend runs application work when it has no packets to process. Switching back to network processing takes time. Packet processing is slower while the core reloads network data into its cache.',focus:'lend',targets:['[data-policy="lend"]'],anchor:'.controls fieldset:first-child'},
   {title:'Block & sleep',text:'Block & sleep uses the least power while waiting. It reduces heat, but takes longer than Pause to resume packet processing. This wake-up delay can make packets miss their deadlines.',focus:'sleep',targets:['[data-policy="sleep"]'],anchor:'.controls fieldset:first-child'},
   {title:'Network burst duration',text:'Burst duration controls how long each network burst lasts. Time receiving packets controls the percentage of time packets arrive. Change these controls to compare workloads.',focus:'burst',targets:['.burst-control','.traffic-control'],anchor:'.burst-control'},
   {title:'Shared power limit',text:'All 16 cores share one power limit. When total demand exceeds the limit, the processor reduces their clock speed. Reducing power use on network cores can let application cores run faster.',focus:'power',targets:['.power-strip:not(.temperature-strip)'],anchor:'.power-strip:not(.temperature-strip)'},
   {title:'Overheating',text:'Keeping 13 or more cores active can raise processor temperature to 100. At that limit, clock speed is halved. Clock speed recovers after the processor cools.',focus:'heat',targets:['.temperature-strip'],anchor:'.temperature-strip'},
   {title:'Performance metrics',text:'Application throughput counts completed app work per second. Network throughput counts delivered packets per second. Deadline misses count packets that were not delivered on time. Higher throughput and fewer misses are better.',focus:'metrics',targets:['.metrics'],anchor:'.metrics'},
   {title:'Sandbox controls',text:'Pause stops the simulation. Use Unassigned to remove a core’s assignment. The sandbox has no score. Select a level to run another scored benchmark.',focus:'ready',targets:['#play'],anchor:'.chip-toolbar'},
  ];
  let steps=sandboxSteps,single=false,scroll=true,intro=false,finalLabel="Done";
  let index=0,returnFocus=null,animation=0,stepStarted=0,opened=false,highlighted=[];
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
   behemoth(opened?(performance.now()-stepStarted)/1000:0);
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
  function clearHighlights(){
   highlighted.forEach(el=>el.classList.remove('tutorial-target'));
   highlighted=[];
  }
  function animate(now){
   if(!opened)return;
   behemoth((now-stepStarted)/1000);
   if(!reduced)animation=requestAnimationFrame(animate);
  }
  function positionIntro(){
   if(!opened||!dialog.classList.contains('is-intro'))return;
   const title=document.querySelector('.title h1'),heading=title.getBoundingClientRect();
   const range=document.createRange();range.selectNode(title.firstChild);
   const textBounds=range.getBoundingClientRect(),secondLine=title.querySelector('span').getBoundingClientRect();
   const spriteWidth=$('behemoth').getBoundingClientRect().width;
   const left=Math.max(10,Math.min(innerWidth-dialog.offsetWidth-10,Math.min(textBounds.left,secondLine.left)-spriteWidth-12));
   dialog.classList.toggle('has-left-space',left>=210);
   dialog.style.setProperty('--intro-left',`${left+scrollX}px`);
   dialog.style.setProperty('--intro-top',`${heading.top+scrollY}px`);
   dialog.style.setProperty('--intro-heading-height',`${heading.height}px`);
  }
  function render(){
   const step=steps[index];stepStarted=performance.now();
   const initial=intro&&index===0;
   dialog.classList.toggle('is-intro',initial);
   if(initial){
    const title=document.querySelector('.title h1'),bounds=title.getBoundingClientRect();
    if(bounds.top<0||bounds.bottom>innerHeight)title.scrollIntoView({behavior:'instant',block:'start'});
    positionIntro();
   }
   clearHighlights();
   (step.targets||[]).forEach(selector=>{
    const el=document.querySelector(selector);
    if(el){el.classList.add('tutorial-target');highlighted.push(el);}
   });
   $('tutorial-title').textContent=step.title;$('tutorial-text').textContent=step.text;
   $('tutorial-progress').textContent=`${index+1} / ${steps.length}`;
   $('tutorial-progress-bar').style.width=`${(index+1)/steps.length*100}%`;
   $('tutorial-back').disabled=index===0;
   $('tutorial-next').textContent=index===steps.length-1?finalLabel:'Next ▸';
   $('tutorial-skip').textContent=single?'Dismiss':'Skip';
   ['tutorial-back','tutorial-next','tutorial-progress'].forEach(id=>$(id).hidden=single);
   $('tutorial-progress-bar').parentElement.hidden=single;
   behemoth();
   // Keep the highlighted control visible above the floating guide.
   if(scroll&&!initial){
    const target=highlighted[0]||document.querySelector(step.anchor);
    if(target){
     const bounds=target.getBoundingClientRect(),guideTop=dialog.getBoundingClientRect().top;
     if(bounds.bottom<0||bounds.top>guideTop-24)target.scrollIntoView({behavior:'instant',block:'center'});
    }
   }
  }
  function open(options={}){
   if(!opened)returnFocus=document.activeElement;
   cancelAnimationFrame(animation);
   steps=options.steps||sandboxSteps;single=Boolean(options.single);scroll=options.scroll!==false;intro=Boolean(options.intro);finalLabel=options.finalLabel||'Done';
   index=0;opened=true;dialog.hidden=false;render();
   if(options.focus!==false&&!single)$('tutorial-next').focus({preventScroll:true});
   animation=requestAnimationFrame(animate);
  }
  function say(message){open({steps:[message],single:true,focus:false,scroll:false});}
  function close(reason="dismiss"){
   if(!opened)return;
   opened=false;dialog.hidden=true;clearHighlights();cancelAnimationFrame(animation);
   if(returnFocus instanceof HTMLElement&&returnFocus!==document.body)returnFocus.focus({preventScroll:true});
   else $('tutorial-button').focus({preventScroll:true});
   onClose(reason);
  }
  $('tutorial-next').addEventListener('click',()=>{if(index===steps.length-1)close('finish');else{index++;render();}});
  $('tutorial-back').addEventListener('click',()=>{if(index>0){index--;render();}});
  $('tutorial-skip').addEventListener('click',()=>close('skip'));
  window.addEventListener('resize',positionIntro);
  document.fonts?.ready.then(positionIntro);
  document.addEventListener('keydown',event=>{
   if(opened&&event.key==='Escape'&&!document.querySelector('dialog[open]')){event.preventDefault();close();}
  });
  return {open,close,say};
 };
})();
