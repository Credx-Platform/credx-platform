import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.BROWSER_ENGINE||'chromium';
const port=engine==='webkit'?8802:8801;
const server=spawn(process.execPath,['apps/web/server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
let browser;
try {
 for(let i=0;i<50;i++){try{await fetch(`http://localhost:${port}`);break}catch{await new Promise(r=>setTimeout(r,100))}}
 browser=await pw[engine].launch({headless:true});
 await mkdir('/tmp/credx-platform-qa',{recursive:true});
 for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}});
 if(engine==='webkit')await page.route('**/*',async route=>{if(route.request().resourceType()!=='document')return route.continue();const response=await route.fetch();const headers=response.headers();headers['content-security-policy']=headers['content-security-policy']?.replace('upgrade-insecure-requests','')||'';await route.fulfill({response,headers})});
 for(const path of ['/signup','/product','/pricing','/masterclass','/masterclass-checkout','/portal','/start','/adminportal','/team','/financial-readiness','/privacy','/masterclass/slides/day1.html']){
 const response=await page.goto(`http://localhost:${port}${path}`);await page.waitForTimeout(500);
 assert.equal(response.status(),200,path);
 const state=await page.evaluate(()=>({themed:document.body.hasAttribute('data-cx-platform'),font:getComputedStyle(document.body).fontFamily,bg:getComputedStyle(document.body).backgroundColor,overflow:document.documentElement.scrollWidth-innerWidth,text:document.body.innerText.length}));
 // Admin and client portals keep their light soft-gray work surface, outside the dark platform theme.
 if(['/portal','/adminportal'].includes(path)){assert(!state.themed,path+' should not use the dark theme');assert.equal(state.bg,'rgb(238, 241, 246)',path+' bg')}
 else{assert(state.themed,path+' theme missing');assert(state.font.includes('IBM Plex Sans'),path+' font '+state.font)}
 assert(state.overflow<=2,path+' overflow '+state.overflow);assert(state.text>40,path+' empty');
 await page.screenshot({path:`/tmp/credx-platform-qa/${engine}-${width}-${path.replaceAll('/','_')}.png`});console.log(width,path,JSON.stringify(state));
 }
 await page.close();
 }
}finally{await browser?.close();server.kill()}
