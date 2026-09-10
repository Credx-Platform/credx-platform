/* Short scroll-only accents. Never place reflection overlays over readable content. */
(() => {
 'use strict';
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 const sheet=document.createElement('div');
 sheet.className='scroll-light';sheet.setAttribute('aria-hidden','true');
 // A field of thin white streaks on a steep diagonal, after the look on
 // 8bit.ai: lengths, brightness and lanes all vary, a few bright ones carry a
 // glow, the rest stay faint. Seeded so the layout is identical every load.
 const seeded=(s=>()=>(s=(s*1103515245+12345)&0x7fffffff)/0x7fffffff)(20260910);
 const wide=innerWidth>=768;
 const count=wide?26:12;
 const specs=[...Array(count)].map((_,i)=>{
  const r=seeded(),r2=seeded(),r3=seeded();
  return {
   x:+(2+((i*37+r*23)%96)).toFixed(2),
   len:Math.round(60+r2*(wide?360:190)),
   a:+(.14+r3*.7).toFixed(2),
   rot:+(196+r*10).toFixed(1),
   w:r3>.86?2:1,
   offset:Math.round(-r2*1400)
  };
 });
 sheet.innerHTML=specs.map(s=>
  `<div class="scroll-streak" data-bright="${s.a>.6?1:0}" data-offset="${s.offset}" data-rot="${s.rot}" style="--x:${s.x}vw;--len:${s.len}px;--a:${s.a};--rot:${s.rot}deg;--w:${s.w}px"></div>`).join('');
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
  // Streaks exist only while the wheel is turning: they travel at exactly scroll
  // speed and are gone ~90ms after it stops, so nothing rests over the copy.
  // The span clears the longest streak so none of them pop as they wrap.
  const span=()=>innerHeight+620;
  function draw(now){
   raf=0;
   const fade=Math.max(0,1-(now-lastMove)/90);
   sheet.style.opacity=String(fade*.62);
   const s=span();
   // Written as literal degrees, not var(--rot): an inline transform should be
   // readable on its own, and DOMMatrix cannot parse a custom property.
   stars.forEach(el=>{
    const off=Number(el.dataset.offset)||0;
    const y=((position+off+500)%s+s)%s-500;
    el.style.transform=`translate3d(0,${y}px,0) rotate(${el.dataset.rot}deg)`;
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
   // 1:1 with the wheel: the streaks move exactly as far as the page does.
   position-=delta;
   const s=span();
   position=((position+500)%s+s)%s-500;
   lastMove=performance.now();if(!raf)raf=requestAnimationFrame(draw);
  }
  addEventListener('scroll',onScroll,{passive:true,signal:abort.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear()}, {signal:abort.signal});
  dispose=()=>{abort.abort();clear()};
 }
 preference.addEventListener('change',mount);
 addEventListener('pagehide',()=>dispose());addEventListener('pageshow',e=>{if(e.persisted)mount()});mount();
})();
