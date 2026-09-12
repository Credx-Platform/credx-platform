// Scroll-driven trail energy, lifecycle and fault audit. No app test hooks: it
// watches .data-trails[data-live] and wraps the 2D canvas API from an init script.
// PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node scripts/test-landing-energy.mjs
// LANDING_BASE_URL=http://localhost:8793; BROWSER_ENGINE=webkit optional.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.BROWSER_ENGINE||'chromium';
const base=process.env.LANDING_BASE_URL||'http://localhost:8793';
const shots=process.env.LANDING_SHOTS||'/tmp/credx-final-energy';
let server,browser;
await mkdir(shots,{recursive:true});
// WebKit upgrades the http test origin's subresources and drops them; see test-landing-motion.mjs.
const relaxCsp=async p=>{
 if(engine!=='webkit')return;
 await p.route('**/*',async route=>{
  if(route.request().resourceType()!=='document')return route.continue();
  const response=await route.fetch(),headers=response.headers();
  headers['content-security-policy']=headers['content-security-policy']?.replace('upgrade-insecure-requests','')||'';
  await route.fulfill({response,headers});
 });
};
const fullQuality=()=>{
 Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});
 Object.defineProperty(navigator,'deviceMemory',{get:()=>8});
};
// Runs before page scripts. Records launches, peak density, each new trail's
// first flight segment, stroke widths, rAF callback cost and layout shift.
const instrument=()=>{
 Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});
 Object.defineProperty(navigator,'deviceMemory',{get:()=>8});
 const audit=window.audit={spawns:[],peak:0,origins:[],maxWidth:0,maxCoreWidth:0,shifts:0,callbackMs:[]};
 const ctx=CanvasRenderingContext2D.prototype;
 // Every drawn trail creates one gradient from its tail to its head. wipe()
 // opens each flight frame, and the newest trail is drawn first, so a frame
 // with one more gradient than the last begins with the new trail's origin.
 let frame=[],previous=0;
 const gradient=ctx.createLinearGradient;
 ctx.createLinearGradient=function(...args){frame.push(args);return gradient.apply(this,args)};
 const clear=ctx.clearRect;
 ctx.clearRect=function(...args){
  if(frame.length>previous)audit.origins.push(frame[0]);
  previous=frame.length;frame=[];
  return clear.apply(this,args);
 };
 const width=Object.getOwnPropertyDescriptor(ctx,'lineWidth');
 Object.defineProperty(ctx,'lineWidth',{...width,set(v){
  audit.maxWidth=Math.max(audit.maxWidth,v);
  if(this.strokeStyle instanceof CanvasGradient)audit.maxCoreWidth=Math.max(audit.maxCoreWidth,v);
  width.set.call(this,v);
 }});
 const raf=requestAnimationFrame;
 window.requestAnimationFrame=cb=>raf(t=>{const s=performance.now();cb(t);audit.callbackMs.push(performance.now()-s)});
 try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)audit.shifts+=e.value}).observe({type:'layout-shift',buffered:true})}catch{}
 document.addEventListener('DOMContentLoaded',()=>{
  const layer=document.querySelector('.data-trails');
  // Each record's successor holds the value it was changed to; launches are the only increments.
  new MutationObserver(records=>records.forEach((r,i)=>{
   const before=Number(r.oldValue||0),after=Number(i+1<records.length?records[i+1].oldValue||0:layer.dataset.live||0);
   if(after>before)audit.spawns.push(performance.now());
   audit.peak=Math.max(audit.peak,after);
  })).observe(layer,{attributes:true,attributeFilter:['data-live'],attributeOldValue:true});
 });
};
// Continuous instant scrolling that bounces between the top and bottom of the page.
const sweep=(p,ms,step=90,every=60)=>p.evaluate(({ms,step,every})=>new Promise(done=>{
 let dir=1;const end=performance.now()+ms;
 (function tick(){
  const max=document.documentElement.scrollHeight-innerHeight;
  if(scrollY+step>max)dir=-1;else if(scrollY-step<0)dir=1;
  scrollBy({top:dir*step,behavior:'instant'});
  performance.now()<end?setTimeout(tick,every):done();
 })();
}),{ms,step,every});
const live=p=>p.locator('.data-trails').evaluate(e=>Number(e.dataset.live||0));
const spawns=p=>p.evaluate(()=>audit.spawns.length);
const drained=(p,timeout)=>p.waitForFunction(()=>(document.querySelector('.data-trails').dataset.live||'0')==='0',null,{timeout});
const blank=p=>p.locator('.data-trails canvas').evaluate(c=>{
 if(!c.width||!c.height)return true;
 const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
 for(let i=3;i<d.length;i+=4)if(d[i])return false;
 return true;
});
// Scroll in short bursts until a trail is in flight, then stop input.
const launch=async p=>{for(let i=0;i<20;i++){await sweep(p,300);if(await live(p))return}throw new Error('No trail launched')};
const ready=p=>p.evaluate(()=>document.documentElement.classList.contains('narrative-ready'));
try{
 if(!process.env.LANDING_BASE_URL){
  server=spawn(process.execPath,[fileURLToPath(new URL('../apps/web/server.mjs',import.meta.url))],{env:{...process.env,PORT:'8793'},stdio:'ignore'});
  for(let i=0;i<100;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 }
 browser=await pw[engine].launch({headless:true});
 const desktop=await browser.newContext({viewport:{width:1440,height:1000}});
 await desktop.addInitScript(instrument);
 const p=await desktop.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await relaxCsp(p);
 await p.goto(base,{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);
 assert(await ready(p),'Motion enabled at full quality');
 await p.waitForTimeout(3000);
 assert.equal(await spawns(p),0,'No trails launch while the page sits idle');
 assert(await blank(p),'Idle canvas stays empty');
 const cls=await p.evaluate(()=>audit.shifts);
 assert(cls<.1,'No material initial layout shift');
 // Twenty seconds of continuous scrolling in both directions.
 await sweep(p,20000);
 const stopped=Date.now();
 await drained(p,6000);
 const drainMs=Date.now()-stopped;
 const seen=await p.evaluate(()=>audit);
 assert(seen.spawns.length>=12,`Scrolling launches trails steadily (${seen.spawns.length})`);
 assert(seen.peak>=1&&seen.peak<=3,`At most three trails in flight (${seen.peak})`);
 assert(seen.origins.length>=8,`Enough launches sampled to judge paths (${seen.origins.length})`);
 const keys=seen.origins.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`);
 assert.equal(new Set(keys).size,keys.length,'Every trail starts from a new random point');
 const headings=seen.origins.map(([x0,y0,x1,y1])=>Math.atan2(y1-y0,x1-x0));
 const quadrants=new Set(headings.map(a=>`${Math.sign(Math.cos(a))}${Math.sign(Math.sin(a))}`));
 assert(quadrants.size>=3,`Trails launch in varied diagonal directions (${[...quadrants]})`);
 const tilts=headings.map(a=>Math.atan(Math.abs(Math.tan(a)))*180/Math.PI);
 assert(tilts.every(t=>t>=12&&t<=78),'No vertical rain or flat bars across copy');
 assert(seen.maxCoreWidth>=1&&seen.maxCoreWidth<=1.3*2.4+1e-9,`Bright core is a bold but bounded line (${seen.maxCoreWidth}px)`);
 assert(seen.maxWidth<=1.3*8+1e-9,`Glow stroke stays bounded (${seen.maxWidth}px)`);
 assert(drainMs<=5000,`Launched trails finish flying after input stops (${drainMs}ms)`);
 assert(await blank(p),'Canvas clears once every trail has landed');
 const settled=await spawns(p);await p.waitForTimeout(2000);
 assert.equal(await spawns(p),settled,'No new trails launch after scrolling stops');
 // Full top-to-bottom visual record; wait for lazily loaded portraits at each stop.
 const sections=await p.locator('section').all();
 for(let i=0;i<sections.length;i++){
  await sections[i].evaluate(e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-80,behavior:'instant'}));
  await p.waitForTimeout(160);
  await p.locator('.about-photo').first().evaluate(e=>e.complete?Promise.resolve():new Promise(r=>{e.addEventListener('load',r,{once:true});setTimeout(r,1000)}));
  await p.screenshot({path:`${shots}/${engine}-desktop-${String(i).padStart(2,'0')}.png`});
 }
 // History suspension removes trails, ignores scroll, keeps layout, and resumes.
 const geometry=await p.locator('#heroRunway').evaluate(e=>e.offsetHeight);
 await launch(p);
 await p.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
 assert.equal(await live(p),0,'Suspension removes live trails');
 assert(await blank(p),'Suspension clears the canvas');
 const suspended=await spawns(p);
 await sweep(p,800);
 assert.equal(await spawns(p),suspended,'Scrolling while suspended launches nothing');
 assert.equal(await p.locator('#heroRunway').evaluate(e=>e.offsetHeight),geometry,'History suspension preserves layout');
 await p.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await sweep(p,1200);
 assert(await spawns(p)>suspended,'pageshow resumes scroll-launched trails');
 // Resizing drops in-flight trails rather than stretching them.
 await launch(p);
 await p.setViewportSize({width:1280,height:1000});
 await drained(p,1000);
 assert(await blank(p),'Resize clears the canvas');
 // Reduced motion clears trails immediately and keeps them off until allowed again.
 await launch(p);
 await p.emulateMedia({reducedMotion:'reduce'});
 await p.waitForFunction(()=>!document.documentElement.classList.contains('narrative-ready'));
 assert.equal(await live(p),0,'Reduced motion clears live trails');
 assert(await blank(p),'Reduced motion clears the canvas');
 const reduced=await spawns(p);
 await sweep(p,1200);
 assert.equal(await spawns(p),reduced,'Reduced motion launches nothing');
 assert.equal(await p.locator('.hero-art').evaluate(e=>getComputedStyle(e).transform),'none');
 await p.emulateMedia({reducedMotion:'no-preference'});
 await p.waitForFunction(()=>document.documentElement.classList.contains('narrative-ready'));
 await sweep(p,1200);
 assert(await spawns(p)>reduced,'Trails return when motion is allowed again');
 assert.deepEqual(errors,[],'No page errors on desktop');
 // Phones use the simple mode and its lower density cap.
 const phone=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
 await phone.addInitScript(instrument);
 const m=await phone.newPage(),phoneErrors=[];m.on('pageerror',e=>phoneErrors.push(e.message));
 await relaxCsp(m);
 await m.goto(base,{waitUntil:'load'});await m.waitForTimeout(1500);
 await sweep(m,8000,70);
 await drained(m,6000);
 const small=await m.evaluate(()=>audit);
 assert(small.spawns.length>=4,`Phone scrolling launches trails (${small.spawns.length})`);
 assert(small.peak>=1&&small.peak<=2,`At most two trails on phones (${small.peak})`);
 assert.deepEqual(phoneErrors,[],'No page errors on phone');
 await m.screenshot({path:`${shots}/${engine}-phone.png`});
 const times=seen.callbackMs.slice().sort((a,b)=>a-b);
 const report={engine,spawns:seen.spawns.length,sampledOrigins:seen.origins.length,peak:seen.peak,phoneSpawns:small.spawns.length,phonePeak:small.peak,
  drainMs,cls,maxCoreWidthPx:seen.maxCoreWidth,maxGlowWidthPx:seen.maxWidth,callbackP95Ms:times[Math.floor(times.length*.95)]||0,
  note:'Headless-browser observation; not physical-device GPU certification.'};
 await writeFile(`${shots}/${engine}-energy-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 // A canvas failure mid-flight must recover to the complete static page.
 const broken=await browser.newContext({viewport:{width:1440,height:1000}});
 await broken.addInitScript(fullQuality);
 await broken.addInitScript(()=>{CanvasRenderingContext2D.prototype.stroke=()=>{throw new Error('Injected canvas failure')}});
 const f=await broken.newPage(),warnings=[],faults=[];
 f.on('console',msg=>{if(msg.type()==='warning'||msg.type()==='warn')warnings.push(msg.text())});
 f.on('pageerror',e=>faults.push(e.message));
 await relaxCsp(f);
 await f.goto(base,{waitUntil:'load'});await f.waitForTimeout(1500);
 assert(await ready(f),'Motion starts before the fault');
 await sweep(f,1500);
 await f.waitForFunction(()=>!document.documentElement.classList.contains('narrative-ready'),null,{timeout:3000});
 assert.equal(await live(f),0,'Fault clears trails');
 assert(warnings.some(w=>w.includes('CredX motion disabled')),'Fault is reported once as a warning');
 assert.deepEqual(faults,[],'Fault does not surface as an uncaught error');
 assert.equal(await f.locator('.hero-art').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).a),1);
 assert(await f.locator('h1').first().isVisible(),'Static content remains');
 console.log(`PASS ${engine}: idle, scroll launches, density, random paths, stroke width, drain, lifecycle, resize, reduced motion, phone cap, canvas fault recovery`);
}finally{await browser?.close();server?.kill()}
