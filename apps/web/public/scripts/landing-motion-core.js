/* Native scrolling, one shared scheduler, cached layout and graceful degradation. */
(() => {
 'use strict';
 const factories=[],scenes=[];
 const root=document.documentElement;
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 const mobile=matchMedia('(max-width: 767px)');
 const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
 // Smoothstep gives every scroll gesture the same bounded, non-spring cadence.
 const ease=n=>n*n*(3-2*n);
 const range=(n,a,b)=>ease(clamp((n-a)/(b-a)));
 const top=el=>{let y=0;for(let n=el;n;n=n.offsetParent)y+=n.offsetTop;return y};
 const constrained=()=>Boolean(navigator.connection?.saveData||navigator.deviceMemory<=4||navigator.hardwareConcurrency<=4);
 let abort,observer,raf=0,dirty=true,started=false,last=0,previousY=NaN;
 let simple=false,continuous=false,slowFrames=0;
 const request=()=>{if(!raf&&!document.hidden)raf=requestAnimationFrame(draw)};
 function draw(now){
  raf=0;
  // Count only consecutive animated frames, not time spent idle between scrolls.
  slowFrames=continuous&&now-last>42?slowFrames+1:0;
  if(slowFrames>=8&&!simple){simple=true;dirty=true;root.dataset.motionProfile='light';}
  const frame={now,dt:Math.min(50,now-last||16),y:scrollY,w:innerWidth,h:innerHeight,mobile:mobile.matches,simple,changed:dirty||scrollY!==previousY};
  last=now;previousY=frame.y;
  try {
   if(dirty){scenes.forEach(s=>s.measure?.(frame));dirty=false;}
   continuous=false;scenes.forEach(s=>{continuous=Boolean(s.render?.(frame))||continuous});
   if(continuous)request();
  }catch(error){stop();console.error('CredX motion fell back to static content',error);}
 }
 function stop(){
  abort?.abort();observer?.disconnect();cancelAnimationFrame(raf);raf=0;
  root.classList.remove('cinematic-ready');root.dataset.motionProfile='static';
  // A single module's cleanup must not prevent other content being restored.
  scenes.splice(0).forEach(s=>{try{s.destroy?.()}catch(error){console.warn('CredX motion cleanup',error)}});
  continuous=false;slowFrames=0;last=0;previousY=NaN;
 }
 function mount(){
  stop();if(preference.matches)return;
  simple=constrained();root.dataset.motionProfile=simple?'light':'full';
  abort=new AbortController();
  const on=(target,event,fn,options={})=>target.addEventListener(event,fn,{passive:true,...options,signal:abort.signal});
  const invalidate=()=>{dirty=true;request()};
  root.classList.add('cinematic-ready');
  const api={clamp,ease,range,top,on,request};
  try{factories.forEach(factory=>scenes.push(factory(api)))}catch(error){stop();console.error('CredX motion fell back to static content',error);return;}
  on(window,'scroll',request);on(window,'resize',invalidate);on(document,'focusin',invalidate);on(document,'focusout',invalidate);
  on(document,'visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;continuous=false;scenes.forEach(s=>s.pause?.())}else{last=0;invalidate()}});
  observer=new ResizeObserver(invalidate);observer.observe(document.body);
  const signal=abort.signal;
  document.fonts?.ready.then(()=>{if(!signal.aborted)invalidate()});
  dirty=true;request();
 }
 window.CredXMotion={register:factory=>factories.push(factory)};
 function start(){if(started)return;started=true;mount();}
 document.addEventListener('DOMContentLoaded',start,{once:true});
 if(document.readyState==='complete')start();
 preference.addEventListener('change',()=>{if(started)mount()});
 mobile.addEventListener('change',()=>{if(started)mount()});
 // Keep the layout intact while the browser snapshots history/BFCache. A full
 // teardown here can collapse the hero spacer before scroll restoration is saved.
 addEventListener('pagehide',()=>{
  abort?.abort();observer?.disconnect();cancelAnimationFrame(raf);raf=0;continuous=false;
  scenes.forEach(s=>s.pause?.());
 });
 addEventListener('pageshow',e=>{if(e.persisted)mount()});
})();
