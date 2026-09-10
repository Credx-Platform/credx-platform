/* One interface aperture: approach the sample workspace, enter, then settle. */
window.CredXMotion.register(({clamp,range,top})=>{
 const host=document.querySelector('#platform-introduction'),content=host.querySelector('.bridge-grid');
 const art=document.querySelector('.hero-art'),card=host.querySelector('.rc-card');
 const layer=document.createElement('div');layer.className='journey-aperture';layer.setAttribute('aria-hidden','true');
 layer.innerHTML='<div class="aperture-frame"><i></i><i></i><i></i><i></i></div>';
 document.body.append(layer);const frame=layer.firstElementChild;
 host.classList.add('journey-entry');let start=0;
 return {
  measure(){start=top(host)},
  render(f){
   if(!f.changed)return;
   const focused=host.contains(document.activeElement);
   const p=clamp((f.h*1.2-(start-f.y))/(f.h*.95));
   const formation=range(p,0,.25),pass=range(p,.25,.9),leave=range(p,.72,1);
   const active=p>0&&p<1&&!focused;
   layer.style.opacity=String(focused?0:formation*(1-leave)*.65);
   layer.style.visibility=active?'visible':'hidden';
   frame.style.transform=f.simple?`scale(${.85+pass*.45})`:`perspective(1200px) translate3d(0,${(1-pass)*f.h*.08}px,${pass*140}px) scale(${.55+pass*2.4}) rotateX(${(1-pass)*(f.mobile?1:3)}deg)`;
   frame.style.willChange=active?'transform, opacity':'auto';
   const reveal=focused?1:range(p,.12,.74),visual=focused?1:range(p,.2,.84);
   // Heading stays legible while the sample interface advances through the frame.
   content.style.opacity=String(.65+.35*reveal);
   content.style.transform=`translate3d(0,${(1-reveal)*(f.simple?8:20)}px,0)`;
   card.style.transform=f.simple?'none':`perspective(1200px) translate3d(${(1-visual)*(f.mobile?0:22)}px,0,${-70*(1-visual)}px) rotateY(${(1-visual)*(f.mobile?-2:-8)}deg) scale(${.94+.06*visual})`;
   card.style.willChange=active&&!f.simple?'transform':'auto';
   art.style.opacity=String(1-.55*range(p,0,.5));
   host.style.setProperty('--aperture-light',String(formation*(1-leave)));
  },
  destroy(){layer.remove();host.classList.remove('journey-entry');host.style.removeProperty('--aperture-light');[content,card,art].forEach(el=>['transform','opacity','will-change'].forEach(p=>el.style.removeProperty(p)))}
 };
});
