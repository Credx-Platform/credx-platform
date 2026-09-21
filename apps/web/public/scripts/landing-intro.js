/* Short, dismissible brand opening. No scroll lock, loading gate or stored state. */
(() => {
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const navigation=performance.getEntriesByType('navigation')[0];
 if(motion.matches||location.hash||scrollY>20||navigation?.type==='back_forward'||navigation?.type==='reload')return;
 const intro=document.createElement('div');
 intro.className='brand-intro';intro.setAttribute('aria-hidden','true');
 intro.innerHTML='<div class="intro-emblem"><span>cred<b>X</b></span><i></i></div>';
 document.body.append(intro);
 const abort=new AbortController();
 const finish=()=>{intro.remove();abort.abort();clearTimeout(timer)};
 const timer=setTimeout(finish,2400);
 for(const event of ['pointerdown','keydown','wheel','touchstart','pagehide'])addEventListener(event,finish,{once:true,passive:true,signal:abort.signal});
 motion.addEventListener('change',finish,{once:true,signal:abort.signal});
})();
