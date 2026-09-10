/* Hero scene: approved artwork, shared stacked composition, modest camera approach. */
window.CredXMotion.register(({clamp,range,top,on,request})=>{
 const hero=document.querySelector('#hero'),runway=document.querySelector('#heroRunway');
 const art=hero.querySelector('.hero-art'),copy=hero.querySelector('.hero-copy'),bloom=hero.querySelector('.scene-bloom');
 const objects=[...hero.querySelectorAll('.scene-object')];
 const cue=hero.querySelector('.journey-state'),cueRow=hero.querySelector('.journey-cue');
 // Preserve the larger cash / smaller cards balance and central merchandise.
 const poses=[{scale:1.10,z:32,x:0,y:-7,ry:-5},{scale:1.06,z:47,x:7,y:6,ry:6},
  {scale:.97,z:-25,x:-8,y:-8,ry:6},{scale:1.12,z:42,x:0,y:-6,ry:-3},
  {scale:.98,z:15,x:-6,y:37,ry:5}];
 let start=0,distance=1,height=0,px=0,py=0,tx=0,ty=0;
 on(hero,'pointermove',e=>{if(e.pointerType!=='mouse'||innerWidth<768||document.documentElement.dataset.motionProfile==='light')return;tx=clamp(e.clientX/innerWidth)*2-1;ty=clamp(e.clientY/innerHeight)*2-1;request()});
 on(hero,'pointerleave',()=>{tx=ty=0;request()});
 return {
  measure(){height=hero.offsetHeight;runway.style.setProperty('--hero-height',`${height}px`);runway.style.setProperty('--pin-top',`${Math.min(0,innerHeight-height)}px`);start=top(runway);distance=runway.offsetHeight-height},
  render(f){
   const p=clamp((f.y-start)/distance),approach=range(p,0,.86),exit=range(p,.75,1);
   const visible=f.y<start+height+distance&&f.y+f.h>start;
   hero.classList.toggle('scene-active',visible);
   if(!visible)return false;
   if(f.simple)tx=ty=px=py=0;
   if(!f.changed&&Math.abs(tx-px)+Math.abs(ty-py)<=.002)return false;
   const settle=1-Math.exp(-f.dt/90);px+=(tx-px)*settle;py+=(ty-py)*settle;
   objects.forEach((el,i)=>{
    const d=poses[i],depth=f.simple?0:f.mobile?.55:1,scale=d.scale*((f.mobile?.86:.8)+(f.mobile?.14:.2)*approach);
    el.style.transform=`translate3d(${d.x*approach}px,${d.y*approach}px,${(d.z-50*(1-approach))*depth}px) rotateX(${(i%2?2:-2)*(1-approach)}deg) rotateY(${d.ry*(1-approach)}deg) scale(${scale})`;
    el.style.opacity=String(i===4?.88+.12*approach:1);
    el.querySelector('.object-motion').style.transform=`translate3d(${px*(i===3?4:2)}px,${py*3}px,0) rotateX(${-py*1.5}deg) rotateY(${px*2}deg)`;
   });
   copy.style.transform=`translate3d(0,${-exit*(f.mobile?6:12)}px,0)`;
   bloom.style.transform=`translate3d(0,${p*18}px,0) scale(${1-.12*exit})`;
   hero.style.setProperty('--journey-fill',String(.05+.95*p));cueRow.style.opacity=String(1-exit);
   cue.textContent=p<.35?'01 / YOUR PERSPECTIVE':p<.75?'02 / YOUR POSSIBILITIES':'03 / INSIDE CREDX';
   return Math.abs(tx-px)+Math.abs(ty-py)>.002;
  },
  destroy(){
   hero.classList.remove('scene-active');['--hero-height','--pin-top'].forEach(p=>runway.style.removeProperty(p));
   hero.style.removeProperty('--journey-fill');[copy,bloom,cueRow,art,...objects,...hero.querySelectorAll('.object-motion')].forEach(el=>{el.style.removeProperty('transform');el.style.removeProperty('opacity')});
  }
 };
});
