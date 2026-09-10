// Native-scroll journey regression suite. Build web before running.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.BROWSER_ENGINE||'chromium',port=engine==='webkit'?8780:8778;
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[fileURLToPath(new URL('../apps/web/server.mjs',import.meta.url))],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
let browser;
try {
 for(let i=0;i<100;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 browser=await pw[engine].launch();
 async function prepare(page){await page.addInitScript(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,get:()=>8});Object.defineProperty(navigator,'deviceMemory',{configurable:true,get:()=>8})});if(engine==='webkit')await page.route('**/*',async r=>{if(r.request().resourceType()!=='document')return r.continue();const response=await r.fetch(),headers=response.headers();headers['content-security-policy']=headers['content-security-policy']?.replace('upgrade-insecure-requests','')||'';await r.fulfill({response,headers})});}
 const widths=process.env.VIEWPORT_WIDTHS?process.env.VIEWPORT_WIDTHS.split(',').map(Number):[375,390,430,768,1024,1280,1440,1920];
 for(const width of widths){
  const page=await browser.newPage({viewport:{width,height:width<768?844:1000}});await prepare(page);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  const scroll=async y=>{await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await page.waitForFunction(y=>Math.abs(scrollY-Math.max(0,Math.min(y,document.documentElement.scrollHeight-innerHeight)))<2,y);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))};
  const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  const pos=selector=>page.locator(selector).evaluate(e=>{let y=0;for(let n=e;n;n=n.offsetParent)y+=n.offsetTop;return y});
  assert.deepEqual(await page.locator('body>section').evaluateAll(es=>es.map(e=>e.id)),['platform-introduction','how-it-works','modules','breakdown','action-plan','progress','funding','chat','how','masterclass-curriculum','about','testimonials','faq','pricing','get-started'],'Product narrative precedes conversion');
  assert.equal(await page.locator('.scene-object img').count(),5);
  assert(await page.locator('.scene-object img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth)));
  assert(!await overflow());
  assert(await page.evaluate(()=>document.querySelector('.hero-art').getBoundingClientRect().top>=document.querySelector('.hero-copy').getBoundingClientRect().bottom-1));
  assert(await page.locator('.hero-btns').evaluate(e=>e.getBoundingClientRect().bottom<innerHeight));
  const widths=()=>page.locator('.scene-object img').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width));
  await page.mouse.wheel(0,160);
  await page.waitForFunction(()=>[...document.querySelectorAll('.energy-trace')].some(e=>Number(e.style.opacity)>0));
  await page.waitForTimeout(1700); // Let the wheel gesture and finite pulse finish.
  await scroll(0);
  const start=await widths(),distance=await page.locator('.hero-runway').evaluate(e=>e.offsetHeight-e.querySelector('.hero').offsetHeight);
  await scroll(distance*.8);const end=await widths();end.forEach((v,i)=>assert(v/start[i]>1.05&&v/start[i]<1.5,`Controlled approach ${v/start[i]}`));
  await scroll(0);const reverse=await widths();reverse.forEach((v,i)=>assert(Math.abs(v-start[i])<2,'Hero reverses'));
  const about=await pos('#platform-introduction'),h=width<768?844:1000;
  const aperture=()=>page.locator('.journey-aperture').evaluate(e=>({opacity:Number(e.style.opacity),transform:e.firstElementChild.style.transform}));
  await scroll(about-h*.7);const middle=await aperture();assert(middle.opacity>0,'Aperture forms');
  await scroll(about-h*.35);assert.notEqual((await aperture()).transform,middle.transform);
  await scroll(about-h*.7);assert.equal((await aperture()).transform,middle.transform,'Aperture reverses without drift');
  await scroll(about-100);assert.equal(await page.locator('#platform-introduction .bridge-grid').evaluate(e=>getComputedStyle(e).opacity),'1');
  assert.equal((await aperture()).opacity,0);
  assert.equal(await page.locator('.scroll-streak,.scroll-star').count(),0,'No celestial graphics');
  assert.equal(await page.locator('.energy-field').count(),6);
  assert(await page.locator('.energy-field').evaluateAll(es=>es.every(e=>getComputedStyle(e).pointerEvents==='none'&&getComputedStyle(e).zIndex==='1')));
  await scroll(about+50);await page.waitForTimeout(1700);
  assert(await page.locator('.energy-trace').evaluateAll(es=>es.every(e=>Number(getComputedStyle(e).opacity)===0)),'Finite traces expire');
  for(const section of await page.locator('body>section').all()){
   const y=await section.evaluate(e=>e.offsetTop);await scroll(y-100);assert(!await overflow(),'No section overflow');
   const content=section.locator(':scope>.container,:scope>.about-inner');
   if(await content.count())await page.waitForFunction(e=>Number(getComputedStyle(e).opacity)>.95,await content.first().elementHandle());
  }
  for(const id of ['pricing','get-started']){
   await scroll(await pos('#'+id)-h*.95);
   assert(await page.locator('#'+id+'>.container').evaluate(e=>getComputedStyle(e).opacity==='1'&&getComputedStyle(e).transform==='none'),'Conversion never waits for motion');
  }
  await page.locator('.faq-q').first().click();assert(await page.locator('.faq-item').first().evaluate(e=>e.classList.contains('open')));
  await scroll(0);await page.locator('.hero-btns a[href="#how-it-works"]').click();
  await page.waitForFunction(()=>{const t=document.querySelector('#how-it-works').getBoundingClientRect().top;return t>=55&&t<160});
  await page.locator('#pricing a').first().focus();assert.equal(await page.locator('#pricing>.container').evaluate(e=>getComputedStyle(e).opacity),'1','Keyboard focus exposes content');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.documentElement.classList.contains('cinematic-ready'));
  assert.equal(await page.locator('.journey-aperture,.energy-field').count(),0);
  assert.equal(await page.locator('html.cinematic-ready').count(),0);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>document.querySelector('.journey-aperture'));
  assert.equal(await page.locator('.journey-aperture').count(),1,'Rebuild without duplicates');
  await page.setViewportSize({width:width<768?1280:390,height:900});await page.waitForTimeout(150);assert(!await overflow());
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.journey-aperture').count(),1);
  await page.goto(base+'#platform-introduction',{waitUntil:'networkidle'});await page.waitForFunction(()=>getComputedStyle(document.querySelector('#platform-introduction .bridge-grid')).opacity==='1');
  assert.deepEqual(errors,[]);await page.close();console.log(`${engine} ${width}: pass`);
 }
 const staticPage=await browser.newPage({javaScriptEnabled:false});await prepare(staticPage);await staticPage.goto(base,{waitUntil:'networkidle'});
 assert(await staticPage.locator('h1,h2').evaluateAll(es=>es.length>10&&es.every(e=>getComputedStyle(e).opacity==='1')),'No-JS narrative remains visible');
 console.log(`${engine}: static fallback pass`);
 const light=await browser.newPage();await prepare(light);
 await light.addInitScript(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2});Object.defineProperty(navigator,'deviceMemory',{get:()=>2})});
 await light.goto(base,{waitUntil:'networkidle'});
 assert.equal(await light.locator('html').getAttribute('data-motion-profile'),'light');
 await light.mouse.wheel(0,400);await light.waitForTimeout(200);
 assert(await light.locator('.energy-field').evaluateAll(es=>es.every(e=>getComputedStyle(e).display==='none')),'Constrained devices do not animate energy');
 await light.close();
 const failed=await browser.newPage();await prepare(failed);
 await failed.route('**/scripts/landing-light.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+"\nwindow.CredXMotion.register(()=>({render(){throw new Error('Injected motion failure')}}));"})});
 await failed.goto(base,{waitUntil:'networkidle'});
 assert.equal(await failed.locator('html').getAttribute('data-motion-profile'),'static');
 assert.equal(await failed.locator('.journey-aperture,.energy-field').count(),0);
 assert(await failed.locator('body>section>.container').evaluateAll(es=>es.every(e=>getComputedStyle(e).opacity==='1'&&getComputedStyle(e).transform==='none')),'Runtime failure restores all content');
 await failed.close();
 console.log(`${engine}: constrained-device and runtime-error fallbacks pass`);
}finally{await browser?.close();server.kill()}
