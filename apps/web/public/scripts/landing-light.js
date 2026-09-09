/* Short scroll-only accents. Never place reflection overlays over readable content. */
(() => {
 'use strict';
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 const sheet=document.createElement('div');
 sheet.className='scroll-light';sheet.setAttribute('aria-hidden','true');
 // Three stars on their own lanes and offsets so they never read as one bar.
 const starSpecs=[[10,88,0,'#fff'],[46,64,-260,'rgba(255,255,255,.85)'],[22,52,-520,'rgba(255,255,255,.7)']];
 sheet.innerHTML=starSpecs.map(([x,len,off,color])=>
  `<div class="scroll-light-beam" data-offset="${off}" style="--x:${x}px;--len:${len}px;--star:${color}"></div>`).join('');
 document.body.append(sheet);
 const stars=[...sheet.children];
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
  // Stars exist only while the wheel is turning: they travel at exactly scroll
  // speed and are gone ~90ms after it stops, so nothing rests over the copy.
  const span=()=>innerHeight+220;
  function draw(now){
   raf=0;
   const fade=Math.max(0,1-(now-lastMove)/90);
   sheet.style.opacity=String(fade*.5);
   const s=span();
   stars.forEach(el=>{
    const off=Number(el.dataset.offset)||0;
    const y=((position+off+110)%s+s)%s-110;
    el.style.transform=`translate3d(0,${y}px,0) rotate(-18deg)`;
   });
   packets.forEach((el,i)=>{
    const phase=((lastY*.8+i*137)%(innerWidth+200))/(innerWidth+200);
    el.style.transform=`translate3d(${(phase-.5)*innerWidth}px,0,0)`;
    el.style.opacity=String(fade*.3*Math.sin(phase*Math.PI));
   });
   if(fade>0)raf=requestAnimationFrame(draw);
  }
  function onScroll(){
   const delta=scrollY-lastY;lastY=scrollY;if(!delta)return;
   // 1:1 with the wheel: the stars move exactly as far as the page does.
   position-=delta;
   const s=span();
   position=((position+110)%s+s)%s-110;
   lastMove=performance.now();if(!raf)raf=requestAnimationFrame(draw);
  }
  addEventListener('scroll',onScroll,{passive:true,signal:abort.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear()}, {signal:abort.signal});
  dispose=()=>{abort.abort();clear()};
 }
 preference.addEventListener('change',mount);
 addEventListener('pagehide',()=>dispose());addEventListener('pageshow',e=>{if(e.persisted)mount()});mount();
})();
