/* Standalone public landing enhancement: native sticky + scrubbed CSS 3D.
 * No scroll hijacking, runtime dependencies, or writes to business-flow state.
 * Missing JS leaves a complete static page. All listeners/observers are disposed
 * on pagehide and reinstalled on bfcache restoration or motion preference changes.
 */
(() => {
 'use strict';
 const hero=document.getElementById('hero');
 const runway=document.getElementById('heroRunway');
 if(!hero||!runway) return;
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 let dispose=()=>{};
 const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
 const ease=v=>v*v*(3-2*v);
 // Decelerating curve for section reveals: fastest at the start, easing out to a
 // stop, which reads as one fluid motion instead of a panel snapping into place.
 const glide=v=>1-Math.pow(1-v,3);
 const objects=[...hero.querySelectorAll('.scene-object')];
 const copy=hero.querySelector('.hero-copy');
 const trails=hero.querySelector('.data-trails');
 const cue=hero.querySelector('.journey-state');
 const cueRow=hero.querySelector('.journey-cue');
 // Deterministic irregular spacing avoids synchronised loops and layout changes.
 const trailSpecs=[
  ['back',12,20,130,-22,17,-9,.20],['mid',68,34,190,27,11,-4,.34],
  ['back',30,76,110,12,19,-14,.18],['front',76,68,240,-31,9,-6,.5],
  ['back',58,14,160,-16,23,-17,.16],['mid',9,61,220,23,13,-8,.28],
  ['mid',83,87,160,-26,15,-12,.30],['front',52,42,260,18,12,-2,.42]
 ];
 trails.innerHTML=trailSpecs.map(([plane,left,top,length,angle,duration,delay,alpha],i)=>
  `<span class="data-trail" data-plane="${plane}" style="--left:${left}%;--top:${top}%;--length:${Math.round(length*.4)}px;--angle:${angle}deg;--duration:${duration}s;--delay:${delay}s;--alpha:${alpha};--trail-color:${i===6?'rgba(255,255,255,.8)':'#fff'}"><i></i></span>`).join('');
 // Compact 1x→3x range: each object starts at a smaller scale and resolves
 // independently, with staggered timing so the artwork reads as separate
 // objects popping through the scene instead of one flat still image.
 const depths=[
  {from:.34,to:1.00,z0:10,z1:65,rx:3,ry:-8,x:0,y:-14,pointer:8,delay:.02},
  {from:.32,to:1.00,z0:40,z1:95,rx:-3,ry:9,x:14,y:12,pointer:14,delay:.14},
  {from:.30,to:.90,z0:-105,z1:-50,rx:5,ry:10,x:-16,y:-16,pointer:3,delay:.08},
  {from:.34,to:1.00,z0:30,z1:85,rx:-4,ry:-5,x:0,y:-12,pointer:10,delay:.20},
  {from:.31,to:.92,z0:-25,z1:30,rx:4,ry:10,x:-12,y:250,pointer:7,delay:.11}
 ];
 function mount(){
  dispose();
  const abort=new AbortController();
  const opts={passive:true,signal:abort.signal};
  const sectionData=[...document.querySelectorAll('body>section')].map((el,i)=>({
   el,content:el.querySelector(':scope>.container,:scope>.about-inner'),top:0,done:false
  })).filter(s=>s.content);
  // Section titles pull back from oversized to their true size as they arrive.
  // Driven by scroll position, not a timer, so it tracks the wheel exactly.
  // Selected from the sections themselves: the .section-opening class is not
  // applied until further down this function, so it cannot be matched here.
  const titles=sectionData.flatMap(s=>[...s.el.querySelectorAll('.stitle,.about-inner>h2')]);
  let raf=0,active=true,dirty=true,width=innerWidth,view=innerHeight,heroTop=0,heroHeight=0,distance=1;
  let pointerX=0,pointerY=0,targetX=0,targetY=0;
  let observer,resize;
  const reset=()=>{
   document.documentElement.classList.remove('cinematic-ready');hero.classList.remove('scene-active');
   runway.style.removeProperty('--hero-height');runway.style.removeProperty('--pin-top');
   objects.forEach(o=>{o.style.removeProperty('transform');o.style.removeProperty('opacity');o.querySelector('.object-motion').style.removeProperty('transform')});
   cueRow.style.removeProperty('opacity');copy.style.removeProperty('transform');trails.style.removeProperty('transform');trails.style.removeProperty('opacity');
   titles.forEach(el=>el.style.removeProperty('transform'));
   sectionData.forEach(s=>{s.el.classList.remove('section-opening','section-visible');['transform','opacity','filter','clip-path','will-change'].forEach(p=>s.content.style.removeProperty(p))});
  };
  dispose=()=>{abort.abort();cancelAnimationFrame(raf);observer?.disconnect();resize?.disconnect();reset()};
  if(media.matches){reset();return;}
  document.documentElement.classList.add('cinematic-ready');
  sectionData.forEach((s,i)=>{s.el.classList.add('section-opening');s.el.dataset.graphic=String(i%3)});
  function measure(){
   width=innerWidth;view=innerHeight;heroHeight=hero.offsetHeight;
   runway.style.setProperty('--hero-height',`${heroHeight}px`);
   runway.style.setProperty('--pin-top',`${Math.min(0,view-heroHeight)}px`);
   heroTop=runway.getBoundingClientRect().top+scrollY;
   distance=runway.offsetHeight-heroHeight;
   sectionData.forEach(s=>s.top=s.el.getBoundingClientRect().top+scrollY);
   dirty=false;
  }
  function schedule(){if(!raf&&!document.hidden)raf=requestAnimationFrame(draw)}
  function draw(){
   raf=0;if(dirty)measure();
   const y=scrollY;
   const p=clamp((y-heroTop)/Math.max(1,distance));
   const mobile=width<768;
   const approaching=ease(clamp((p-.12)/.73));
   const departing=ease(clamp((p-.65)/.35));
   pointerX+=(targetX-pointerX)*.12;pointerY+=(targetY-pointerY)*.12;
   if(active){
    objects.forEach((el,i)=>{
     const d=depths[i],travel=.5;
     if(i===4)el.style.opacity=String(.75+approaching*.25);
     // Mobile keeps generous spacing; original aspect ratios remain untouched.
     const objectProgress=ease(clamp((p-d.delay)/Math.max(.01,1-d.delay)));
     const scale=d.from+(d.to-d.from)*objectProgress;
     const z=d.z0+(d.z1-d.z0)*objectProgress;
     el.style.transform=`translate3d(${d.x*objectProgress*travel}px,${(i===4?75:d.y)*objectProgress*travel}px,${z*travel}px) rotateX(${d.rx*(1-objectProgress)}deg) rotateY(${d.ry*(1-objectProgress*.65)}deg) scale(${scale})`;
     el.querySelector('.object-motion').style.transform=`translate3d(${pointerX*d.pointer}px,${pointerY*d.pointer}px,0)`;
    });
    copy.style.transform=`translate3d(0,${-departing*(mobile?12:28)}px,0)`;
    trails.style.opacity=String(.5+approaching*.42);
    trails.style.transform=`translate3d(${p*-22}px,${p*18}px,0)`;
    hero.style.setProperty('--journey-fill',String(.05+.95*p));
    cueRow.style.opacity=String(1-ease(clamp((p-.70)/.15)));
    const label=p<.4?'01 / PERSPECTIVE':p<.8?'02 / POSSIBILITIES':'03 / YOUR NEXT STEP';
    if(cue.textContent!==label)cue.textContent=label;
   }
   // One continuous fluid reveal for every section: drift and settle, decelerating
   // the whole way. No clip-path rectangles, no horizontal squash and no blur
   // step — those were what made the old transitions read as blocky panels.
   sectionData.forEach(s=>{
    if(s.done)return;
    const top=s.top-y;
    if(top>view*1.12)return;
    const progress=clamp((view*1.02-top)/(Math.min(view*.62,540)));
    const e=glide(progress);
    if(top<0||progress===1){
     s.done=true;s.el.classList.add('section-visible');['transform','opacity','filter','clip-path','will-change'].forEach(p=>s.content.style.removeProperty(p));return;
    }
    s.content.style.willChange='transform, opacity';
    s.content.style.opacity=String(.3+.7*e);
    s.content.style.transform=`translate3d(0,${(mobile?16:22)*(1-e)}px,0) scale(${.988+.012*e})`;
   });
   titles.forEach(el=>{
    const top=el.getBoundingClientRect().top;
    if(top>view*1.05||top<-el.offsetHeight*2.2){el.style.removeProperty('transform');return;}
    const t=ease(clamp((view*.9-top)/(view*.42)));
    const scale=1.4-.4*t;
    el.style.transform=scale>1.002?`scale(${scale.toFixed(4)})`:'';
   });
   if(active&&(Math.abs(targetX-pointerX)>.002||Math.abs(targetY-pointerY)>.002))schedule();
  }
  addEventListener('scroll',schedule,opts);
  addEventListener('resize',()=>{dirty=true;schedule()},opts);
  addEventListener('orientationchange',()=>{dirty=true;schedule()},opts);
  document.addEventListener('visibilitychange',()=>{hero.classList.toggle('scene-active',active&&!document.hidden);if(document.hidden){cancelAnimationFrame(raf);raf=0}else schedule()},opts);
  if(matchMedia('(hover: hover) and (pointer: fine)').matches){
   hero.addEventListener('pointermove',e=>{if(width<768)return;targetX=clamp(e.clientX/width)*2-1;targetY=clamp(e.clientY/view)*2-1;schedule()},opts);
   hero.addEventListener('pointerleave',()=>{targetX=targetY=0;schedule()},opts);
  }
  document.addEventListener('focusin',e=>{
   const s=sectionData.find(s=>s.el.contains(e.target));if(s){s.done=true;['transform','opacity','filter','clip-path','will-change'].forEach(p=>s.content.style.removeProperty(p))}
  },{signal:abort.signal});
  observer=new IntersectionObserver(entries=>{active=entries[0].isIntersecting;hero.classList.toggle('scene-active',active&&!document.hidden);if(active)schedule()},{threshold:0});
  observer.observe(runway);
  resize=new ResizeObserver(()=>{dirty=true;schedule()});resize.observe(hero);sectionData.forEach(s=>resize.observe(s.el));
  document.fonts?.ready.then(()=>{if(!abort.signal.aborted){dirty=true;schedule()}});
  measure();draw();
 }
 media.addEventListener('change',mount);
 addEventListener('pagehide',()=>dispose());
 addEventListener('pageshow',e=>{if(e.persisted)mount()});
 mount();
})();
