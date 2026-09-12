// Public landing narrative browser acceptance suite. No production dependency.
// PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node scripts/test-landing-motion.mjs
// LANDING_BASE_URL=http://localhost:8791; BROWSER_ENGINE=webkit optional.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.BROWSER_ENGINE||'chromium';
const port=process.env.LANDING_PORT||'8792';
const base=process.env.LANDING_BASE_URL||`http://localhost:${port}`;
const shots=process.env.LANDING_SHOTS||'/tmp/credx-narrative-qa';
await mkdir(shots,{recursive:true});
let browser,server;const report=[];
const settle=async p=>{await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))};
const jump=async(p,y)=>{await p.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await settle(p)};
// WebKit honours upgrade-insecure-requests against the http test origin and then
// drops every subresource, so the page under test would load with no CSS or JS.
// Every page needs this, including the low-power and no-script fallback pages.
const relaxCsp=async p=>{
 if(engine!=='webkit')return;
 await p.route('**/*',async route=>{
  if(route.request().resourceType()!=='document')return route.continue();
  const response=await route.fetch(),headers=response.headers();
  headers['content-security-policy']=headers['content-security-policy']?.replace('upgrade-insecure-requests','')||'';
  await route.fulfill({response,headers});
 });
};
try{
 if(!process.env.LANDING_BASE_URL){
  server=spawn(process.execPath,[fileURLToPath(new URL('../apps/web/server.mjs',import.meta.url))],{env:{...process.env,PORT:port},stdio:'ignore'});
  for(let i=0;i<100;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 }
 browser=await pw[engine].launch({headless:true});
 const widths=(process.env.LANDING_WIDTHS||'1440,1920,1280,768,1024,375,390,430').split(',').map(Number);
 for(const width of widths){
  const height=width<768?844:1000;
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<1025});
  await context.addInitScript(()=>{
   // Exercise full quality independently of the headless host's CPU allocation.
   Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});
   Object.defineProperty(navigator,'deviceMemory',{get:()=>8});
   window.__rafCount=0;const original=requestAnimationFrame;
   window.requestAnimationFrame=cb=>original(t=>{window.__rafCount++;cb(t)});
  });
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await relaxCsp(p);
  await p.goto(base,{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(2450);
  const state=()=>p.evaluate(()=>({
   overflow:document.documentElement.scrollWidth>innerWidth,
   cta:document.querySelector('.hero-btns').getBoundingClientRect().bottom,
   mode:document.documentElement.className,
   heroDistance:document.querySelector('#heroRunway').offsetHeight-document.querySelector('#hero').offsetHeight,
   portalTop:document.querySelector('#interfaceRunway').offsetTop,
   portalDistance:document.querySelector('#interfaceRunway').offsetHeight-document.querySelector('#how-it-works').offsetHeight,
   transforms:[getComputedStyle(document.querySelector('.hero-art')).transform],
   headings:[...document.querySelectorAll('h1,h2')].length,
   y:scrollY
  }));
  let first=await state();assert(!first.overflow);assert(first.cta<height,'Hero CTA immediately available');
  assert(first.mode.includes('narrative-ready'));assert.equal(first.headings,15);
  assert.equal(await p.locator('.scene-object img').count(),5);
  assert(await p.locator('.scene-object img').evaluateAll(els=>els.every(el=>el.complete&&el.naturalWidth>0)));
  await p.screenshot({path:`${shots}/${engine}-${width}-intro.png`});
  // One coherent composition grows smoothly, with no independent pieces.
  assert(await p.evaluate(()=>{const a=document.querySelector('.hero-art').getBoundingClientRect(),c=document.querySelector('.hero-copy').getBoundingClientRect();return a.top>=c.bottom+18}),'Headline and copy stay above artwork');
  const contained=()=>p.evaluate(()=>{const a=document.querySelector('.hero-art').getBoundingClientRect();return [...document.querySelectorAll('.scene-object')].every(e=>{const r=e.getBoundingClientRect();return r.left>=a.left-1&&r.right<=a.right+1&&r.top>=a.top-1&&r.bottom<=a.bottom+1})});
  assert(await contained(),'All five asset bounds contained at full size');
  const scale=()=>p.locator('.hero-art').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).a);
  assert(Math.abs(await scale()-(width<768?.84:.76))<.001,'Hero starts at the previous small endpoint');
  let lastScale=width<768?.84:.76;
  for(let i=1;i<=12;i++){await jump(p,first.heroDistance*i/12);const next=await scale();assert(next>=lastScale-.001);lastScale=next;assert(await contained())}
  assert(Math.abs(lastScale-1)<.002,'Hero ends at the previous large endpoint');
  const advanced=await state();await p.waitForTimeout(160);assert.deepEqual((await state()).transforms,advanced.transforms,'No delayed interpolation');
  await p.screenshot({path:`${shots}/${engine}-${width}-hero-out.png`});
  assert(await p.locator('.scene-object').evaluateAll(els=>els.every(e=>getComputedStyle(e).transform==='none')),'No independent asset scaling');
  await jump(p,0);assert.deepEqual((await state()).transforms,first.transforms,'Reversal restores exact camera position');
  await p.waitForFunction(()=>document.querySelector('.cyber-streak'));
  assert(await p.locator('.cyber-streak').count()<=(width<768?2:3),'Bounded streak density');
  assert(await p.locator('.cyber-streak').evaluateAll(els=>els.every(e=>parseFloat(e.style.height)>=1.4&&parseFloat(e.style.height)<=3.6)),'Lines are twice the prior thickness');
  assert(await p.locator('.cyber-streak').evaluateAll(els=>els.every(e=>parseFloat(e.style.width)>=(innerWidth<768?540:840))),'Trails are three times the previous length');
  const streakState=()=>p.locator('.cyber-streak').evaluateAll(els=>els.map(e=>({transform:getComputedStyle(e).transform,opacity:getComputedStyle(e).opacity,time:e.getAnimations()[0].currentTime,playState:e.getAnimations()[0].playState})));
  const frozen=await streakState();assert(frozen.every(e=>e.playState==='paused'));
  await p.waitForTimeout(450);assert.deepEqual(await streakState(),frozen,'No movement, fade or new trails when scrolling stops');
  await p.evaluate(()=>scrollBy({top:24,behavior:'instant'}));await settle(p);
  assert.notDeepEqual(await streakState(),frozen,'Trails resume from native scroll input');
  // About opens before its reading position. Social controls appear at the
  // section bottom, fade on exit, and recover on reverse/keyboard navigation.
  const about=await p.locator('#aboutRunway').evaluate(e=>({top:e.getBoundingClientRect().top+scrollY,height:e.offsetHeight,travel:parseFloat(e.style.getPropertyValue('--about-travel'))}));
  const portalStartY=about.top-height*.72,portalTravel=about.travel+height*.72-80;
  await jump(p,portalStartY+portalTravel*.18);
  assert.equal(await p.locator('.about-transition').evaluate(e=>getComputedStyle(e).position),'fixed','Portal uses a viewport overlay');
  assert(await p.locator('.about-veil').evaluate(e=>getComputedStyle(e).maskImage.includes('radial-gradient')||getComputedStyle(e).webkitMaskImage.includes('radial-gradient')),'Overlay opens with a circular mask');
  assert.equal(await p.locator('.about-inner').evaluate(el=>getComputedStyle(el).position),'fixed','About is positioned inside the portal, not below it');
  assert.equal(await p.locator('.about-backdrop').evaluate(el=>getComputedStyle(el).opacity),'1','Backdrop hides preceding content');
  await p.screenshot({path:`${shots}/${engine}-${width}-about-overlay.png`});
  await jump(p,portalStartY+portalTravel*.4);
  assert.equal(await p.locator('.about-inner').evaluate(e=>getComputedStyle(e).opacity),'1','About is visible inside the expanding circle');
  assert(await p.locator('.portal-logo').evaluate(e=>Number(getComputedStyle(e).opacity)<.01),'Logo clears early so it does not cover About');
  assert(await p.locator('.about-gateway i').first().evaluate(e=>{const r=e.getBoundingClientRect();return Number(getComputedStyle(e).opacity)>.5&&r.top<innerHeight&&r.bottom>0}),'Bright portal visible during entry');
  await p.screenshot({path:`${shots}/${engine}-${width}-about-entry.png`});
  await jump(p,portalStartY+portalTravel*.79);
  assert.equal(await p.locator('.about-inner').evaluate(e=>getComputedStyle(e).opacity),'1','Content does not wait for full circle expansion');
  assert(await p.locator('.about-gateway i').first().evaluate(e=>{const r=e.getBoundingClientRect();return r.width>Math.hypot(innerWidth,innerHeight)}),'Circle clears all viewport corners before reveal');
  await jump(p,portalStartY+portalTravel*.18);
  assert(await p.locator('.about-inner').evaluate(e=>{const style=getComputedStyle(e);return +style.opacity>0&&+style.opacity<1&&new DOMMatrix(style.transform).m42>0}),'About glides into view while the circle expands');
  await p.screenshot({path:`${shots}/${engine}-${width}-about-glide.png`});
  await jump(p,about.top-80+about.travel);
  assert.equal(await p.locator('.about-inner').evaluate(e=>getComputedStyle(e).opacity),'1','About revealed after complete opening');
  await p.screenshot({path:`${shots}/${engine}-${width}-about-open.png`});
  await jump(p,portalStartY+portalTravel*.4);
  await jump(p,portalStartY);
  assert(Number(await p.locator('.about-inner').evaluate(e=>getComputedStyle(e).opacity))<.01,'Reversing back to the entrance closes the reveal');
  await p.locator('.about-socials a').first().focus();
  assert.equal(await p.evaluate(()=>document.activeElement.closest('.about-socials')!==null),true,'Unrevealed social links remain keyboard reachable');
  assert.equal(await p.locator('.about-socials a').first().evaluate(e=>getComputedStyle(e).opacity),'1','Focus exposes an unrevealed link');
  await p.locator('.about-socials a').first().evaluate(e=>e.blur());
  await jump(p,about.top+about.travel-80);
  const socialReadingY=await p.locator('.about-socials').evaluate(el=>document.querySelector('#aboutRunway').getBoundingClientRect().top+scrollY+parseFloat(document.querySelector('#aboutRunway').style.getPropertyValue('--about-travel'))+el.offsetTop+26-innerHeight*.48);
  await jump(p,socialReadingY);
  assert(await p.locator('.about-socials a').evaluateAll(els=>els.every(e=>Number(getComputedStyle(e).opacity)>.9&&getComputedStyle(e).visibility==='visible')),'All social icons fade in by the viewport midpoint');
  assert(await p.locator('.about-socials').evaluate(el=>el.classList.contains('social-highlight')),'First social entrance triggers a one-shot highlight');
  assert.deepEqual(await p.locator('.about-socials a').evaluateAll(els=>els.map(e=>new URL(e.href).hostname)),['www.instagram.com','www.youtube.com','www.facebook.com']);
  await p.screenshot({path:`${shots}/${engine}-${width}-about-social.png`});
  await jump(p,about.top+about.height);
  assert(await p.locator('.about-socials a').evaluateAll(els=>els.every(e=>Number(getComputedStyle(e).opacity)<.01)),'Socials fade after About');
  await jump(p,socialReadingY);
  await p.locator('.about-socials a').first().focus();
  assert.equal(await p.locator('.about-inner').evaluate(e=>getComputedStyle(e).clipPath),'none','Keyboard focus exposes content');
  await p.locator('.about-socials a').first().evaluate(e=>e.blur());
  // Wheel/trackpad-like bursts: native scroll responds without an input trap.
  await p.mouse.move(width/2,height/2);await p.mouse.wheel(0,240);await p.waitForTimeout(200);assert((await state()).y>0);
  for(let i=0;i<5;i++)await p.mouse.wheel(0,13);
  await p.waitForTimeout(180);
  // Portal enters and leaves once; remains non-interactive.
  await jump(p,first.portalTop-250);await settle(p);
  const portalStart=await p.locator('.portal-frames i').first().evaluate(e=>({transform:getComputedStyle(e).transform,opacity:getComputedStyle(e).opacity}));
  await p.screenshot({path:`${shots}/${engine}-${width}-portal.png`});
  await jump(p,first.portalTop+Math.max(220,first.portalDistance));
  const portalEnd=await p.locator('.portal-frames i').first().evaluate(e=>({transform:getComputedStyle(e).transform,opacity:getComputedStyle(e).opacity}));
  assert.notEqual(portalStart.transform,portalEnd.transform);assert(Number(portalEnd.opacity)<.01,'Portal clears interface');
  assert.equal(await p.locator('.portal-frames').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  // Cards enter individually, with visibly different presentation styles.
  const entranceTransforms=[];
  for(const selector of ['.md-card','.pg-card','.faq-item','.cur-card','.test-card','.rc-card']){
   const card=p.locator(selector).first();
   const naturalTop=await card.evaluate(el=>{let top=0;for(let n=el;n;n=n.offsetParent)top+=n.offsetTop;return top});
   await jump(p,naturalTop-height*.85);
   const entering=await card.evaluate(el=>({transform:getComputedStyle(el).transform,opacity:Number(getComputedStyle(el).opacity)}));
   assert(entering.opacity>0&&entering.opacity<1,`${selector} fades in as it enters`);
   assert.notEqual(entering.transform,'none',`${selector} moves in from its own entrance`);
   entranceTransforms.push(entering.transform);
   await jump(p,naturalTop-height*.5);
   assert.equal(await card.evaluate(el=>getComputedStyle(el).transform),'none',`${selector} settles before reading`);
  }
  assert(new Set(entranceTransforms).size>=4,'Cards use a mix of slide, zoom, fade and pop entrances');
  // Every section survives aggressive jumps in either direction, headings visible.
  const sections=await p.locator('section').all();
  for(const section of [...sections,...sections.slice().reverse()]){
   await section.evaluate(e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-80,behavior:'instant'}));await settle(p);
   assert(!(await state()).overflow,`No overflow at ${await section.getAttribute('id')}`);
   assert(await section.evaluate(e=>{const h=e.querySelector('h1,h2');return !h||(getComputedStyle(h).opacity==='1'&&getComputedStyle(h).visibility==='visible')}));
  }
  // Conversion area never receives animation transforms.
  await p.locator('#pricing').scrollIntoViewIfNeeded();await settle(p);
  assert(await p.locator('#pricing .plan').evaluateAll(els=>els.every(e=>getComputedStyle(e).transform==='none')));
  await p.screenshot({path:`${shots}/${engine}-${width}-pricing.png`});
  await p.locator('.faq-q').first().click();assert(await p.locator('.faq-item').first().evaluate(e=>e.classList.contains('open')));
  // In-page CTA navigation and keyboard accessibility.
  await jump(p,0);await p.locator('.hero-btns a[href="#how-it-works"]').click();await p.waitForTimeout(1100);
  assert(await p.locator('#how-it-works').evaluate(e=>e.getBoundingClientRect().top<innerHeight));
  await p.locator('.hero-btns a').first().focus();assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('href')),'/signup');
  // Refresh mid-page and real history traversal (bfcache where supported).
  await p.locator('#funding').evaluate(e=>scrollTo({top:e.offsetTop,behavior:'instant'}));await settle(p);
  await p.evaluate(()=>history.replaceState(null,'',location.pathname));
  const middle=(await state()).y;
  await p.reload({waitUntil:'load'});await p.waitForTimeout(500);
  assert(!await p.evaluate(()=>document.documentElement.classList.contains('smooth-scroll')),'Restoration is never switched to smooth scrolling by a timer');
  assert(Math.abs((await state()).y-middle)<120,'Refresh restores mid-page position');
  await p.goto(base+'/pricing',{waitUntil:'domcontentloaded'});await p.goBack({waitUntil:'load'});await p.waitForTimeout(500);
  assert((await state()).mode.includes('narrative-ready'),'Back navigation remounts');
  assert.equal(await p.locator('.data-trails').count(),1,'No duplicated effects');
  assert(await p.locator('.cyber-streak').count()<=3,'No leaked streaks after back');
  // The bounded data-energy layer is site-wide and non-interactive.
  assert.equal(await p.locator('.data-trails').evaluate(e=>e.closest('#hero')?'hero':'body'),'body');
  assert.equal(await p.locator('.data-trails').evaluate(e=>getComputedStyle(e).position),'fixed');
  // Resizing across breakpoints and orientation-like changes.
  await p.setViewportSize({width:width<768?1024:430,height:900});await p.waitForTimeout(180);assert(!(await state()).overflow);
  await p.setViewportSize({width,height});await p.waitForTimeout(180);assert(!(await state()).overflow);
  // Touch gesture through Chromium's browser input pipeline, not synthetic DOM events.
  if(width<768&&engine==='chromium'){
   await jump(p,0);const cdp=await context.newCDPSession(p);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width/2,y:650}]});
   for(let y=620;y>=200;y-=60){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width/2,y}]});await p.waitForTimeout(20)}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(200);assert((await state()).y>0,'Native touch scroll');await cdp.detach();
  }
  await jump(p,0);await p.waitForTimeout(1600);const idle=await p.evaluate(()=>window.__rafCount);await p.waitForTimeout(300);
  assert.equal(await p.evaluate(()=>window.__rafCount),idle,'Zero animation callbacks at rest');
  await p.emulateMedia({reducedMotion:'reduce'});await settle(p);
  assert.equal(await p.locator('.portal-frames').evaluate(e=>getComputedStyle(e).display),'none');
  assert(!(await state()).mode.includes('narrative-ready'));
  assert(await p.locator('.about-socials a').evaluateAll(els=>els.every(e=>getComputedStyle(e).visibility==='visible'&&getComputedStyle(e).opacity==='1')),'Reduced motion keeps all social links available');
  assert.equal((await state()).heroDistance,0,'Reduced motion removes sticky runway');
  assert.equal(await p.locator('#hero').evaluate(e=>getComputedStyle(e).position),'relative');
  await p.emulateMedia({reducedMotion:'no-preference'});await settle(p);assert((await state()).mode.includes('narrative-ready'));
  assert.deepEqual(errors,[]);
  report.push({engine,width,pass:true,nativeTouch:width<768&&engine==='chromium',idleCallbacks:0});
  console.log(`PASS ${engine} ${width}px: slow/fast/reverse/wheel, portal, content, CTA/FAQ, refresh/back, resize, reduced motion, idle`);
  await context.close();
 }
 // Low-power hardware and no-script fallbacks.
 const low=await browser.newPage({viewport:{width:1440,height:1000}});
 await low.addInitScript(()=>Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2}));
 await relaxCsp(low);
 await low.goto(base,{waitUntil:'load'});assert(await low.evaluate(()=>document.documentElement.classList.contains('motion-simple')));await low.close();
 const staticPage=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
 await relaxCsp(staticPage);
 await staticPage.goto(base,{waitUntil:'load'});assert(await staticPage.locator('h1').isVisible());
 assert.equal(await staticPage.locator('#hero').evaluate(e=>getComputedStyle(e).position),'relative');await staticPage.close();
 for(const [width,height] of [[320,568],[375,667],[844,390]]){
  const short=await browser.newPage({viewport:{width,height}});await relaxCsp(short);
  await short.goto(base,{waitUntil:'load'});await short.evaluate(()=>document.fonts.ready);await settle(short);
  assert(await short.evaluate(()=>{const c=document.querySelector('.hero-copy').getBoundingClientRect(),a=document.querySelector('.hero-art').getBoundingClientRect(),h=document.querySelector('#hero').getBoundingClientRect();return c.top>=60&&a.top>=c.bottom&&a.bottom<=h.bottom&&document.documentElement.scrollWidth<=innerWidth}),'Short viewport keeps title and complete artwork within the hero');
  if(height<=560){await jump(short,120);assert.equal(await short.locator('.hero-art').evaluate(e=>getComputedStyle(e).transform),'none')}
  await short.screenshot({path:`${shots}/${engine}-${width}x${height}-short.png`});await short.close();
 }
 console.log('PASS low-power, JavaScript-disabled and short/landscape viewport fallbacks');
 await writeFile(`${shots}/${engine}-results.json`,JSON.stringify(report,null,2));
}finally{await browser?.close();server?.kill()}
