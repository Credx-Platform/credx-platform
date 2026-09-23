/* CredX public scroll narrative. Native scroll, no renderer or dependencies.
 * One event-driven rAF, cached layout, reversible timelines, bounded randomized cyber streaks.
 * Content remains visible before JS, in reduced motion and on failure.
 */
(() => {
 'use strict';
 const root=document.documentElement;
 // CSS keeps scroll-behavior instant so the browser restores a mid-page refresh
 // without animating the whole document. Only actual input enables smooth
 // anchor navigation: a timer can race late native history restoration.
 const enableSmooth=()=>root.classList.add('smooth-scroll');
 for(const type of ['pointerdown','keydown','wheel','touchstart'])
  addEventListener(type,enableSmooth,{once:true,passive:true});

 const hero=document.getElementById('hero'),runway=document.getElementById('heroRunway');
 const portal=document.getElementById('interfaceRunway');
 if(!hero||!runway||!portal)return;
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 const clamp=v=>Math.max(0,Math.min(1,v));
 // Shared smooth acceleration/deceleration. Position follows scroll immediately;
 // no interpolation tail, spring, scroll interception, or synthetic momentum.
 const ease=v=>{v=clamp(v);return v*v*(3-2*v)};
 const art=hero.querySelector('.hero-art'),heroCopy=hero.querySelector('.hero-copy'),heroGrid=hero.querySelector('.hero-grid');
 const frames=[...portal.querySelectorAll('.portal-frames i')];
 const dash=portal.querySelector('.dash-ui');
 const tracks=[
  {id:'how',selector:'.step',kind:'rise'},
  {id:'testimonials',selector:'.test-card',kind:'slide'},
  {id:'masterclass-curriculum',selector:'.cur-card',kind:'pop'},
  {id:'faq',selector:'.faq-item',kind:'fade'},
  {id:'modules',selector:'.md-card',kind:'fan'},
  {id:'breakdown',selector:'.bd-cat',kind:'scale'},
  {id:'action-plan',selector:'.pl-item',kind:'stack'},
  {id:'progress',selector:'.pg-card',kind:'pop'},
  {id:'funding',selector:'.fr-item',kind:'stack'},
  {id:'chat',selector:'.chat-window',kind:'focus'},
  {host:'.hero-bridge',selector:'.rc-card',kind:'slide'}
 ].map(t=>({...t,el:t.host?document.querySelector(t.host):document.getElementById(t.id)}));
 // Site-wide now: the pattern layer lives on <body>, not inside the hero.
 const energy=document.querySelector('.data-trails');
 // One canvas draws every trail; paths are generated per spawn, never replayed.
 const canvas=document.createElement('canvas'),pen=canvas.getContext('2d');
 energy.replaceChildren(canvas);
 const random=(a,b)=>a+Math.random()*(b-a);
 const about=document.getElementById('about'),aboutContent=about.querySelector('.about-inner');
 const aboutTransition=document.querySelector('.about-transition'),aboutVeil=aboutTransition.querySelector('.about-veil');
 const aboutFrames=[...aboutTransition.querySelectorAll('.about-gateway i')];
 const aboutRunway=document.getElementById('aboutRunway'),aboutLogo=aboutTransition.querySelector('.portal-logo');
 const socialRow=about.querySelector('.about-socials'),aboutBackdrop=document.querySelector('.about-backdrop'),aboutSpace=about.querySelector('.about-content-space');
 const socials=[...socialRow.querySelectorAll('a')];
 let dispose=()=>{},suspend=()=>{},resume=()=>{},degraded=false;
 const weak=()=>navigator.connection?.saveData||
  (navigator.deviceMemory>0&&navigator.deviceMemory<=4)||
  (navigator.hardwareConcurrency>0&&navigator.hardwareConcurrency<=2);
 function mount(){
  dispose();
  const abort=new AbortController(),opts={passive:true,signal:abort.signal};
  let skipAbout=location.hash==='#about',socialAnnounced=false,socialOffset=0;
  let raf=0,dirty=true,paused=false,view=innerHeight,width=innerWidth,portalBusy=false;
  let heroTop=0,heroDistance=1,portalTop=0,portalDistance=1,aboutTop=0,aboutHeight=1,aboutTravel=1;
  const darts=[];
  let lastScrollY=scrollY,pendingScroll=0,streakTravel=0,nextStreak=80,flight=0,flightAt=0;
  let slowFrames=0,samples=0,observer,layoutObserver;
  const simple=degraded||weak()||innerWidth<768;
  const animated=new Set([art,...frames,dash,aboutContent,aboutLogo,aboutTransition,aboutBackdrop,...aboutFrames,...socials]);
  const active=new Set();
  function reset(){
   root.classList.remove('cinematic-ready','narrative-ready','motion-simple');
   hero.classList.remove('scene-active');
   runway.style.removeProperty('--hero-height');runway.style.removeProperty('--pin-top');
   portal.style.removeProperty('--interface-height');portal.style.removeProperty('--interface-pin');
   animated.forEach(el=>{el.style.removeProperty('transform');el.style.removeProperty('opacity');el.style.removeProperty('will-change');el.style.removeProperty('clip-path');el.style.removeProperty('pointer-events')});
   aboutRunway.classList.remove('about-portal-active');socialRow.classList.remove('social-highlight');aboutSpace.style.removeProperty('height');aboutRunway.style.removeProperty('--about-content-top');
   aboutVeil.style.removeProperty('--iris-radius');
   aboutRunway.style.removeProperty('--about-height');aboutRunway.style.removeProperty('--about-travel');
   energy.style.removeProperty('opacity');hero.style.removeProperty('--journey-fill');hero.style.removeProperty('--hero-art-cap');
  }
  function wipe(){if(pen){pen.setTransform(1,0,0,1,0,0);pen.clearRect(0,0,canvas.width,canvas.height)}}
  function stopStreaks(){cancelAnimationFrame(flight);flight=0;darts.length=0;energy.dataset.live='0';wipe();pendingScroll=0;streakTravel=0;nextStreak=80;}
  suspend=()=>{paused=true;cancelAnimationFrame(raf);raf=0;stopStreaks();hero.classList.remove('scene-active')};
  dispose=()=>{suspend();abort.abort();observer?.disconnect();layoutObserver?.disconnect();reset()};
  if(preference.matches)return;
  root.classList.add('cinematic-ready','narrative-ready');
  root.classList.toggle('motion-simple',!!simple);
  const scenes=tracks.map(t=>({...t,items:[...t.el.querySelectorAll(t.selector)],top:0,height:0}));
  scenes.forEach(t=>t.items.forEach(el=>animated.add(el)));
  function schedule(){if(!raf&&!document.hidden&&!paused)raf=requestAnimationFrame(draw)}
  // Scroll launches a trail; its autonomous flight finishes after input stops.
  // No timer launches new trails while the page is idle.
  function advanceStreaks(delta){
   // Keep the 3D scene on mobile, but remove the canvas trail workload that
   // competed with Safari's touch-scroll compositor.
   if(simple)return;
   if(!delta)return;
   streakTravel+=Math.abs(delta);
   if(streakTravel>=nextStreak){
    spawnStreak(delta);streakTravel=0;
    nextStreak=random(simple?280:340,simple?480:580);
   }
  }
  // 8bit.ai-style darting light: a fine filament, tapered at both ends, whose
  // heading swerves at random mid-flight. Bold enough to read over the cards.
  function spawnStreak(){
   if(!pen||darts.length>=(simple?2:3))return;
   const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(width*dpr),h=Math.round(view*dpr);
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
   const reach=Math.max(width,view);
   // Diagonal headings in all four quadrants: no vertical rain, no flat bars over copy.
   const heading=random(.3,1.25)*(Math.random()<.5?-1:1)+(Math.random()<.5?0:Math.PI);
   const speed=reach*random(1.1,1.7),lead=speed*.22;
   const x=random(width*.15,width*.85)-Math.cos(heading)*lead,y=random(view*.2,view*.8)-Math.sin(heading)*lead;
   const length=reach*random(.3,.55);
   darts.push({points:[{x,y}],x,y,heading,speed,length,full:length,turn:0,swerve:0,nextSwerve:0,age:0,
    life:random(.75,1.2),core:random(.8,1.3),glow:random(.75,1)});
   energy.dataset.live=String(darts.length);
   if(!flight){flightAt=performance.now();flight=requestAnimationFrame(fly)}
  }
  // Strokes the stretch of the trail whose taper exceeds `floor` as one path,
  // so joints never double up into beads.
  function trace(points,along,total,floor){
   const body=k=>Math.sin(Math.PI*Math.pow(along[k]/total,1.6));
   let a=0,b=points.length-1;
   while(a<b&&body(a)<floor)a++;
   while(b>a&&body(b)<floor)b--;
   if(b-a<1)return;
   pen.beginPath();pen.moveTo(points[a].x,points[a].y);
   for(let k=a+1;k<=b;k++)pen.lineTo(points[k].x,points[k].y);
   pen.stroke();
  }
  function fly(now){
   flight=0;
   try{
    const dt=Math.min(.05,(now-flightAt)/1000);flightAt=now;
    wipe();
    const dpr=canvas.width/width;
    pen.setTransform(dpr,0,0,dpr,0,0);
    pen.globalCompositeOperation='lighter';pen.lineCap='round';pen.lineJoin='round';
    for(let i=darts.length-1;i>=0;i--){
     const d=darts[i];d.age+=dt;
     if(d.age>=d.nextSwerve){d.swerve=random(-1,1)*(portalBusy?2.6:1.8);d.nextSwerve=d.age+random(.12,.3)}
     d.turn+=(d.swerve-d.turn)*Math.min(1,dt*10);d.heading+=d.turn*dt;
     d.x+=Math.cos(d.heading)*d.speed*dt;d.y+=Math.sin(d.heading)*d.speed*dt;
     d.points.push({x:d.x,y:d.y});
     // Past its life the head keeps flying while the tail catches up.
     if(d.age>d.life)d.length-=d.speed*dt*1.4;
     if(d.length<=0||d.age>d.life+2){darts.splice(i,1);continue}
     const pts=d.points;let run=0;
     for(let k=pts.length-1;k>0;k--){
      const seg=Math.hypot(pts[k].x-pts[k-1].x,pts[k].y-pts[k-1].y);
      if(run+seg>=d.length){
       const f=(d.length-run)/seg;
       pts[k-1].x=pts[k].x+(pts[k-1].x-pts[k].x)*f;pts[k-1].y=pts[k].y+(pts[k-1].y-pts[k].y)*f;
       pts.splice(0,k-1);break;
      }
      run+=seg;
     }
     if(pts.length<2)continue;
     const along=[0];
     for(let k=1;k<pts.length;k++)along.push(along[k-1]+Math.hypot(pts[k].x-pts[k-1].x,pts[k].y-pts[k-1].y));
     const total=along[along.length-1]||1,tail=pts[0];
     const alpha=Math.min(1,d.age/.12)*d.glow*(d.age>d.life?Math.max(0,d.length/d.full):1);
     pen.strokeStyle='rgb(0,158,214)';
     pen.globalAlpha=.09*alpha;pen.lineWidth=d.core*8;trace(pts,along,total,0);
     pen.strokeStyle='rgb(94,214,249)';
     pen.globalAlpha=.15*alpha;pen.lineWidth=d.core*4;trace(pts,along,total,.5);
     const tone=pen.createLinearGradient(tail.x,tail.y,d.x,d.y);
     tone.addColorStop(0,'rgba(38,148,204,0)');tone.addColorStop(.35,'rgba(38,148,204,.5)');
     tone.addColorStop(.8,'#72d8f6');tone.addColorStop(1,'#e3faff');
     pen.strokeStyle=tone;
     for(const [floor,size,strength] of [[0,1,.55],[.4,1.7,.35],[.75,2.4,.3]]){
      pen.globalAlpha=strength*alpha;pen.lineWidth=d.core*size;trace(pts,along,total,floor);
     }
    }
    pen.globalAlpha=1;
    energy.dataset.live=String(darts.length);
    if(darts.length)flight=requestAnimationFrame(fly);else wipe();
   }catch(error){dispose();console.warn('CredX motion disabled; static content remains available.');}
  }
  resume=()=>{if(abort.signal.aborted||preference.matches)return;paused=false;dirty=true;lastScrollY=scrollY;schedule()};
  function measure(){
   width=innerWidth;view=innerHeight;
   // Read first, write spacer variables, then cache positions in one layout pass.
   const h=hero.offsetHeight,dh=portal.querySelector('section').offsetHeight;
   // Read every hero metric before writing, then size the artwork from the space
   // the headline leaves. Keeps the scene uncropped and --pin-top at 0, so the
   // headline stays put while only the composition scales.
   const heroStyle=getComputedStyle(hero);
   const spare=hero.clientHeight-parseFloat(heroStyle.paddingTop)-parseFloat(heroStyle.paddingBottom)
    -heroCopy.offsetHeight-(parseFloat(getComputedStyle(heroGrid).rowGap)||0);
   hero.style.setProperty('--hero-art-cap',`${Math.max(240,spare*(width<768?1.25:2.1))}px`);
   runway.style.setProperty('--hero-height',`${h}px`);
   runway.style.setProperty('--pin-top',`${Math.min(0,view-h)}px`);
   portal.style.setProperty('--interface-height',`${dh}px`);
   portal.style.setProperty('--interface-pin',`${Math.min(70,view-dh)}px`);
   heroTop=runway.getBoundingClientRect().top+scrollY;
   heroDistance=Math.max(1,runway.offsetHeight-h);
   portalTop=portal.getBoundingClientRect().top+scrollY;
   portalDistance=Math.max(1,portal.offsetHeight-dh);
   aboutSpace.style.height=`${aboutContent.offsetHeight}px`;
   aboutRunway.style.setProperty('--about-content-top',`${80+parseFloat(getComputedStyle(about).paddingTop)}px`);
   aboutHeight=about.offsetHeight;aboutTravel=view*.62;socialOffset=socialRow.offsetTop;
   aboutRunway.style.setProperty('--about-height',`${aboutHeight}px`);
   aboutRunway.style.setProperty('--about-travel',`${aboutTravel}px`);
   aboutTop=aboutRunway.getBoundingClientRect().top+scrollY;
   scenes.forEach(t=>{
    t.top=t.el.getBoundingClientRect().top+scrollY;t.height=t.el.offsetHeight;
    t.itemTops=t.items.map(el=>{let top=0;for(let node=el;node;node=node.offsetParent)top+=node.offsetTop;return top});
   });
   dirty=false;
  }
  function draw(){
   raf=0;const started=performance.now();
   try{
    if(dirty)measure();
    const y=scrollY;

    // Start the full-screen iris only after the chat chapter clears the header.
    // It must never cover the still-visible conversation with a moving block.
    const progress=skipAbout?1:clamp((y-aboutTop+80)/aboutTravel);
    const entrance=ease(progress/.78),reveal=ease((progress-.08)/.62),clear=ease((progress-.78)/.2);
    portalBusy=progress>0&&progress<1;
    const scrollDelta=pendingScroll;pendingScroll=0;advanceStreaks(scrollDelta);
    const bottom=aboutTop+aboutTravel+aboutHeight-y;
    const exit=ease((view*.32-bottom)/(view*.38));
    const focused=about.matches(':focus-within');
    aboutRunway.classList.toggle('about-portal-active',progress>0&&progress<1&&!focused);
    aboutContent.style.clipPath='none';
    aboutContent.style.transform='none';
    aboutContent.style.opacity=String(reveal*(1-exit));
    const diameter=Math.min(width*.72,440);
    const fullScale=Math.hypot(width,view)*1.3/(diameter*.82);
    const ringScale=.62+entrance*(fullScale-.62);
    aboutVeil.style.setProperty('--iris-radius',`${diameter*.41*ringScale}px`);
    const curtain=focused?0:ease(progress/.04)*(1-clear);
    aboutTransition.style.opacity=String(curtain);aboutBackdrop.style.opacity=String(curtain);
    aboutFrames.forEach((el,i)=>{
     el.style.transform=`scale(${.62+entrance*(fullScale-.62)+i*.1}) rotate(${entrance*(i%2?16:-12)}deg)`;
     el.style.opacity=String((1-clear)*(.92-i*.22));
    });
    aboutLogo.style.transform=`scale(${.85+entrance*.18})`;
    aboutLogo.style.opacity=String(1-ease(progress/.14));
    const socialCenter=aboutTop+Math.min(Math.max(y+80-aboutTop,0),aboutTravel)+socialOffset+26-y;
    const socialReveal=ease((view*.8-socialCenter)/(view*.3));
    if(socialReveal>.25&&!socialAnnounced){socialAnnounced=true;socialRow.classList.add('social-highlight')}
    socials.forEach((el,i)=>{
     const pop=ease((socialReveal-i*.025)/.95);
     const fade=1-ease((view*.15-socialCenter)/(view*.22));
     el.style.opacity=String(pop*fade);
     el.style.pointerEvents=pop*fade<.01?'none':'auto';
     el.style.transform=`translate3d(0,${(1-pop)*22}px,0) scale(${.88+.12*pop})`;
    });
    if(active.has(runway)){
     const p=clamp((y-heroTop-12)/Math.max(1,heroDistance-12)),e=ease(p);
     // Keep the same eased scroll timing while cutting the prior 2x→4x
     // composition in half: the artwork should stay clear of the copy and
     // only reach a controlled 2x endpoint after scrolling.
     const artStartScale=1;
     const artEndScale=3;
     art.style.transform=`translate3d(0,${-e*(simple?5:14)}px,0) scale(${artStartScale+(artEndScale-artStartScale)*e})`;
    }
    if(active.has(portal)){
     const p=clamp((y-portalTop+view*.38)/(portalDistance+view*.38));
     const e=ease(p);
     dash.style.transform=`perspective(1400px) translate3d(${(1-e)*(simple?36:90)}px,${(1-e)*(simple?12:40)}px,0) rotateX(${(1-e)*(simple?0:9)}deg) scale(${(simple?.97:.88)+(simple?.03:.12)*e})`;
     frames.forEach((el,i)=>{
      const q=ease((p-i*.07)/.78);
      el.style.transform=`translate3d(0,0,0) scale(${.78+q*(simple?.6:2.35)+i*.09}) rotateY(${(1-q)*(simple?0:-7)}deg)`;
      el.style.opacity=String((1-ease((p-.48)/.45))*(.5-i*.1));
     });
    }
    scenes.forEach(t=>{
     if(t.top-y>view+120||t.top+t.height-y<-120)return;
     // Each card has its own entrance, so lower rows do not animate offscreen.
     // Section headings and primary navigation stay still and readable.
     t.items.forEach((el,i)=>{
      const p=clamp((view*.95-(t.itemTops[i]-y))/Math.min(view*.38,320));
      const e=ease((p-(i%3)*.035)/.9),rest=1-e,side=i%2?1:-1;
      let x=side*rest*(simple?22:38),lift=rest*(simple?24:36),scale=1,z=0,rotate=0;
      if(t.kind==='slide'||t.kind==='stack'){x=side*rest*(simple?76:150);lift=rest*14;}
      if(t.kind==='fan'){x=side*rest*(simple?58:110);scale=1-rest*.06;rotate=simple?0:side*rest*4;}
      if(t.kind==='scale'){scale=1-rest*.16;lift=rest*20;}
      if(t.kind==='pop'){lift=rest*(simple?64:90);scale=1-rest*.13+Math.sin(e*Math.PI)*.025;}
      if(t.kind==='fade'){x=side*rest*12;lift=rest*8;}
      if(t.kind==='rise')lift=rest*(simple?54:78);
      if(t.kind==='focus'){scale=1-rest*.12;z=simple?0:-rest*90;}
      el.style.transform=e===1?'none':`perspective(1200px) translate3d(${x}px,${lift}px,${z}px) rotateY(${rotate}deg) scale(${scale})`;
      el.style.opacity=String(.18+.82*e);
     });
    });
    // Degrade costly choreography if our own callbacks repeatedly exceed a
    // frame budget. Never depend on WebGL support or block content on detection.
    if(!simple){samples++;if(performance.now()-started>14)slowFrames++;
     if(samples>=24){if(slowFrames>=6){degraded=true;mount();return}samples=slowFrames=0;}}
   }catch(error){dispose();console.warn('CredX motion disabled; static content remains available.');}
  }
  observer=new IntersectionObserver(entries=>{
   entries.forEach(e=>{
    if(e.isIntersecting)active.add(e.target);else active.delete(e.target);
    if(e.target===runway)hero.classList.toggle('scene-active',e.isIntersecting&&!document.hidden);
   });schedule();
  },{rootMargin:'120px 0px'});
  [runway,portal,...scenes.map(t=>t.el)].forEach(el=>observer.observe(el));
  layoutObserver=new ResizeObserver(()=>{dirty=true;schedule()});
  [hero,about,...scenes.map(t=>t.el)].forEach(el=>layoutObserver.observe(el));
  addEventListener('scroll',()=>{pendingScroll+=scrollY-lastScrollY;lastScrollY=scrollY;schedule()},opts);
  let lastWidth=innerWidth;
  addEventListener('resize',()=>{
   if((lastWidth<768)!==(innerWidth<768)){mount();return}
   lastWidth=innerWidth;stopStreaks();dirty=true;schedule();
  },opts);
  addEventListener('orientationchange',()=>{dirty=true;schedule()},opts);
  document.addEventListener('visibilitychange',()=>{
   if(document.hidden)suspend();else resume();
  },opts);
  document.addEventListener('focusin',e=>{
   if(about.contains(e.target)){aboutTransition.style.opacity='0';aboutBackdrop.style.opacity='0';aboutRunway.classList.remove('about-portal-active')}
   const scene=scenes.find(t=>t.el.contains(e.target));
   scene?.items.forEach(el=>el.style.removeProperty('transform'));
  },opts);
  document.fonts?.ready.then(()=>{if(!abort.signal.aborted){dirty=true;schedule()}});
  // Images below the fold may alter the document after initial layout.
  document.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',()=>{dirty=true;schedule()},{once:true,signal:abort.signal})});
  measure();schedule();
  const showAbout=()=>scrollTo({top:aboutTop+aboutTravel-80,behavior:'instant'});
  if(location.hash==='#about')showAbout();
  addEventListener('hashchange',()=>{if(location.hash==='#about'){skipAbout=true;showAbout();schedule()}},{signal:abort.signal});
  document.querySelectorAll('a[href="#about"]').forEach(link=>link.addEventListener('click',e=>{
   e.preventDefault();skipAbout=true;history.pushState(null,'','#about');showAbout();schedule();
  },{signal:abort.signal}));
 }
 preference.addEventListener('change',mount);
 // Preserve sticky spacer geometry across history/BFCache; suspend effects only.
 addEventListener('pagehide',()=>{root.classList.remove('smooth-scroll');suspend()});
 addEventListener('pageshow',()=>resume());
 mount();
})();

