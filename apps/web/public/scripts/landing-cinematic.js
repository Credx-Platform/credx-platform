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
  `<span class="data-trail" data-plane="${plane}" style="--left:${left}%;--top:${top}%;--length:${length}px;--angle:${angle}deg;--duration:${duration}s;--delay:${delay}s;--alpha:${alpha};--trail-color:${i===6?'#a7a2f3':'#6ee2ff'}"><i></i></span>`).join('');
 // Desktop endpoints: perspective depth AND scale advance together.
 const depths=[
  {from:.62,to:1.10,z0:-180,z1:65,rx:3,ry:-8,x:0,y:-14,pointer:8},
  {from:.64,to:1.06,z0:-90,z1:95,rx:-3,ry:9,x:14,y:12,pointer:14},
  {from:.55,to:.93,z0:-300,z1:-50,rx:5,ry:10,x:-16,y:-16,pointer:3},
  {from:.65,to:1.12,z0:-140,z1:85,rx:-4,ry:-5,x:0,y:-12,pointer:10},
  {from:.55,to:1.04,z0:-300,z1:30,rx:4,ry:10,x:-12,y:250,pointer:7}
 ];
 function mount(){
  dispose();
  const abort=new AbortController();
  const opts={passive:true,signal:abort.signal};
  const sectionData=[...document.querySelectorAll('body>section')].map((el,i)=>({
   el,content:el.querySelector(':scope>.container,:scope>.about-inner'),pattern:el.id==='how-it-works'?3:i%3,top:0,done:false
  })).filter(s=>s.content);
  let raf=0,active=true,dirty=true,width=innerWidth,view=innerHeight,heroTop=0,heroHeight=0,distance=1;
  let pointerX=0,pointerY=0,targetX=0,targetY=0;
  let observer,resize;
  const reset=()=>{
   document.documentElement.classList.remove('cinematic-ready');hero.classList.remove('scene-active');
   runway.style.removeProperty('--hero-height');runway.style.removeProperty('--pin-top');
   objects.forEach(o=>{o.style.removeProperty('transform');o.style.removeProperty('opacity');o.querySelector('.object-motion').style.removeProperty('transform')});
   cueRow.style.removeProperty('opacity');copy.style.removeProperty('transform');trails.style.removeProperty('transform');trails.style.removeProperty('opacity');
   sectionData.forEach(s=>{s.el.classList.remove('section-opening');['transform','opacity','filter','clip-path','will-change'].forEach(p=>s.content.style.removeProperty(p))});
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
     const d=depths[i],travel=mobile?.5:1;
     if(i===4)el.style.opacity=String((mobile?.75:.34)+approaching*(mobile?.25:.66));
     // Mobile keeps generous spacing; original aspect ratios remain untouched.
     const scale=d.from+(d.to-d.from)*approaching;
     const z=d.z0+(d.z1-d.z0)*approaching;
     el.style.transform=`translate3d(${d.x*approaching*travel}px,${(i===4&&mobile?75:d.y)*approaching*travel}px,${z*travel}px) rotateX(${d.rx*(1-approaching)}deg) rotateY(${d.ry*(1-approaching*.65)}deg) scale(${scale})`;
     el.querySelector('.object-motion').style.transform=`translate3d(${pointerX*d.pointer}px,${pointerY*d.pointer}px,0)`;
    });
    copy.style.transform=`translate3d(0,${-departing*(mobile?12:28)}px,0)`;
    trails.style.opacity=String(.35+approaching*.4);
    trails.style.transform=`translate3d(${p*-22}px,${p*18}px,0)`;
    hero.style.setProperty('--journey-fill',String(.05+.95*p));
    cueRow.style.opacity=String(1-ease(clamp((p-.70)/.15)));
    const label=p<.4?'01 / PERSPECTIVE':p<.8?'02 / POSSIBILITIES':'03 / YOUR NEXT STEP';
    if(cue.textContent!==label)cue.textContent=label;
   }
   // Each section finishes opening early enough that its entire content is clear
   // while being read. Completed sections stay open when scrolling back.
   sectionData.forEach(s=>{
    if(s.done)return;
    const top=s.top-y;
    if(top>view*1.08)return;
    const progress=clamp((view*.98-top)/(Math.min(view*.48,360)));
    const e=ease(progress);
    if(top<0||progress===1){
     s.done=true;['transform','opacity','filter','clip-path','will-change'].forEach(p=>s.content.style.removeProperty(p));return;
    }
    s.content.style.willChange='transform, opacity';
    s.content.style.opacity=String(.16+.84*e);
    if(s.pattern===0)s.content.style.transform=`translate3d(0,${24*(1-e)}px,0) scaleX(${.86+.14*e})`;
    if(s.pattern===1){s.content.style.transform=`translate3d(0,${28*(1-e)}px,0) scale(${.96+.04*e})`;s.content.style.filter=`blur(${(mobile?2:6)*(1-e)}px)`;}
    if(s.pattern===2){s.content.style.clipPath=`inset(${(mobile?3:7)*(1-e)}% 0 ${8*(1-e)}% 0 round ${18*(1-e)}px)`;s.content.style.transform=`translate3d(0,${20*(1-e)}px,0)`;}
    if(s.pattern===3)s.content.style.transform=`perspective(1400px) translate3d(0,${32*(1-e)}px,${-80*(1-e)}px) rotateX(${(mobile?2:5)*(1-e)}deg)`;
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
