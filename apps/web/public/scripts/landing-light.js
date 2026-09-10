/* Scroll-triggered finite energy packets, always BEHIND text and controls.
 * No stars, bright heads, full-screen beams, idle loops, or network resources. */
window.CredXMotion.register(({on,request,top,clamp})=>{
 const mobile=innerWidth<768;
 const specs=[...document.querySelectorAll('#hero,#platform-introduction,#breakdown,#how-it-works,#progress,#modules')].map(host=>{
  const field=document.createElement('div');field.className='energy-field';field.setAttribute('aria-hidden','true');
  host.prepend(field);host.classList.add('energy-scene');
  const lines=Array.from({length:mobile?2:3},(_,i)=>{const el=document.createElement('i');el.className=`energy-trace energy-${i===0?'back':i===1?'mid':'front'}`;field.append(el);return {el,start:-Infinity,duration:600,x:0,y:0,dx:0,dy:0,angle:0,depth:0,alpha:.2}});
  return {host,field,lines,top:0,height:0};
 });
 let lastY=scrollY,lastEmit=-Infinity,sequence=0,direction=1,travel=0;
 function clear(){specs.forEach(s=>s.lines.forEach(l=>{l.start=-Infinity;l.el.style.opacity='0';l.el.style.willChange='auto'}))}
 on(window,'scroll',()=>{
  const delta=scrollY-lastY;lastY=scrollY;if(!delta||document.documentElement.dataset.motionProfile==='light')return;
  const next=Math.sign(delta);if(next!==direction){clear();direction=next;travel=100;}
  travel+=Math.abs(delta);const now=performance.now();
  if(now-lastEmit<140||travel<65)return;
  const scene=specs.find(s=>s.top+s.height>scrollY+innerHeight*.25&&s.top<scrollY+innerHeight*.8);
  if(!scene)return;
  const order=scene.lines.map((_,i)=>scene.lines[(i+sequence+1)%scene.lines.length]);
  const line=order.find(l=>now-l.start>l.duration);if(!line)return;
  lastEmit=now;travel=0;sequence++;
  const plane=scene.lines.indexOf(line);
  line.duration=plane===0?900:plane===1?460:280;
  const fromLeft=sequence%2===0;
  // The path lives in scene gutters. Copy/UI are on higher stacking planes.
  line.x=fromLeft?12:innerWidth-90;
  line.y=clamp(scrollY-scene.top+innerHeight*(.3+(sequence%3)*.19),24,scene.height-80);
  line.dx=(fromLeft?1:-1)*(mobile?120:280);
  line.dy=-direction*(plane===0?120:220);
  line.angle=sequence%3===0?0:Math.atan2(line.dy,line.dx)*180/Math.PI;
  line.depth=plane===2?35:plane===0?-30:0;
  line.alpha=plane===0?.16:plane===1?.32:.46;
  line.start=now;request();
 });
 return {
  measure(){specs.forEach(s=>{s.top=top(s.host);s.height=s.host.offsetHeight})},
  render(f){if(f.simple){clear();return false;}let active=false;
   specs.forEach(s=>s.lines.forEach(l=>{
    const p=(f.now-l.start)/l.duration;
    // A scroll event can arrive after this frame's rAF timestamp. Keep the
    // new packet scheduled until its first non-negative frame.
    if(p<0&&Number.isFinite(l.start)){active=true;return;}
    if(p>=1){l.el.style.opacity='0';l.el.style.willChange='auto';return;}
    if(s.top+s.height<f.y||s.top>f.y+f.h){l.start=-Infinity;l.el.style.opacity='0';l.el.style.willChange='auto';return;}
    active=true;l.el.style.willChange='transform, opacity';
    l.el.style.opacity=String(Math.sin(p*Math.PI)*l.alpha);
    l.el.style.transform=`translate3d(${l.x+l.dx*p}px,${l.y+l.dy*p}px,${l.depth*p}px) rotate(${l.angle}deg) scaleX(${.8+.2*p})`;
   }));return active;
  },
  pause:clear,
  destroy(){clear();specs.forEach(s=>{s.field.remove();s.host.classList.remove('energy-scene')})}
 };
});
