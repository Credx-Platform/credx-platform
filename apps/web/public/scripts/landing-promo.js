// Landing extras: in-place YouTube playback, the Instagram reel carousel, and a
// one-per-session free-analysis promo shown after a minute on the page.
(()=>{
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const session={
  get(key){try{return sessionStorage.getItem(key)}catch{return null}},
  set(key,value){try{sessionStorage.setItem(key,value)}catch{}}
 };

 // Thumbnails until clicked, so three embeds cost nothing on first load.
 document.querySelectorAll('.yt-frame[data-yt]').forEach(button=>button.addEventListener('click',()=>{
  const frame=document.createElement('iframe');
  frame.src=`https://www.youtube-nocookie.com/embed/${button.dataset.yt}?autoplay=1&rel=0`;
  frame.title=button.getAttribute('aria-label').replace(/^Play: /,'');
  frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.allowFullscreen=true;
  frame.referrerPolicy='strict-origin-when-cross-origin';
  const box=document.createElement('div');
  box.className='yt-frame is-playing';
  box.append(frame);
  button.replaceWith(box);
  frame.focus();
 },{once:true}));

 // Reels render from the codes listed on the track; with none, only the follow CTA shows.
 const track=document.querySelector('.ig-track');
 const reels=(track?.dataset.reels||'').split(',').map(code=>code.trim()).filter(code=>/^[\w-]{5,20}$/.test(code));
 if(track&&reels.length){
  track.replaceChildren(...reels.map((code,i)=>{
   const card=document.createElement('div');
   card.className='ig-reel';
   const frame=document.createElement('iframe');
   frame.src=`https://www.instagram.com/reel/${code}/embed/`;
   frame.title=`CredX Instagram reel ${i+1}`;
   frame.loading='lazy';
   frame.allow='autoplay; encrypted-media; picture-in-picture; web-share';
   card.append(frame);
   return card;
  }));
  track.hidden=false;
  document.querySelectorAll('.ig-nav').forEach(button=>{button.hidden=false});
  const step=direction=>{
   const card=track.querySelector('.ig-reel');
   const distance=card?card.getBoundingClientRect().width+16:320;
   track.scrollBy({left:direction*distance,behavior:reduced.matches?'auto':'smooth'});
  };
  document.querySelector('.ig-prev')?.addEventListener('click',()=>step(-1));
  document.querySelector('.ig-next')?.addEventListener('click',()=>step(1));
 }

 const promo=document.getElementById('promoPop');
 const seenKey='cx-promo-seen';
 if(!promo||session.get(seenKey))return;
 let opener=null;
 const focusable=()=>[...promo.querySelectorAll('a[href],button')];
 function onKey(event){
  if(event.key==='Escape'){close();return}
  if(event.key!=='Tab')return;
  const items=focusable(),first=items[0],last=items[items.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 }
 function close(){
  promo.hidden=true;
  document.removeEventListener('keydown',onKey);
  opener?.focus?.({preventScroll:true});
 }
 promo.addEventListener('click',event=>{
  if(event.target===promo||event.target.closest('[data-promo-close]'))close();
 });
 setTimeout(()=>{
  if(session.get(seenKey))return;
  session.set(seenKey,'1');
  opener=document.activeElement;
  promo.hidden=false;
  document.addEventListener('keydown',onKey);
  promo.querySelector('.btn').focus({preventScroll:true});
 },60000);
})();
