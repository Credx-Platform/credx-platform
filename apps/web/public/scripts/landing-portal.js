/* A single abstract interface aperture between the hero and the real About section. */
window.CredXMotion.register(({clamp,range,top})=>{
 const about=document.querySelector('#about'),content=about.querySelector('.about-inner'),art=document.querySelector('.hero-art');
 const children=[...content.querySelectorAll('h2,p,.about-name,.about-role')],photo=content.querySelector('.about-photo');
 const layer=document.createElement('div');layer.className='journey-aperture';layer.setAttribute('aria-hidden','true');
 layer.innerHTML='<div class="aperture-frame"><i></i><i></i><i></i><i></i></div>';
 document.body.append(layer);const frame=layer.firstElementChild;
 about.classList.add('journey-about');let start=0;
 return {
  measure(){start=top(about)},
  render(f){
   const screenTop=start-f.y,focused=about.contains(document.activeElement);
   const p=clamp((f.h*1.2-screenTop)/(f.h*.95));
   const formation=range(p,0,.25),pass=range(p,.25,.9),leave=range(p,.72,1);
   layer.style.opacity=String(focused?0:formation*(1-leave)*.65);
   layer.style.visibility=p>0&&p<1&&!focused?'visible':'hidden';
   // The fast final expansion occupies ~200–260 scroll pixels on common screens.
   frame.style.transform=`perspective(1200px) translate3d(0,${(1-pass)*f.h*.08}px,${pass*140}px) scale(${.55+pass*2.4}) rotateX(${(1-pass)*(f.mobile?1:3)}deg)`;
   frame.style.willChange=p>0&&p<1?'transform, opacity':'auto';
   const reveal=focused?1:range(p,.15,.78),visual=focused?1:range(p,.24,.86);
   content.style.opacity=String(.12+.88*reveal);
   content.style.transform=`perspective(1400px) translate3d(0,${(1-reveal)*24}px,0) scale(${.92+.08*reveal})`;
   content.style.filter=f.mobile?'none':`blur(${(1-reveal)*2}px)`;
   children.forEach((el,i)=>{const v=focused?1:range(p,.23+Math.min(i,3)*.035,.74+Math.min(i,3)*.035);el.style.opacity=String(.35+.65*v);el.style.transform=`translate3d(0,${(1-v)*10}px,0)`});
   photo.style.transform=`perspective(1000px) translate3d(${(1-visual)*(f.mobile?0:-16)}px,0,0) rotateY(${(1-visual)*4}deg)`;
   art.style.opacity=String(1-.65*range(p,0,.5));
   about.style.setProperty('--aperture-light',String(formation*(1-leave)));
  },
  destroy(){layer.remove();about.classList.remove('journey-about');about.style.removeProperty('--aperture-light');[content,photo,...children,art].forEach(el=>['transform','opacity','filter'].forEach(p=>el.style.removeProperty(p)))}
 };
});
