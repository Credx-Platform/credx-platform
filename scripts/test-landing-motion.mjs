// Browser regression checks for the public landing only. Uses an existing
// Playwright installation; no browser tooling is shipped to website visitors.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs node scripts/test-landing-motion.mjs
// Optional: BROWSER_ENGINE=webkit, LANDING_BASE_URL=https://www.credxme.com
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.BROWSER_ENGINE||'chromium';
// Keep browser-engine runs isolated so one cannot stop another's preview.
const port=process.env.LANDING_PORT||(engine==='webkit'?'8780':'8778');
const base=process.env.LANDING_BASE_URL||`http://127.0.0.1:${port}`;
let server,browser;
try{
 if(!process.env.LANDING_BASE_URL){
  server=spawn(process.execPath,[fileURLToPath(new URL('../apps/web/server.mjs',import.meta.url))],{env:{...process.env,PORT:port},stdio:'ignore'});
  const deadline=Date.now()+10000;
  while(true){try{await fetch(base);break}catch{if(Date.now()>deadline)throw Error('Preview server failed');await new Promise(r=>setTimeout(r,100))}}
 }
 browser=await pw[engine].launch({headless:true});
 const widths=process.env.LANDING_WIDTHS?process.env.LANDING_WIDTHS.split(',').map(Number):[375,390,430,768,1024,1280,1440,1920];
 for(const width of widths){
  const page=await browser.newPage({viewport:{width,height:width<768?844:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // WebKit upgrades loopback HTTP due to the production CSP. Relax only that
  // directive in intercepted LOCAL test responses; never touch site headers.
  if(engine==='webkit'&&!process.env.LANDING_BASE_URL)await page.route('**/*',async route=>{
   if(route.request().resourceType()!=='document')return route.continue();
   const response=await route.fetch(),headers=response.headers();
   headers['content-security-policy']=headers['content-security-policy'].replace('upgrade-insecure-requests','');
   await route.fulfill({response,headers});
  });
  await page.goto(base,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(120);
  assert.equal(await page.locator('.scene-object img').count(),5);
  assert(await page.locator('.scene-object img').evaluateAll(els=>els.every(el=>el.complete&&el.naturalWidth>0)),'All five source images decode');
  const metrics=()=>page.evaluate(()=>({
   overflow:document.documentElement.scrollWidth>innerWidth,
   width:[...document.querySelectorAll('.scene-object img')].map(e=>e.getBoundingClientRect().width),
   distance:document.querySelector('.hero-runway').offsetHeight-document.querySelector('.hero').offsetHeight,
   top:document.querySelector('.hero').getBoundingClientRect().top,
   expectedTop:parseFloat(getComputedStyle(document.querySelector('.hero')).top),
   cta:document.querySelector('.hero-btns').getBoundingClientRect().bottom
  }));
  assert(await page.evaluate(()=>{const a=document.querySelector('.hero-art').getBoundingClientRect(),c=document.querySelector('.hero-copy').getBoundingClientRect();return a.top>=c.bottom-1}),'Artwork stays below copy at every width');
  assert.equal(await page.locator('.light-sheen').count(),0,'No reflection overlays over content');
  // A field of thin diagonal streaks, not a bar and not a round-headed star.
  assert(await page.locator('.scroll-streak').count()>=10,'Streak field, not a lone accent');
  assert(await page.locator('.scroll-streak').evaluateAll(els=>els.every(e=>e.offsetWidth<=2&&e.offsetHeight<=460)),'Streaks stay hairline thin');
  assert(await page.locator('.scroll-streak').evaluateAll(els=>{
   const lens=new Set(els.map(e=>e.offsetHeight)),alphas=new Set(els.map(e=>getComputedStyle(e).getPropertyValue('--a').trim()));
   return lens.size>=5&&alphas.size>=5;
  }),'Lengths and brightness vary across the field');
  assert(await page.locator('.scroll-streak').first().evaluate(e=>{
   const s=getComputedStyle(e),deg=parseFloat(s.getPropertyValue('--rot'));
   return s.backgroundImage.includes('gradient')&&deg>190&&deg<210;
  }),'Streak is a gradient on a steep diagonal');
  // Screen blending guarantees the field can only add light, never obscure text.
  assert.equal(await page.locator('.scroll-light').evaluate(e=>getComputedStyle(e).mixBlendMode),'screen','Light only ever adds, never darkens content');
  const start=await metrics();assert(!start.overflow);assert(start.cta<(width<768?844:1000),'Primary CTAs visible at opening');
  await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),start.distance*.75);
  // The scene settles, it does not zoom. Objects open near final size and gain
  // only a little as the page moves, so scrolling reads as ordinary scrolling.
  // An upper bound is asserted deliberately: a large jump here is the zoom-out
  // behaviour regressing, not an improvement.
  await page.waitForFunction(widths=>[...document.querySelectorAll('.scene-object img')].every((el,i)=>el.getBoundingClientRect().width>widths[i]*1.03),start.width,{timeout:5000});
  const end=await metrics();assert(!end.overflow);assert(Math.abs(end.top-end.expectedTop)<2,'Hero remains sticky during scrub');
  end.width.forEach((w,i)=>{
   const ratio=w/start.width[i];
   assert(ratio>1.03,`Object ${i} still responds to scroll (was ${ratio.toFixed(3)}x)`);
   assert(ratio<1.18,`Object ${i} settles instead of zooming (was ${ratio.toFixed(3)}x)`);
  });
  await page.waitForTimeout(150);const still=await metrics();still.width.forEach((w,i)=>assert(Math.abs(w-end.width[i])<1,'Growth stops when scrolling stops'));
  assert.equal(await page.locator('.data-trails').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  assert.equal(await page.locator('.scroll-light').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  // Light must follow either scroll direction and stop after input stops.
  const beamY=()=>page.locator('.scroll-streak').first().evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).m42);
  const lightFrame=await page.evaluate(()=>new Promise(resolve=>{
   // Observe the first style update in-page; a short accent may have faded
   // before another remote WebKit command or rendered frame can sample it.
   const beam=document.querySelector('.scroll-streak');
   const observer=new MutationObserver(()=>{
    observer.disconnect();resolve({
     y:new DOMMatrix(beam.style.transform).m42,
     opacity:Number(document.querySelector('.scroll-light').style.opacity)
    });
   });
   observer.observe(beam,{attributes:true,attributeFilter:['style']});
   scrollBy({top:100,behavior:'instant'});
  }));
  const down=lightFrame.y;
  assert(lightFrame.opacity>0,'Scroll activates light');
  await page.evaluate(()=>scrollBy({top:-20,behavior:'instant'}));
  await page.waitForFunction(y=>{
   const next=new DOMMatrix(getComputedStyle(document.querySelector('.scroll-streak')).transform).m42;
   const span=innerHeight+220,travel=((next-y)%span+span)%span;
   // Streaks move 1:1 with the wheel: 20px of scroll moves them exactly 20px.
   return Math.abs(travel-20)<1;
  },down);
  await page.waitForFunction(()=>[...document.querySelectorAll('.data-trail i')].every(e=>Number(getComputedStyle(e).opacity)===0)&&getComputedStyle(document.querySelector('.scroll-light')).opacity==='0', {}, {timeout:2000});
  assert(await page.locator('.data-trail i').evaluateAll(els=>els.every(e=>Number(getComputedStyle(e).opacity)===0)),'Background trails fade out promptly when idle');
  assert.equal(await page.locator('.scroll-light').evaluate(e=>getComputedStyle(e).opacity),'0','Light stops when idle');
  for(const section of await page.locator('body>section').all()){
   await section.evaluate(e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-100,behavior:'instant'}));
   await page.waitForFunction(el=>{const c=el.querySelector(':scope>.container,:scope>.about-inner');return !c||getComputedStyle(c).opacity==='1'},await section.elementHandle(),{timeout:5000});
   assert(await section.evaluate(e=>{const c=e.querySelector(':scope>.container,:scope>.about-inner');return !c||getComputedStyle(c).opacity==='1'}),'Section fully reveals');
   assert(!(await metrics()).overflow);
  }
  // Titles arrive oversized and pull back to their true size, driven by scroll.
  const titleScale=()=>page.evaluate(()=>new DOMMatrix(getComputedStyle(document.querySelector('.section-opening .stitle')).transform).m11);
  // Settle the title's section first. Until a section finishes opening it carries
  // its own transform, which moves the title while we are trying to position it;
  // once open those styles are dropped, so its document offset is then stable.
  const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const parkTitle=async f=>{
   await page.evaluate(frac=>{const t=document.querySelector('.section-opening .stitle');
    scrollTo({top:t.getBoundingClientRect().top+scrollY-innerHeight*frac,behavior:'instant'})},f);
   await frame();
  };
  await parkTitle(.2);await parkTitle(.2);
  const settled=await titleScale();
  // Its section is open now, so this offset no longer shifts under us.
  const docTop=await page.evaluate(()=>document.querySelector('.section-opening .stitle').getBoundingClientRect().top+scrollY);
  const arriving=await page.evaluate(async top=>{
   scrollTo({top:Math.max(0,top-innerHeight*.86),behavior:'instant'});
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   return new DOMMatrix(getComputedStyle(document.querySelector('.section-opening .stitle')).transform).m11;
  },docTop);
  assert(arriving>1.05,`Title arrives oversized (was ${arriving.toFixed(3)}x)`);
  assert(Math.abs(settled-1)<.03,`Title settles to true size (was ${settled.toFixed(3)}x)`);
  assert(!(await metrics()).overflow,'Title zoom never widens the document');
  await page.locator('.faq-q').first().click();assert(await page.locator('.faq-item').first().evaluate(e=>e.classList.contains('open')));
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await page.locator('.hero-btns a[href="#how-it-works"]').click();
  await page.waitForFunction(()=>{const t=document.querySelector('#how-it-works').getBoundingClientRect().top;return t>=55&&t<160},{},{timeout:8000});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>!document.documentElement.classList.contains('cinematic-ready'),{},{timeout:5000});
  assert(await page.evaluate(()=>getComputedStyle(document.querySelector('.hero')).position==='relative'));
  assert.equal(await page.locator('.data-trails').evaluate(e=>getComputedStyle(e).display),'none');
  assert.equal(await page.locator('.light-sheen').count(),0,'Reduced motion cleans up reflections');
  assert(await page.locator('.stitle').evaluateAll(els=>els.every(e=>{const m=getComputedStyle(e).transform;return m==='none'||new DOMMatrix(m).m11===1})),'Reduced motion leaves titles at true size');
  assert(await page.evaluate(()=>Math.abs(document.querySelector('.hero-runway').offsetHeight-document.querySelector('.hero').offsetHeight)<2),'No pin spacer in reduced motion');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.hero')).position==='sticky',{},{timeout:5000});
  assert.equal(await page.locator('.hero').evaluate(e=>getComputedStyle(e).position),'sticky','Motion reinitialises without reload');
  assert.deepEqual(errors,[],'No page JavaScript errors');
  console.log(`PASS ${engine} ${width}px: assets, growth, pinning, reveals, overflow, FAQ, CTA anchor, reduced motion, cleanup`);
  await page.close();
 }
}finally{await browser?.close();server?.kill()}
