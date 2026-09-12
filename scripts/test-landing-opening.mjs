import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LANDING_BASE_URL||'http://localhost:8795';
let server,browser;
try{
 if(!process.env.LANDING_BASE_URL){
  server=spawn(process.execPath,[fileURLToPath(new URL('../apps/web/server.mjs',import.meta.url))],{env:{...process.env,PORT:'8795'},stdio:'ignore'});
  for(let i=0;i<100;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 }
 browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(base,{waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('.brand-intro').count(),1,'New visit has logo opening');
 await page.waitForTimeout(500);
 await page.screenshot({path:'/tmp/credx-video-review/logo-opening.png'});
 await page.waitForFunction(()=>!document.querySelector('.brand-intro'));
 assert(await page.locator('.hero-btns a').first().isVisible());
 await page.reload({waitUntil:'load'});
 assert.equal(await page.locator('.brand-intro').count(),0,'Refresh skips opening');
 await page.goto(base+'/#about',{waitUntil:'networkidle'});
 assert.equal(await page.locator('.brand-intro').count(),0,'Deep link skips intro');
 assert.equal(await page.locator('.about-inner').evaluate(e=>getComputedStyle(e).opacity),'1','Direct About link reveals content');
 await page.goto(base,{waitUntil:'load'});
 await page.keyboard.press('Tab');
 assert.equal(await page.locator('.brand-intro').count(),0,'Keyboard dismisses opening');
 await page.locator('a[href="#about"]').last().click();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.about-inner')).opacity==='1');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(base,{waitUntil:'load'});
 assert.equal(await page.locator('.brand-intro').count(),0,'Reduced motion skips opening');
 assert.equal(await page.locator('.about-inner').evaluate(e=>getComputedStyle(e).opacity),'1');
 console.log('PASS intro, automatic removal, keyboard dismissal, refresh, direct About link, About navigation, reduced motion');
}finally{await browser?.close();server?.kill()}
