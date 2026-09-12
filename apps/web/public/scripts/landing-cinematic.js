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
 const cue=hero.querySelector('.journey-state');
 const tracks=[
  {id:'how',selector:'.step',kind:'rise'},
  {id:'testimonials',selector:'.test-grid',kind:'slide'},
  {id:'masterclass-curriculum',selector:'.cur-grid',kind:'scale'},
  {id:'faq',selector:'.faq-list',kind:'rise'},
  {id:'modules',selector:'.md-card',kind:'fan'},
  {id:'breakdown',selector:'.bd-cat',kind:'stack'},
  {id:'action-plan',selector:'.pl-item',kind:'stack'},
  {id:'progress',selector:'.pg-card',kind:'fan'},
  {id:'funding',selector:'.fr-item',kind:'stack'},
  {id:'chat',selector:'.chat-window',kind:'focus'}
 ].map(t=>({...t,el:document.getElementById(t.id)}));
 // Site-wide now: the pattern layer lives on <body>, not inside the hero.
 const energy=document.querySelector('.data-trails');
 // Streaks are generated per spawn, never replayed from a fixed path bank.
 energy.replaceChildren();
 const random=(a,b)=>a+Math.random()*(b-a);
 const about=document.getElementById('about'),aboutContent=about.querySelector('.about-inner');
 const aboutTransition=document.querySelector('.about-transition'),aboutVeil=aboutTransition.querySelector('.about-veil');
 const aboutFrames=[...aboutTransition.querySelectorAll('.about-gateway i')];
 const aboutRunway=document.getElementById('aboutRunway'),aboutLogo=aboutTransition.querySelector('.portal-logo');
 const socials=[...about.querySelectorAll('.about-socials a')];
 let dispose=()=>{},suspend=()=>{},resume=()=>{},degraded=false;
 const weak=()=>navigator.connection?.saveData||
  (navigator.deviceMemory>0&&navigator.deviceMemory<=4)||
  (navigator.hardwareConcurrency>0&&navigator.hardwareConcurrency<=2);
 function mount(){
  dispose();
  const abort=new AbortController(),opts={passive:true,signal:abort.signal};
  let skipAbout=location.hash==='#about';
  let raf=0,dirty=true,paused=false,view=innerHeight,width=innerWidth,portalBusy=false;
  let heroTop=0,heroDistance=1,portalTop=0,portalDistance=1,aboutTop=0,aboutHeight=1,aboutTravel=1;
  const streaks=new Map();
  let lastScrollY=scrollY,pendingScroll=0,streakTravel=0,nextStreak=80;
  let slowFrames=0,samples=0,observer;
  const simple=degraded||weak()||innerWidth<768;
  const animated=new Set([art,...frames,dash,aboutContent,aboutLogo,aboutTransition,...aboutFrames,...socials]);
  const active=new Set();
  function reset(){
   root.classList.remove('cinematic-ready','narrative-ready','motion-simple');
   hero.classList.remove('scene-active');
   runway.style.removeProperty('--hero-height');runway.style.removeProperty('--pin-top');
   portal.style.removeProperty('--interface-height');portal.style.removeProperty('--interface-pin');
   animated.forEach(el=>{el.style.removeProperty('transform');el.style.removeProperty('opacity');el.style.removeProperty('will-change');el.style.removeProperty('clip-path');el.style.removeProperty('pointer-events')});
   aboutVeil.style.removeProperty('--iris-radius');
   aboutRunway.style.removeProperty('--about-height');aboutRunway.style.removeProperty('--about-travel');
   energy.style.removeProperty('opacity');hero.style.removeProperty('--journey-fill');hero.style.removeProperty('--hero-art-cap');
  }
  function stopStreaks(){streaks.forEach(({run},el)=>{run.cancel();el.remove()});streaks.clear();energy.replaceChildren();pendingScroll=0;streakTravel=0;nextStreak=80;}
  suspend=()=>{paused=true;cancelAnimationFrame(raf);raf=0;stopStreaks();hero.classList.remove('scene-active')};
  dispose=()=>{suspend();abort.abort();observer?.disconnect();reset()};
  if(preference.matches)return;
  root.classList.add('cinematic-ready','narrative-ready');
  root.classList.toggle('motion-simple',!!simple);
  const scenes=tracks.map(t=>({...t,items:[...t.el.querySelectorAll(t.selector)],top:0,height:0}));
  scenes.forEach(t=>t.items.forEach(el=>animated.add(el)));
  function schedule(){if(!raf&&!document.hidden&&!paused)raf=requestAnimationFrame(draw)}
  // Paused animation timelines are scrubbed ONLY by native scroll distance.
  // There is no timer, playback tail, or ambient motion while the page rests.
  function advanceStreaks(delta){
   if(!delta)return;
   streaks.forEach((state,el)=>{
    state.time+=delta/state.lifetime*1000;
    if(state.time<=0||state.time>=1000){state.run.cancel();el.remove();streaks.delete(el)}
    else {
     state.run.currentTime=state.time;state.travel+=Math.abs(delta);
     el.style.opacity=String(state.brightness*ease(state.travel/100)*ease(Math.min(state.time,1000-state.time)/180));
    }
   });
   streakTravel+=Math.abs(delta);
   if(streakTravel>=nextStreak){
    spawnStreak(delta);streakTravel=0;
    nextStreak=random(simple?280:340,simple?480:580);
   }
  }
  function spawnStreak(delta){
   if(streaks.size>=(simple?2:3))return;
   const el=document.createElement('i');el.className='cyber-streak';
   // Three times the previous length, retaining the fine core and muted halo.
   // Alternate angled lanes, with gentle bends, avoid a vertical rain pattern.
   const length=random(simple?540:840,simple?1440:2340);
   const lanes=[-.85,-.32,.35,.82,Math.PI-.85,Math.PI-.32,Math.PI+.35,Math.PI+.82];
   const angle=lanes[Math.floor(random(0,lanes.length))]+random(-.09,.09);
   const distance=Math.max(width,view)+length;
   const time=delta>0?350:650;
   const x=random(width*.12,width*.88)-Math.cos(angle)*(distance*time/1000+length*.5);
   const y=random(view*.18,view*.85)-Math.sin(angle)*(distance*time/1000+length*.5);
   const brightness=random(.22,.46),bend=random(-1,1)*(portalBusy?130:70);
   el.style.width=`${length}px`;el.style.height=`${random(1.4,3.6).toFixed(2)}px`;
   const keyframes=[0,.14,.52,.82,1].map(t=>{
    const curve=Math.sin(t*Math.PI)*bend;
    const px=x+Math.cos(angle)*distance*t-Math.sin(angle)*curve;
    const py=y+Math.sin(angle)*distance*t+Math.cos(angle)*curve;
    const tangent=angle+Math.atan(Math.cos(t*Math.PI)*Math.PI*bend/distance);
    return {transform:`translate3d(${px}px,${py}px,0) rotate(${tangent}rad)`,offset:t};
   });
   energy.append(el);
   const run=el.animate(keyframes,{duration:1000,easing:'linear',fill:'both'});
   run.pause();run.currentTime=time;
   streaks.set(el,{run,time,brightness,travel:0,lifetime:random(view*1.4,view*2)});
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
   scenes.forEach(t=>{t.top=t.el.getBoundingClientRect().top+scrollY;t.height=t.el.offsetHeight});
   aboutHeight=about.offsetHeight;aboutTravel=view*.9;
   aboutRunway.style.setProperty('--about-height',`${aboutHeight}px`);
   aboutRunway.style.setProperty('--about-travel',`${aboutTravel}px`);
   aboutTop=aboutRunway.getBoundingClientRect().top+scrollY;
   dirty=false;
  }
  function draw(){
   raf=0;const started=performance.now();
   try{
    if(dirty)measure();
    const y=scrollY;

    // The iris crosses every viewport corner BEFORE About starts to appear.
    const progress=skipAbout?1:clamp((y-aboutTop+81)/aboutTravel);
    const entrance=ease(progress/.78),reveal=ease((progress-.8)/.2);
    portalBusy=progress>0&&progress<1;
    const scrollDelta=pendingScroll;pendingScroll=0;advanceStreaks(scrollDelta);
    const bottom=aboutTop+aboutTravel+aboutHeight-y;
    const exit=ease((view*.32-bottom)/(view*.38));
    aboutContent.style.clipPath='none';
    aboutContent.style.transform=`translate3d(0,${(1-reveal)*(width<768?88:120)}px,0)`;
    aboutContent.style.opacity=String(reveal*(1-exit));
    const diameter=Math.min(width*.72,440);
    const fullScale=Math.hypot(width,view)*1.3/(diameter*.82);
    const ringScale=.62+entrance*(fullScale-.62);
    aboutVeil.style.setProperty('--iris-radius',`${diameter*.41*ringScale}px`);
    aboutTransition.style.opacity=String(about.matches(':focus-within')?0:ease(progress/.1)*(1-reveal));
    aboutFrames.forEach((el,i)=>{
     el.style.transform=`scale(${.62+entrance*(fullScale-.62)+i*.1}) rotate(${entrance*(i%2?16:-12)}deg)`;
     el.style.opacity=String((1-reveal)*(.92-i*.22));
    });
    aboutLogo.style.transform=`scale(${.85+entrance*.18})`;
    aboutLogo.style.opacity=String(1-ease((progress-.42)/.32));
    socials.forEach((el,i)=>{
     const pop=ease((view*.99-bottom-i*14)/(view*.2));
     const fade=1-ease((view*.28-bottom)/(view*.28));
     el.style.opacity=String(pop*fade);
     // Keep links in keyboard order even while their visual reveal is offscreen.
     el.style.pointerEvents=pop*fade<.01?'none':'auto';
     el.style.transform=`translate3d(0,${(1-pop)*32}px,0) scale(${.65+.35*pop})`;
    });
    if(active.has(runway)){
     const p=clamp((y-heroTop-12)/Math.max(1,heroDistance-12)),e=ease(p);
     art.style.transform=`translate3d(0,${-e*(simple?5:14)}px,0) scale(${1-(width<768?.16:.24)*(1-e)})`;
     hero.style.setProperty('--journey-fill',String(.05+.95*p));
     const label=p<.5?'01 / YOUR PERSPECTIVE':'02 / INSIDE CREDX';
     if(cue.textContent!==label)cue.textContent=label;
    }
    if(active.has(portal)){
     const p=clamp((y-portalTop+view*.38)/(portalDistance+view*.38));
     const e=ease(p);
     dash.style.transform=`perspective(1400px) translate3d(0,${(1-e)*(simple?12:40)}px,0) rotateX(${(1-e)*(simple?0:9)}deg) scale(${(simple?.97:.88)+(simple?.03:.12)*e})`;
     frames.forEach((el,i)=>{
      const q=ease((p-i*.07)/.78);
      el.style.transform=`translate3d(0,0,0) scale(${.78+q*(simple?.6:2.35)+i*.09}) rotateY(${(1-q)*(simple?0:-7)}deg)`;
      el.style.opacity=String((1-ease((p-.48)/.45))*(.5-i*.1));
     });
    }
    scenes.forEach(t=>{
     if(!active.has(t.el))return;
     // Only decorative/interface panels move. Headings, controls and CTA text
     // never wait for a reveal. Each panel lands before the reading position.
     const p=clamp((view*.94-(t.top-y))/Math.min(view*.52,420));
     t.items.forEach((el,i)=>{
      const e=ease((p-i*.018)/.84),rest=1-e,side=i%2?1:-1;
      const x=t.kind==='fan'?side*rest*(simple?5:22):t.kind==='slide'?rest*(simple?8:28):0;
      const z=t.kind==='focus'?rest*-45:rest*-18;
      el.style.transform=`perspective(1200px) translate3d(${x}px,${rest*(simple?8:20)}px,${simple?0:z}px) rotateY(${simple?0:side*rest*(t.kind==='fan'?2:0)}deg) scale(${t.kind==='scale'?1-rest*.06:1})`;
      el.style.opacity=String(.7+.3*e);
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
   if(about.contains(e.target))aboutTransition.style.opacity='0';
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
