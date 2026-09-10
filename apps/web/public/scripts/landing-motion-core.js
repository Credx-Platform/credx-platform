/* Shared native-scroll scheduler. One read phase, one write phase, no scroll lock. */
(() => {
 'use strict';
 const factories=[],scenes=[];
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 const mobile=matchMedia('(max-width: 767px)');
 const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
 const ease=n=>n*n*(3-2*n);
 const range=(n,a,b)=>ease(clamp((n-a)/(b-a)));
 // Layout coordinates, independent of all rendered transforms (also on reverse).
 const top=el=>{let y=0;for(let n=el;n;n=n.offsetParent)y+=n.offsetTop;return y};
 let abort,observer,raf=0,dirty=true,started=false,last=0;
 const request=()=>{if(!raf&&!document.hidden)raf=requestAnimationFrame(draw)};
 function draw(now){
  raf=0;
  const frame={now,dt:Math.min(50,now-last||16),y:scrollY,w:innerWidth,h:innerHeight,mobile:mobile.matches};last=now;
  try {
  if(dirty){scenes.forEach(s=>s.measure?.(frame));dirty=false;}
  let running=false;scenes.forEach(s=>{running=Boolean(s.render?.(frame))||running});
  if(running)request();
  }catch(error){stop();console.error('CredX motion fell back to static content',error);}
 }
 function stop(){
  abort?.abort();observer?.disconnect();cancelAnimationFrame(raf);raf=0;
  scenes.splice(0).forEach(s=>s.destroy?.());
  document.documentElement.classList.remove('cinematic-ready');
 }
 function mount(){
  stop();if(preference.matches)return;
  abort=new AbortController();
  const on=(target,event,fn,options={})=>target.addEventListener(event,fn,{passive:true,...options,signal:abort.signal});
  document.documentElement.classList.add('cinematic-ready');
  const api={clamp,ease,range,top,on,request};
  try{factories.forEach(factory=>scenes.push(factory(api)))}catch(error){stop();console.error('CredX motion fell back to static content',error);return;}
  const invalidate=()=>{dirty=true;request()};
  on(window,'scroll',request);on(window,'resize',invalidate);on(document,'focusin',request);on(document,'focusout',request);
  on(document,'visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;scenes.forEach(s=>s.pause?.())}else{last=0;invalidate()}});
  observer=new ResizeObserver(invalidate);observer.observe(document.body);
  document.fonts?.ready.then(()=>{if(!abort?.signal.aborted)invalidate()});
  dirty=true;request();
 }
 window.CredXMotion={register:factory=>factories.push(factory)};
 function start(){if(started)return;started=true;mount();}
 document.addEventListener('DOMContentLoaded',start,{once:true});
 if(document.readyState==='complete')start();
 preference.addEventListener('change',()=>{if(started)mount()});
 mobile.addEventListener('change',()=>{if(started)mount()});
 addEventListener('pagehide',stop);addEventListener('pageshow',e=>{if(e.persisted)mount()});
})();
