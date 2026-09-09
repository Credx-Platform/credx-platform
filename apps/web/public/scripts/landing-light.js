/* Short scroll-only accents. Never place reflection overlays over readable content. */
(() => {
 'use strict';
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 const sheet=document.createElement('div');
 sheet.className='scroll-light';sheet.setAttribute('aria-hidden','true');
 sheet.innerHTML='<div class="scroll-light-beam"></div>';document.body.append(sheet);
 const beam=sheet.firstElementChild;
 let dispose=()=>{};
 function mount(){
  dispose();if(preference.matches)return;
  const abort=new AbortController();
  const packets=[...document.querySelectorAll('.data-trail i')];
  let raf=0,lastY=scrollY,position=innerHeight*.72,lastMove=-Infinity;
  function clear(){
   cancelAnimationFrame(raf);raf=0;sheet.style.opacity='0';
   packets.forEach(el=>el.style.opacity='0');
  }
  function draw(now){
   raf=0;
   const fade=Math.max(0,1-(now-lastMove)/160);
   sheet.style.opacity=String(fade*.32);
   beam.style.transform=`translate3d(0,${position}px,0) rotate(-18deg)`;
   packets.forEach((el,i)=>{
    const phase=((lastY*.8+i*137)%(innerWidth+200))/(innerWidth+200);
    el.style.transform=`translate3d(${(phase-.5)*innerWidth}px,0,0)`;
    el.style.opacity=String(fade*.45*Math.sin(phase*Math.PI));
   });
   if(fade>0)raf=requestAnimationFrame(draw);
  }
  function onScroll(){
   const delta=scrollY-lastY;lastY=scrollY;if(!delta)return;
   position-=delta*.85;
   const span=innerHeight+220;
   position=((position+110)%span+span)%span-110;
   lastMove=performance.now();if(!raf)raf=requestAnimationFrame(draw);
  }
  addEventListener('scroll',onScroll,{passive:true,signal:abort.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear()}, {signal:abort.signal});
  dispose=()=>{abort.abort();clear()};
 }
 preference.addEventListener('change',mount);
 addEventListener('pagehide',()=>dispose());addEventListener('pageshow',e=>{if(e.persisted)mount()});mount();
})();
