// Run against a built local preview. Campaign responses are fixtures: no live writes.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test-landing-profiles.mjs
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LANDING_BASE_URL||'http://127.0.0.1:4187';
const browser=await chromium.launch({headless:true});
try {
 for(const width of [390,1440]) {
  for(const mode of ['owner','agent','missing-photo','broken-photo','invalid','network-error']) {
   const page=await browser.newPage({viewport:{width,height:900}});
   const errors=[],failedAssets=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/')&&!r.url().includes('missing-fixture'))failedAssets.push(r.url());});
   let calls=0;
   await page.route('**/api/sub-agents/public/*',async route=>{
    calls++;
    if(mode==='network-error')return route.abort();
    if(mode==='invalid')return route.fulfill({status:404,json:{error:'Not found'}});
    return route.fulfill({json:{subAgent:{name:'Fixture Agent',referralCode:'fixture',publicBio:'Agent profile verification.',publicHeadshotUrl:mode==='missing-photo'?null:mode==='broken-photo'?'/images/missing-fixture.jpg':'/images/credx-logo-1.jpg'}}});
   });
   // Old referral storage must not select a profile on the ordinary homepage.
   await page.addInitScript(()=>localStorage.setItem('agent','stale-referral'));
   await page.goto(base+(mode==='owner'?'/':'/?agent=fixture'),{waitUntil:'networkidle'});
   await page.evaluate(()=>document.fonts.ready);
   assert.equal(calls,mode==='owner'?0:1);
   const visible=selector=>page.locator(selector).evaluate(e=>getComputedStyle(e).display!=='none');
   assert.equal(await visible('#ownerAbout'),mode==='owner',`${width} ${mode}: owner`);
   assert.equal(await visible('#agentCampaign'),['agent','missing-photo','broken-photo'].includes(mode),`${width} ${mode}: agent`);
   assert.equal(await page.locator('#agentCampaignPhoto').getAttribute('src')==='/images/cesar-profile.jpg',false);
   if(mode==='broken-photo'){
    await page.locator('#agentCampaignPhoto').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('#agentCampaignPhoto').hidden);
   }
   if(['missing-photo','broken-photo'].includes(mode))assert.equal(await visible('#agentCampaignPhoto'),false);
   assert(await visible('#aboutRunway'),'Runway must remain present');
   assert.equal(await page.locator('#chat').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(4, 9, 20)');
   if(mode==='owner'||mode==='agent') {
    const end=await page.locator('#aboutRunway').evaluate(e=>e.offsetTop+e.offsetHeight);
    // Exercise actual scroll, including the preceding chat and portal handoff.
    for(let y=0;y<=end;y+=300){
     await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);
     await page.waitForTimeout(25);
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: overflow at ${y}`);
    }
    const broken=await page.locator('img').evaluateAll(els=>els.filter(e=>getComputedStyle(e).display!=='none'&&e.src&&e.complete&&!e.naturalWidth).map(e=>e.src));
    assert.deepEqual(broken,[]);
    if(mode==='owner')assert.equal(await page.locator('#ownerAbout > img').evaluate(e=>Math.round(e.getBoundingClientRect().width)),width<768?200:280);
    const top=await page.locator('#aboutRunway').evaluate(e=>e.offsetTop);
    for(const [name,offset] of [['before',-900],['mid',0],['revealed',650]]){
     await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),top+offset);
     await page.waitForTimeout(250);
     await page.screenshot({path:`/tmp/credx-polish-${width}-${mode}-${name}.png`});
    }
   }
   assert.deepEqual(errors,[]);
   assert.deepEqual(failedAssets,[]);
   console.log(`PASS ${width}px ${mode}: route isolation, assets, JS${['owner','agent'].includes(mode)?', scroll and photo geometry':''}`);
   await page.close();
  }
 }
} finally {await browser.close();}
