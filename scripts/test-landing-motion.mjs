// Public landing narrative browser acceptance suite. No production dependency.
// PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node scripts/test-landing-motion.mjs
// LANDING_BASE_URL=http://localhost:8791; BROWSER_ENGINE=webkit optional.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.BROWSER_ENGINE||'chromium';
const base=process.env.LANDING_BASE_URL||'http://localhost:8792';
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
  server=spawn(process.execPath,[fileURLToPath(new URL('../apps/web/server.mjs',import.meta.url))],{env:{...process.env,PORT:'8792'},stdio:'ignore'});
  for(let i=0;i<100;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 }
 browser=await pw[engine].launch({headless:true});
 const widths=(process.env.LANDING_WIDTHS||'1440,1920,1280,768,1024,390,430').split(',').map(Number);
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
  await p.goto(base,{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1400);
  const state=()=>p.evaluate(()=>({
   overflow:document.documentElement.scrollWidth>innerWidth,
   cta:document.querySelector('.hero-btns').getBoundingClientRect().bottom,
   mode:document.documentElement.className,
   heroDistance:document.querySelector('#heroRunway').offsetHeight-document.querySelector('#hero').offsetHeight,
   portalTop:document.querySelector('#interfaceRunway').offsetTop,
   portalDistance:document.querySelector('#interfaceRunway').offsetHeight-document.querySelector('#how-it-works').offsetHeight,
   transforms:[...document.querySelectorAll('.scene-object')].map(e=>getComputedStyle(e).transform),
   headings:[...document.querySelectorAll('h1,h2')].length,
   y:scrollY
  }));
  let first=await state();assert(!first.overflow);assert(first.cta<height,'Hero CTA immediately available');
  assert(first.mode.includes('narrative-ready'));assert.equal(first.headings,15);
  assert.equal(await p.locator('.scene-object img').count(),5);
  assert(await p.locator('.scene-object img').evaluateAll(els=>els.every(el=>el.complete&&el.naturalWidth>0)));
  await p.screenshot({path:`${shots}/${engine}-${width}-intro.png`});
  // Camera stays scroll-coupled; energy completes a finite pass after input stops.
  const energy=()=>p.locator('.energy-rail i').first().evaluate(e=>getComputedStyle(e).transform);
  const rail0=await energy();
  for(let i=1;i<=12;i++)await jump(p,first.heroDistance*i/18);
  const advanced=await state();assert.notDeepEqual(advanced.transforms,first.transforms);
  assert.notEqual(await energy(),rail0,'Energy visibly advances with scrolling');
  await p.waitForTimeout(160);assert.deepEqual((await state()).transforms,advanced.transforms,'No delayed interpolation');
  await jump(p,0);assert.deepEqual((await state()).transforms,first.transforms,'Reversal restores exact camera position');
  // A scroll-triggered rail continues without input, crosses the full screen,
  // then ends (no permanent ambient loop or frozen bright band).
  await p.waitForTimeout(1500);await jump(p,120);await p.waitForTimeout(100);
  const movingRail=await energy();await p.waitForTimeout(180);
  assert.notEqual(await energy(),movingRail,'Rail continues after scroll stops');
  await p.waitForTimeout(1450);
  assert.equal(await p.locator('.energy-rail i').evaluateAll(els=>els.reduce((n,e)=>n+e.getAnimations().length,0)),0,'Rail completes its passage');
  assert.equal(await p.locator('.energy-rail').first().evaluate(e=>getComputedStyle(e).height),'3px');
  if(width<768){
   assert(await p.evaluate(()=>{const a=document.querySelector('.hero-art').getBoundingClientRect(),c=document.querySelector('.hero-copy').getBoundingClientRect();return a.top<c.bottom&&a.bottom>c.top}),'Mobile copy overlays artwork');
  }
  // About opens before its reading position. Social controls appear at the
  // section bottom, fade on exit, and recover on reverse/keyboard navigation.
  const about=await p.locator('#about').evaluate(e=>({top:e.getBoundingClientRect().top+scrollY,height:e.offsetHeight}));
  await jump(p,about.top-height*.8);
  const opening=await p.locator('.about-inner').evaluate(e=>getComputedStyle(e).clipPath);
  await p.locator('.about-socials a').first().focus();
  assert.equal(await p.evaluate(()=>document.activeElement.closest('.about-socials')!==null),true,'Unrevealed social links remain keyboard reachable');
  assert.equal(await p.locator('.about-socials a').first().evaluate(e=>getComputedStyle(e).opacity),'1','Focus exposes an unrevealed link');
  await p.locator('.about-socials a').first().evaluate(e=>e.blur());
  await jump(p,about.top-80);
  assert.notEqual(await p.locator('.about-inner').evaluate(e=>getComputedStyle(e).clipPath),opening);
  await jump(p,about.top+about.height-height*.72);
  assert(await p.locator('.about-socials a').evaluateAll(els=>els.every(e=>Number(getComputedStyle(e).opacity)>.9&&getComputedStyle(e).visibility==='visible')),'All social icons pop in');
  assert.deepEqual(await p.locator('.about-socials a').evaluateAll(els=>els.map(e=>new URL(e.href).hostname)),['www.instagram.com','www.youtube.com','www.facebook.com']);
  await p.screenshot({path:`${shots}/${engine}-${width}-about-social.png`});
  await jump(p,about.top+about.height);
  assert(await p.locator('.about-socials a').evaluateAll(els=>els.every(e=>Number(getComputedStyle(e).opacity)<.01)),'Socials fade after About');
  await jump(p,about.top+about.height-height*.72);
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
  assert(Math.abs((await state()).y-middle)<120,'Refresh restores mid-page position');
  await p.goto(base+'/pricing',{waitUntil:'domcontentloaded'});await p.goBack({waitUntil:'load'});await p.waitForTimeout(500);
  assert((await state()).mode.includes('narrative-ready'),'Back navigation remounts');
  assert.equal(await p.locator('.energy-rail').count(),2,'No duplicated effects');
  // The line pattern is site-wide now: fixed, outside the hero, and still painted
  // under the nav rather than over it.
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
 console.log('PASS low-power and JavaScript-disabled fallbacks');
 await writeFile(`${shots}/${engine}-results.json`,JSON.stringify(report,null,2));
}finally{await browser?.close();server?.kill()}
