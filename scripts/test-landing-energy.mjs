// 30-second, unseeded energy/lifecycle/performance audit. No app test hooks.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LANDING_BASE_URL||'http://localhost:8793';
const shots=process.env.LANDING_SHOTS||'/tmp/credx-final-energy';
let server,browser;
await mkdir(shots,{recursive:true});
try{
 if(!process.env.LANDING_BASE_URL){
  server=spawn(process.execPath,[fileURLToPath(new URL('../apps/web/server.mjs',import.meta.url))],{env:{...process.env,PORT:'8793'},stdio:'ignore'});
  for(let i=0;i<100;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 }
 browser=await pw.chromium.launch();
 const p=await browser.newPage({viewport:{width:1440,height:1000}});
 await p.addInitScript(()=>{
  Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});
  Object.defineProperty(navigator,'deviceMemory',{get:()=>8});
  window.audit={runs:[],peak:0,shifts:0,callbackMs:[]};
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){
   const run=animate.call(this,frames,options);
   if(this.classList.contains('cyber-streak')){
    const entry={frames,duration:options.duration,width:this.style.width,at:performance.now(),finished:false};
    window.audit.runs.push(entry);
    window.audit.peak=Math.max(window.audit.peak,document.querySelectorAll('.cyber-streak').length);
    run.addEventListener('finish',()=>entry.finished=true);
   }
   return run;
  };
  const raf=requestAnimationFrame;
  window.requestAnimationFrame=cb=>raf(t=>{const s=performance.now();cb(t);window.audit.callbackMs.push(performance.now()-s)});
  new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.audit.shifts+=e.value}).observe({type:'layout-shift',buffered:true});
 });
 await p.goto(base,{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);
 await p.waitForTimeout(30000);
 const audit=await p.evaluate(()=>window.audit);
 assert(audit.runs.length>=12,'Enough spontaneous streaks to assess a 30-second sequence');
 assert.equal(new Set(audit.runs.map(r=>JSON.stringify(r.frames))).size,audit.runs.length,'No repeated paths');
 assert(audit.peak<=3,'At most three streaks');
 assert(audit.runs.every(r=>r.duration>=350&&r.duration<=1450),'Bounded lifetimes');
 assert(audit.runs.filter(r=>r.duration<=1200).length/audit.runs.length>.65,'Most streaks are quick');
 assert(audit.runs.slice(0,-3).every(r=>r.finished),'Old streaks complete');
 assert(audit.shifts<.1,'No material initial layout shift');
 // Full top-to-bottom visual record; wait for lazily loaded portraits at each stop.
 const sections=await p.locator('section').all();
 for(let i=0;i<sections.length;i++){
  await sections[i].evaluate(e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-80,behavior:'instant'}));
  await p.waitForTimeout(160);
  await p.locator('.about-photo').evaluate(e=>e.complete?Promise.resolve():new Promise(r=>{e.addEventListener('load',r,{once:true});setTimeout(r,1000)}));
  await p.screenshot({path:`${shots}/desktop-${String(i).padStart(2,'0')}.png`});
 }
 const geometry=await p.locator('#heroRunway').evaluate(e=>e.offsetHeight);
 await p.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
 assert.equal(await p.locator('.cyber-streak').count(),0,'Suspension removes live particles');
 assert.equal(await p.locator('#heroRunway').evaluate(e=>e.offsetHeight),geometry,'History suspension preserves layout');
 await p.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await p.emulateMedia({reducedMotion:'reduce'});
 await p.waitForTimeout(1600);
 assert.equal(await p.locator('.cyber-streak').count(),0,'Reduced motion clears and stops particles');
 assert.equal(await p.locator('.hero-art').evaluate(e=>getComputedStyle(e).transform),'none');
 const times=audit.callbackMs.slice().sort((a,b)=>a-b);
 const report={spawns:audit.runs.length,uniquePaths:audit.runs.length,peak:audit.peak,cls:audit.shifts,callbackP95Ms:times[Math.floor(times.length*.95)]||0,lifetimes:audit.runs.map(r=>Math.round(r.duration)),note:'Headless-browser observation; not physical-device GPU certification.'};
 await writeFile(`${shots}/energy-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 // Animation API failure must recover to the complete static page.
 const fail=await browser.newPage();
 await fail.addInitScript(()=>{Element.prototype.animate=()=>{throw new Error('Injected animation failure')}});
 await fail.goto(base);await fail.waitForTimeout(2200);
 assert(!await fail.evaluate(()=>document.documentElement.classList.contains('narrative-ready')));
 assert.equal(await fail.locator('.hero-art').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).a),1);
 assert.equal(await fail.locator('.cyber-streak').count(),0);
 console.log('PASS 30-second randomization, lifecycle, reduced motion, static error recovery and full-page screenshots');
}finally{await browser?.close();server?.kill()}
