/* CredX public scroll narrative. Native scroll, no renderer or dependencies.
 * One event-driven rAF, cached layout, reversible timelines, bounded randomized cyber streaks.
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
 const aboutFrames=[...about.querySelectorAll('.about-gateway i')];
 const socials=[...about.querySelectorAll('.about-socials a')];
 let dispose=()=>{},suspend=()=>{},resume=()=>{},degraded=false;
 const weak=()=>navigator.connection?.saveData||
  (navigator.deviceMemory>0&&navigator.deviceMemory<=4)||
  (navigator.hardwareConcurrency>0&&navigator.hardwareConcurrency<=2);
 function mount(){
  dispose();
  const abort=new AbortController(),opts={passive:true,signal:abort.signal};
  let raf=0,dirty=true,paused=false,view=innerHeight,width=innerWidth,streakTimer=0,portalBusy=false;
  let heroTop=0,heroDistance=1,portalTop=0,portalDistance=1,aboutTop=0,aboutHeight=1;
  const streaks=new Map();
  let slowFrames=0,samples=0,observer;
  const simple=degraded||weak()||innerWidth<768;
  const animated=new Set([art,...frames,dash,aboutContent,...aboutFrames,...socials]);
  const active=new Set();
  function reset(){
   root.classList.remove('cinematic-ready','narrative-ready','motion-simple');
   hero.classList.remove('scene-active');
   runway.style.removeProperty('--hero-height');runway.style.removeProperty('--pin-top');
   portal.style.removeProperty('--interface-height');portal.style.removeProperty('--interface-pin');
   animated.forEach(el=>{el.style.removeProperty('transform');el.style.removeProperty('opacity');el.style.removeProperty('will-change');el.style.removeProperty('clip-path');el.style.removeProperty('pointer-events')});
   energy.style.removeProperty('opacity');hero.style.removeProperty('--journey-fill');hero.style.removeProperty('--hero-art-cap');
  }
  function stopStreaks(){clearTimeout(streakTimer);streakTimer=0;streaks.forEach((a,el)=>{a.cancel();el.remove()});streaks.clear();energy.replaceChildren()}
  suspend=()=>{paused=true;cancelAnimationFrame(raf);raf=0;stopStreaks();hero.classList.remove('scene-active')};
  dispose=()=>{suspend();abort.abort();observer?.disconnect();reset()};
  if(preference.matches)return;
  root.classList.add('cinematic-ready','narrative-ready');
  root.classList.toggle('motion-simple',!!simple);
  const scenes=tracks.map(t=>({...t,items:[...t.el.querySelectorAll(t.selector)],top:0,height:0}));
  scenes.forEach(t=>t.items.forEach(el=>animated.add(el)));
  function schedule(){if(!raf&&!document.hidden&&!paused)raf=requestAnimationFrame(draw)}
  function queueStreak(){
   if(streakTimer||paused||document.hidden||abort.signal.aborted)return;
   streakTimer=setTimeout(()=>{
    streakTimer=0;
    try{if(!portalBusy)spawnStreak();queueStreak()}
    catch{dispose();console.warn('CredX motion disabled; static content remains available.')}
   },random(simple?480:180,simple?1450:920));
  }
  function spawnStreak(){
   if(streaks.size>=(simple?2:3))return;
   const el=document.createElement('i');el.className='cyber-streak';
   const length=random(simple?45:70,simple?145:260);
   let angle=random(0,Math.PI*2),x=random(0,width),y=random(70,view);
   const orientation=Math.random();
   if(orientation<.25)angle=random(-.12,.12)+(Math.random()<.5?0:Math.PI);
   else if(orientation<.45)angle=random(1.4,1.74)+(Math.random()<.5?0:Math.PI);
   const edge=Math.random()<.55;
   if(edge){
    const side=Math.floor(random(0,4));
    if(side===0){x=-length;angle=random(-.7,.7)}
    if(side===1){x=width+length;angle=Math.PI+random(-.7,.7)}
    if(side===2){y=-length;angle=Math.PI/2+random(-.6,.6)}
    if(side===3){y=view+length;angle=-Math.PI/2+random(-.6,.6)}
   }
   const distance=edge&&Math.random()<.35?Math.max(width,view)+length*2:random(160,Math.max(width,view)*.9);
   const duration=Math.random()<.08?random(1200,1450):random(350,1150);
   const brightness=random(simple?.2:.22,simple?.46:.65),bend=Math.random()<.3?random(-32,32):0;
   el.style.width=`${length}px`;el.style.height=`${random(1.5,3).toFixed(2)}px`;
   const keyframes=[0,.14,.52,.82,1].map((t,i)=>{
    const curve=Math.sin(t*Math.PI)*bend;
    const px=x+Math.cos(angle)*distance*t-Math.sin(angle)*curve;
    const py=y+Math.sin(angle)*distance*t+Math.cos(angle)*curve;
    const tangent=angle+Math.atan(Math.cos(t*Math.PI)*Math.PI*bend/distance);
    return {transform:`translate3d(${px}px,${py}px,0) rotate(${tangent}rad)`,opacity:[0,brightness,brightness*.85,brightness*.35,0][i],offset:t};
   });
   energy.append(el);
   const run=el.animate(keyframes,{duration,easing:'linear'});
   streaks.set(el,run);
   run.onfinish=()=>{streaks.delete(el);el.remove()};
  }
  resume=()=>{if(abort.signal.aborted||preference.matches)return;paused=false;dirty=true;schedule();queueStreak()};
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
   aboutTop=about.getBoundingClientRect().top+scrollY;aboutHeight=about.offsetHeight;
   dirty=false;
  }
  function draw(){
   raf=0;const started=performance.now();
   try{
    if(dirty)measure();
    const y=scrollY;

    // Open before the reading position, hold for tall mobile copy, then exit.
    const entrance=ease((view*.99-(aboutTop-y))/(view*.7));
    portalBusy=entrance>.03&&entrance<.98;
    const bottom=aboutTop+aboutHeight-y;
    const exit=ease((view*.32-bottom)/(view*.38));
    aboutContent.style.clipPath=`ellipse(${entrance*120}% ${entrance*150}% at 50% 160px)`;
    aboutContent.style.transform=`perspective(1400px) translate3d(0,${(1-entrance)*36}px,0) scale(${.94+.06*entrance})`;
    aboutContent.style.opacity=String(1-exit);
    aboutFrames.forEach((el,i)=>{
     el.style.transform=`scale(${.28+entrance*1.15+i*.06})`;
     el.style.opacity=String(clamp(entrance*7)*(1-ease((entrance-.66)/.3))*(1-exit)*(.98-i*.2));
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
     const p=clamp((y-heroTop-12)/Math.max(1,heroDistance-12)),e=ease(p);
     art.style.transform=`translate3d(0,${-e*(simple?10:28)}px,0) scale(${1-(width<768?.32:.48)*e})`;
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
  addEventListener('scroll',schedule,opts);
  let lastWidth=innerWidth;
  addEventListener('resize',()=>{
   if((lastWidth<768)!==(innerWidth<768)){mount();return}
   lastWidth=innerWidth;dirty=true;schedule();
  },opts);
  addEventListener('orientationchange',()=>{dirty=true;schedule()},opts);
  document.addEventListener('visibilitychange',()=>{
   if(document.hidden)suspend();else resume();
  },opts);
  document.addEventListener('focusin',e=>{
   const scene=scenes.find(t=>t.el.contains(e.target));
   scene?.items.forEach(el=>el.style.removeProperty('transform'));
  },opts);
  document.fonts?.ready.then(()=>{if(!abort.signal.aborted){dirty=true;schedule()}});
  // Images below the fold may alter the document after initial layout.
  document.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',()=>{dirty=true;schedule()},{once:true,signal:abort.signal})});
  measure();schedule();queueStreak();
 }
 preference.addEventListener('change',mount);
 // Preserve sticky spacer geometry across history/BFCache; suspend effects only.
 addEventListener('pagehide',()=>suspend());
 addEventListener('pageshow',()=>resume());
 mount();
})();
