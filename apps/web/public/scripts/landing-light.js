/* Scroll-only illumination. No idle loops, hit targets, or business-flow hooks. */
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
  const abort=new AbortController(),visible=new Set(),surfaces=[];
  let raf=0,lastY=scrollY,position=innerHeight*.72,lastMove=0,travel=0,nextSweep=0,slope=-7;
  const headings=new Set(document.querySelectorAll('.hero h1,.stitle,.about h2'));
  const targets=[...headings,...document.querySelectorAll('.md-card,.pg-card,.plan,.step,.rc-card,.dash-ui,.object-motion')];
  for(const el of targets){
   if(headings.has(el)){el.classList.add('light-heading');continue;}
   el.classList.add('light-surface');const sheen=document.createElement('span');
   sheen.className='light-sheen';sheen.setAttribute('aria-hidden','true');el.append(sheen);
   surfaces.push({el,sheen});
  }
  const lookup=new Map(surfaces.map(s=>[s.el,s.sheen]));
  const observer=new IntersectionObserver(entries=>entries.forEach(e=>{
   if(e.isIntersecting)visible.add(e.target);
   else {visible.delete(e.target);e.target.style.removeProperty('--reflect-strength');const sheen=lookup.get(e.target);if(sheen)sheen.style.opacity='0';}
  }));targets.forEach(el=>observer.observe(el));
  function draw(now){
   raf=0;const fade=Math.max(0,1-(now-lastMove)/420),height=innerHeight;
   sheet.style.opacity=String(fade*.8);
   beam.style.transform=`translate3d(0,${position-55}px,0) rotate(${slope}deg)`;
   // Read geometry together, then write highlights; only viewport targets count.
   const readings=[...visible].map(el=>({el,rect:el.getBoundingClientRect()}));
   readings.forEach(({el,rect})=>{
    const localBeam=position+Math.tan(slope*Math.PI/180)*(rect.left+rect.width/2-innerWidth/2);
    const distance=Math.abs(rect.top+rect.height/2-localBeam);
    const strength=Math.max(0,1-distance/(rect.height/2+110))*fade;
    if(headings.has(el))el.style.setProperty('--reflect-strength',String(strength*.6));
    else {const sheen=lookup.get(el);sheen.style.opacity=String(strength);sheen.style.setProperty('--reflect-y',`${50+(localBeam-rect.top)/Math.max(1,rect.height)*50}%`);}
   });
   if(fade>0)raf=requestAnimationFrame(draw);
  }
  function onScroll(){
   const delta=scrollY-lastY;lastY=scrollY;if(!delta)return;
   travel+=Math.abs(delta);
   if(travel>=nextSweep){
    nextSweep=travel+innerHeight*(1.3+Math.random()*.9);
    slope=(Math.random()>.5?1:-1)*(4+Math.random()*8);
   }
   position-=delta*.85;
   // Preserve travel across viewport edges, including fast scroll and reversal.
   const span=innerHeight+220;
   position=((position+110)%span+span)%span-110;
   lastMove=performance.now();if(!raf)raf=requestAnimationFrame(draw);
  }
  addEventListener('scroll',onScroll,{passive:true,signal:abort.signal});
  document.addEventListener('visibilitychange',()=>{
   if(document.hidden){cancelAnimationFrame(raf);raf=0;sheet.style.opacity='0';}
  },{signal:abort.signal});
  dispose=()=>{
   abort.abort();observer.disconnect();cancelAnimationFrame(raf);sheet.style.opacity='0';
   surfaces.forEach(({el,sheen})=>{sheen.remove();el.classList.remove('light-surface')});
   headings.forEach(el=>{el.classList.remove('light-heading');el.style.removeProperty('--reflect-strength')});
  };
 }
 preference.addEventListener('change',mount);
 addEventListener('pagehide',()=>dispose());addEventListener('pageshow',e=>{if(e.persisted)mount()});mount();
})();
