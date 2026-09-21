// Local-only visual capture helper for the landing hero. Not shipped to visitors.
// PLAYWRIGHT_MODULE=... SHOT_TAG=before node scripts/shot-landing.mjs
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const tag=process.env.SHOT_TAG||'shot';
const dir=process.env.SHOT_DIR||'/home/ubuntu/credx-shots/landing';
const port=process.env.LANDING_PORT||'8791';
const base=`http://127.0.0.1:${port}`;
await mkdir(dir,{recursive:true});
let server,browser;
try{
 server=spawn(process.execPath,[fileURLToPath(new URL('../apps/web/server.mjs',import.meta.url))],{env:{...process.env,PORT:port},stdio:'ignore'});
 const deadline=Date.now()+10000;
 while(true){try{await fetch(base);break}catch{if(Date.now()>deadline)throw Error('Preview server failed');await new Promise(r=>setTimeout(r,100))}}
 browser=await pw.chromium.launch({headless:true});
 for(const width of [1440,768,390]){
  const page=await browser.newPage({viewport:{width,height:width<768?844:900}});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(200);
  const distance=await page.evaluate(()=>document.querySelector('.hero-runway').offsetHeight-document.querySelector('.hero').offsetHeight);
  for(const [name,frac] of [['a-open',0],['b-mid',.45],['c-end',.8]]){
   await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),distance*frac);
   // Nudge so the scroll-linked light is lit for the capture.
   await page.evaluate(()=>scrollBy({top:6,behavior:'instant'}));
   await page.waitForTimeout(220);
   await page.screenshot({path:`${dir}/${tag}-${width}-${name}.png`});
  }
  const sizes=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.scene-object')]
   .map(o=>[o.className.split(' ').find(c=>c.startsWith('object-')),Math.round(o.querySelector('img').getBoundingClientRect().width)])));
  console.log(`${tag} ${width}px widths@0.8`,JSON.stringify(sizes));
  await page.close();
 }
}finally{await browser?.close();server?.kill()}
