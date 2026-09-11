/* CredX public scroll narrative. Native scroll, no renderer or dependencies.
 * One event-driven rAF, cached layout, reversible timelines, finite rail passes.
 * Content remains visible before JS, in reduced motion and on failure.
 */
(() => {
 'use strict';
 const root=document.documentElement;
 // CSS keeps scroll-behavior instant so the browser restores a mid-page refresh
 // without animating the whole document. Hand smooth scrolling back for anchor
 // jumps once the restored position has settled, or as soon as the user acts.
 const enableSmooth=()=>root.classList.add('smooth-scroll');
 addEventListener('load',()=>setTimeout(enableSmooth,250),{once:true});
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
 const objects=[...hero.querySelectorAll('.scene-object')];
 const frames=[...portal.querySelectorAll('.portal-frames i')];
 const dash=portal.querySelector('.dash-ui');
 const cue=hero.querySelector('.journey-state');
 const tracks=[
  {id:'modules',selector:'.md-card',kind:'fan'},
  {id:'breakdown',selector:'.bd-cat',kind:'stack'},
  {id:'action-plan',selector:'.pl-item',kind:'stack'},
  {id:'progress',selector:'.pg-card',kind:'fan'},
  {id:'funding',selector:'.fr-item',kind:'stack'},
  {id:'chat',selector:'.chat-window',kind:'focus'}
 ].map(t=>({...t,el:document.getElementById(t.id)}));
 // Site-wide now: the pattern layer lives on <body>, not inside the hero.
 const energy=document.querySelector('.data-trails');
 // Scroll launches a complete passage. Compositor animations finish even when
 // input stops, without keeping a JavaScript animation loop alive.
 energy.innerHTML='<span class="energy-rail"><i></i></span><span class="energy-rail"><i></i></span>';
 const rails=[...energy.querySelectorAll('i')];
 const about=document.getElementById('about'),aboutContent=about.querySelector('.about-inner');
 const aboutFrames=[...about.querySelectorAll('.about-gateway i')];
 const socials=[...about.querySelectorAll('.about-socials a')];
 let dispose=()=>{},degraded=false;
 const weak=()=>navigator.connection?.saveData||
  (navigator.deviceMemory>0&&navigator.deviceMemory<=4)||
  (navigator.hardwareConcurrency>0&&navigator.hardwareConcurrency<=2);
 function mount(){
  dispose();
  const abort=new AbortController(),opts={passive:true,signal:abort.signal};
  let raf=0,dirty=true,lastScroll=scrollY,lastInput=-Infinity,view=innerHeight,width=innerWidth;
  let heroTop=0,heroDistance=1,portalTop=0,portalDistance=1,aboutTop=0,aboutHeight=1;
  const railRuns=new Map();
  let slowFrames=0,samples=0,observer;
  const simple=degraded||weak()||innerWidth<768;
  const animated=new Set([...objects,...frames,dash,...rails,aboutContent,...aboutFrames,...socials]);
  const active=new Set();
  function reset(){
   root.classList.remove('cinematic-ready','narrative-ready','motion-simple');
   hero.classList.remove('scene-active');
   runway.style.removeProperty('--hero-height');runway.style.removeProperty('--pin-top');
   portal.style.removeProperty('--interface-height');portal.style.removeProperty('--interface-pin');
   animated.forEach(el=>{el.style.removeProperty('transform');el.style.removeProperty('opacity');el.style.removeProperty('will-change');el.style.removeProperty('clip-path');el.style.removeProperty('pointer-events')});
   energy.style.removeProperty('opacity');hero.style.removeProperty('--journey-fill');
  }
  dispose=()=>{abort.abort();cancelAnimationFrame(raf);observer?.disconnect();railRuns.forEach(a=>a.cancel());railRuns.clear();reset()};
  if(preference.matches)return;
  root.classList.add('cinematic-ready','narrative-ready');
  root.classList.toggle('motion-simple',!!simple);
  const scenes=tracks.map(t=>({...t,items:[...t.el.querySelectorAll(t.selector)],top:0,height:0}));
  scenes.forEach(t=>t.items.forEach(el=>animated.add(el)));
  function schedule(){if(!raf&&!document.hidden)raf=requestAnimationFrame(draw)}
  function launchRail(el,i){
   if(railRuns.has(el)||document.hidden||abort.signal.aborted)return;
   const start=-620,end=width*1.1+40;
   const run=el.animate([
    {transform:`translate3d(${start}px,0,0)`,opacity:0,offset:0},
    {transform:`translate3d(${start+(end-start)*.12}px,0,0)`,opacity:1,offset:.12},
    {transform:`translate3d(${start+(end-start)*.88}px,0,0)`,opacity:1,offset:.88},
    {transform:`translate3d(${end}px,0,0)`,opacity:0,offset:1}
   ],{duration:1200+i*180,easing:'linear'});
   railRuns.set(el,run);
   run.onfinish=()=>{railRuns.delete(el);if(performance.now()-lastInput<160)launchRail(el,i)};
  }
  function measure(){
   width=innerWidth;view=innerHeight;
   // Read first, write spacer variables, then cache positions in one layout pass.
   const h=hero.offsetHeight,dh=portal.querySelector('section').offsetHeight;
   runway.style.setProperty('--hero-height',`${h}px`);
   runway.style.setProperty('--pin-top',`${Math.min(0,view-h)}px`);
   portal.style.setProperty('--interface-height',`${dh}px`);
   portal.style.setProperty('--interface-pin',`${Math.min(70,view-dh)}px`);
   heroTop=runway.getBoundingClientRect().top+scrollY;
   heroDistance=Math.max(1,runway.offsetHeight-h);
   portalTop=portal.getBoundingClientRect().top+scrollY;
   portalDistance=Math.max(1,portal.offsetHeight-dh);
   scenes.forEach(t=>{t.top=t.el.getBoundingClientRect().top+scrollY;t.height=t.el.offsetHeight});
   aboutTop=about.getBoundingClientRect().top+scrollY;aboutHeight=about.offsetHeight;
   dirty=false;
  }
  function draw(){
   raf=0;const started=performance.now();
   try{
    if(dirty)measure();
    const y=scrollY;
    if(y!==lastScroll){lastInput=performance.now();rails.forEach(launchRail)}
    lastScroll=y;
    // Open before the reading position, hold for tall mobile copy, then exit.
    const entrance=ease((view*.96-(aboutTop-y))/(view*.6));
    const bottom=aboutTop+aboutHeight-y;
    const exit=ease((view*.32-bottom)/(view*.38));
    aboutContent.style.clipPath=`ellipse(${entrance*100}% ${entrance*100}% at 50% 50%)`;
    aboutContent.style.transform=`perspective(1400px) translate3d(0,${(1-entrance)*36}px,0) scale(${.94+.06*entrance})`;
    aboutContent.style.opacity=String(1-exit);
    aboutFrames.forEach((el,i)=>{
     el.style.transform=`scale(${.12+entrance*1.3+i*.08}) rotate(${(1-entrance)*(i%2?8:-8)}deg)`;
     el.style.opacity=String(Math.sin(entrance*Math.PI)*(1-exit)*(.9-i*.18));
    });
    socials.forEach((el,i)=>{
     const pop=ease((view*.99-bottom-i*14)/(view*.2));
     const fade=1-ease((view*.28-bottom)/(view*.28));
     el.style.opacity=String(pop*fade);
     // Keep links in keyboard order even while their visual reveal is offscreen.
     el.style.pointerEvents=pop*fade<.01?'none':'auto';
     el.style.transform=`translate3d(0,${(1-pop)*32}px,0) scale(${.65+.35*pop})`;
    });
    if(active.has(runway)){
     const p=clamp((y-heroTop)/heroDistance),e=ease(p),amplitude=simple?.45:1;
     objects.forEach((el,i)=>{
      const side=[1,1,-1,-1,-1][i],depth=[-150,-70,-220,-110,-170][i];
      el.style.transform=`translate3d(${side*e*18*amplitude}px,${e*(i===4?90:-12)*amplitude}px,${(depth+(180+i*10)*e)*amplitude}px) rotateY(${side*(1-e)*5*amplitude}deg) scale(${.84+.12*e})`;
     });
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
      const x=t.kind==='fan'?side*rest*(simple?5:22):0;
      const z=t.kind==='focus'?rest*-45:rest*-18;
      el.style.transform=`perspective(1200px) translate3d(${x}px,${rest*(simple?8:20)}px,${simple?0:z}px) rotateY(${simple?0:side*rest*(t.kind==='fan'?4:1)}deg)`;
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
  addEventListener('scroll',schedule,opts);
  let lastWidth=innerWidth;
  addEventListener('resize',()=>{
   if((lastWidth<768)!==(innerWidth<768)){mount();return}
   lastWidth=innerWidth;dirty=true;schedule();
  },opts);
  addEventListener('orientationchange',()=>{dirty=true;schedule()},opts);
  document.addEventListener('visibilitychange',()=>{
   if(document.hidden){cancelAnimationFrame(raf);raf=0;railRuns.forEach(a=>a.cancel());railRuns.clear();hero.classList.remove('scene-active')}
   else {dirty=true;schedule()}
  },opts);
  document.addEventListener('focusin',e=>{
   const scene=scenes.find(t=>t.el.contains(e.target));
   scene?.items.forEach(el=>el.style.removeProperty('transform'));
  },opts);
  document.fonts?.ready.then(()=>{if(!abort.signal.aborted){dirty=true;schedule()}});
  // Images below the fold may alter the document after initial layout.
  document.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',()=>{dirty=true;schedule()},{once:true,signal:abort.signal})});
  measure();schedule();
 }
 preference.addEventListener('change',mount);
 addEventListener('pagehide',()=>dispose());
 addEventListener('pageshow',e=>{if(e.persisted)mount()});
 mount();
})();
