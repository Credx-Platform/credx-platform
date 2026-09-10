// Build first. Real browser input plus deterministic lifecycle/fallback regressions.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8785';
const server=spawn(process.execPath,[fileURLToPath(new URL('../apps/web/server.mjs',import.meta.url))],{env:{...process.env,PORT:'8785'},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<100;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});Object.defineProperty(navigator,'deviceMemory',{get:()=>8});
  window.framesRun=0;window.slowClock=false;let offset=0;
  const raf=requestAnimationFrame;
  window.requestAnimationFrame=fn=>raf(t=>{window.framesRun++;if(window.slowClock)offset+=50;fn(t+offset)});
 });
 await page.goto(base,{waitUntil:'networkidle'});
 // Small high-frequency wheel deltas approximate trackpad event cadence, not feel.
 for(let i=0;i<24;i++){await page.mouse.wheel(0,12);await page.waitForTimeout(16)}
 assert(await page.evaluate(()=>scrollY>150),'Fine wheel input scrolls normally');
 await page.waitForTimeout(1800);
 const count=await page.evaluate(()=>framesRun);await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>framesRun),count,'Scheduler sleeps at rest');
 for(const dy of [2400,-1700,3600,-4200,10000,-6000])await page.mouse.wheel(0,dy);
 await page.waitForTimeout(1800);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'Aggressive/reverse wheel has no overflow');
 const y=await page.locator('#progress').evaluate(e=>e.offsetTop-100);
 await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);
 await page.reload({waitUntil:'networkidle'});
 await page.waitForFunction(y=>Math.abs(scrollY-y)<.5,y);
 await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#progress>.container')).opacity)>.95);
 for(let attempt=0;attempt<3;attempt++){
  await page.goto(base+'/pricing',{waitUntil:'networkidle'});await page.goBack({waitUntil:'networkidle'});
  await page.waitForFunction(y=>Math.abs(scrollY-y)<.5,y);
  assert.equal(await page.locator('.journey-aperture').count(),1,'Back restores a single motion instance');
 }
 // A BFCache suspension must not mutate the layout saved by the browser.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const beforeHide=await page.evaluate(()=>({y:scrollY,height:document.documentElement.scrollHeight}));
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
 assert.deepEqual(await page.evaluate(()=>({y:scrollY,height:document.documentElement.scrollHeight})),beforeHide);
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await page.waitForFunction(()=>document.querySelectorAll('.journey-aperture').length===1);
 await page.setViewportSize({width:1280,height:720});
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(100);
 assert(await page.locator('.hero-btns').evaluate(e=>e.getBoundingClientRect().bottom<innerHeight),'Laptop CTA above fold');
 // Sustained slow animation timestamps trigger a one-way light profile this visit.
 await page.evaluate(()=>window.slowClock=true);await page.mouse.move(10,300);
 await page.waitForFunction(()=>document.documentElement.dataset.motionProfile==='light');
 assert(await page.locator('.energy-field').evaluateAll(es=>es.every(e=>getComputedStyle(e).display==='none')));
 await page.close();
 for(const width of [390,430]){
  const mobile=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});
  await mobile.goto(base,{waitUntil:'networkidle'});
  const session=await mobile.context().newCDPSession(mobile);
  async function swipe(from,to){
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:from}]});
   for(let i=1;i<=10;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:190,y:from+(to-from)*i/10}]});await mobile.waitForTimeout(16)}
   await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.waitForTimeout(400);
  }
  await swipe(720,200);assert(await mobile.evaluate(()=>scrollY>100),'Touch scroll advances');
  await swipe(200,720);
  assert(await mobile.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'Reverse touch has no overflow');
  await mobile.close();
 }
 console.log('PASS: fine wheel, aggressive/reverse wheel, idle scheduler, halfway reload, browser back, 1280x720, adaptive fallback, touch 390/430');
}finally{await browser?.close();server.kill()}
