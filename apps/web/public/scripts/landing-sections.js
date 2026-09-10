/* Reversible depth reveals, floating software panels, quiet conversion scenes. */
window.CredXMotion.register(({range,top})=>{
 const kinds={'breakdown':'panels','how-it-works':'software','action-plan':'side','how':'side','progress':'panels','funding':'depth','modules':'panels','testimonials':'depth'};
 const scenes=[...document.querySelectorAll('body>section')].filter(el=>el.id!=='about').map(el=>({
  el,content:el.querySelector(':scope>.container'),kind:kinds[el.id]||'quiet',start:0,height:0,
  cards:[...el.querySelectorAll('.bd-cat,.dash-panel,.md-card,.pg-card,.step,.pl-item')].map((el,i)=>({el,i,start:0})),
 })).filter(s=>s.content);
 scenes.forEach(s=>{s.el.classList.add('journey-section');s.el.dataset.transition=s.kind;s.content.classList.add('motion-content');s.cards.forEach(c=>c.el.classList.add('motion-card'))});
 const reset=el=>['transform','opacity','filter','will-change'].forEach(p=>el.style.removeProperty(p));
 return {
  measure(){scenes.forEach(s=>{s.start=top(s.el);s.height=s.el.offsetHeight;s.cards.forEach(c=>c.start=top(c.el))})},
  render(f){
   scenes.forEach(s=>{
    const y=s.start-f.y,focused=s.el.contains(document.activeElement);
    const enter=focused?1:range(f.h-y,0,f.h*.58);
    const leave=s.kind==='depth'&&!focused?range(-(y+s.height-100),0,200):0;
    // Outgoing depth only recedes after its readable area has left the viewport.
    const quiet=s.kind==='quiet',x=s.kind==='side'?(s.el.id==='action-plan'?-1:1)*(f.mobile?16:64)*(1-enter):0;
    s.content.style.opacity=String((quiet?.85+.15*enter:.3+.7*enter)*(1-leave*.4));
    s.content.style.transform=`perspective(1500px) translate3d(${x}px,${(quiet?8:24)*(1-enter)}px,0) scale(${1-(quiet?.005:.045)*(1-enter)+leave*.02}) rotateY(${s.kind==='side'?(f.mobile?0:3)*(1-enter):0}deg)`;
    s.content.style.willChange=y<f.h&&y+s.height>0&&enter<1?'transform, opacity':'auto';
    if(y>f.h*1.1||y+s.height<0)return;
    s.cards.forEach(({el,i,start})=>{
     const t=focused||el.contains(document.activeElement)?1:range(f.h*.98-(start-f.y),i%3*(f.mobile?8:18),f.h*.5+i%3*18);
     const d=1-t,travel=f.mobile?16:44;
     // Six related gestures, not identical cards or mechanical section alternation.
     const pose=[[-travel,0,-36,3],[0,0,-65,0],[travel,0,-28,-3],[0,24,20,0],[0,0,0,0],[0,8,-15,0]][i%6];
     el.style.opacity=String(.2+.8*t);
     el.style.transform=`perspective(1200px) translate3d(${pose[0]*d}px,${pose[1]*d}px,${pose[2]*d*(f.mobile?.3:1)}px) rotateY(${pose[3]*d*(f.mobile?.25:1)}deg) scale(${1-(i%6===5?.035:0)*d})`;
     el.style.willChange=d>0&&d<1?'transform, opacity':'auto';
    });
   });
  },
  destroy(){scenes.forEach(s=>{s.el.classList.remove('journey-section');delete s.el.dataset.transition;s.content.classList.remove('motion-content');reset(s.content);s.cards.forEach(c=>{c.el.classList.remove('motion-card');reset(c.el)})})}
 };
});
