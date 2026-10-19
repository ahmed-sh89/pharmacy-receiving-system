// Real Chromium before/after fixture check. No Supabase/network traffic; routes serve local files.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const repo=path.resolve(__dirname,'..'),out=process.env.PHARMFLOW_VISUAL_OUTPUT||path.join(require('os').tmpdir(),'pharmflow-expiry-toolbar-hybrid');
fs.mkdirSync(out,{recursive:true});
const baselineFile=name=>require('child_process').execFileSync('git',['show','72da7063789e10a5572afa5bbe1449d73d5faae6:'+name],{cwd:repo,encoding:'utf8'});
process.chdir(repo);
const {chromium}=require(process.env.PHARMFLOW_PLAYWRIGHT_CORE||'playwright-core');
// Install Playwright outside the application if not already available. No live API calls.
async function fixture(baseline){
 const read=fs.readFileSync;
 fs.readFileSync=function(file,...args){const name=String(file);if(baseline&&['index.html','js/expiry-desktop-v2.js'].includes(name))return baselineFile(name);return read(file,...args);};
 let h;try{h=require(repo+'/tests/expiry-desktop-harness.cjs').harness();}finally{fs.readFileSync=read;}
 await h.refresh();await h.click('btnOpenExpiryInventory');
 h.document.body.classList.remove('authBooting');h.document.body.classList.add('expiryDesktopActive');
 h.document.querySelectorAll('.appPage').forEach(e=>e.classList.remove('active'));h.e('zebraExpiryShell').classList.add('active');
 for(const e of h.document.querySelectorAll('#authGate,#workspaceBootOverlay,.appBootOverlay'))e.remove();
 const review=h.e('btnExpiryNeedsReview');review.disabled=false;review.removeAttribute('aria-disabled');h.e('expiryNeedsReviewCount').hidden=false;h.e('expiryNeedsReviewCount').textContent='7';
 let html=h.document.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 html=html.replace(/<link\b[^>]*>/gi,tag=>{const href=tag.match(/href="([^"?]+)/)?.[1];if(!href?.endsWith('.css'))return '';const css=baseline&&href==='css/dashboard.css'?baselineFile(href):read(path.join(repo,href),'utf8');return '<style>'+css+'</style>';});
 return html;
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PHARMFLOW_CHROMIUM,args:["--no-sandbox","--no-zygote","--disable-dev-shm-usage","--disable-gpu"],headless:true});
 const result={};
 for(const baseline of [true,false]){
  const label=baseline?'before':'after',page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1});
  const html=await fixture(baseline);
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   const file=path.join(repo,url.pathname);
   if(!file.startsWith(repo+'/')||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   let body=fs.readFileSync(file);if(url.pathname==='/js/expiry-top-motion.js')body=body.toString().replace("import('gsap')","import('/node_modules/gsap/index.js')");
   return route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':'application/octet-stream'});
  });
  await page.goto('https://pharmflow-visual.test/');
  if(!baseline)await page.addScriptTag({type:'module',url:'https://pharmflow-visual.test/js/expiry-top-motion.js'});
  await page.waitForTimeout(700);
  result[label]=await page.evaluate(()=>{
   const box=q=>{const r=document.querySelector(q).getBoundingClientRect();return {top:r.top,height:r.height,bottom:r.bottom,width:r.width};};
   return {toolbar:box('#expiryCurrentHeader'),table:box('.expiryCurrentWorkspace'),kpis:box('.expiryKpiRow'),tabs:box('.expiryTopWorkspace'),values:[...document.querySelectorAll('.expiryKpiCard')].map(e=>e.textContent.trim()),counts:[...document.querySelectorAll('.expiryKpiCard')].map(e=>[e.querySelector('.expiryKpiRecords strong').textContent,e.querySelector('.expiryKpiUnits').textContent.replace(/\D/g,'')]),cards:[...document.querySelectorAll('.expiryKpiCard')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth}))};
  });
  await page.screenshot({path:path.join(out,label+'.png')});
  if(!baseline){
   const card=page.locator('.expiryKpiCard').first(),beforeHover=await card.boundingBox();
   await card.hover();await page.waitForTimeout(430);
   result.border=await card.evaluate(e=>({offset:getComputedStyle(e.querySelector('.expiryKpiOutline rect')).strokeDashoffset,color:getComputedStyle(e.querySelector('.expiryKpiRecords strong')).color,top:getComputedStyle(e).borderTopWidth,rectWidth:e.querySelector('.expiryKpiOutline rect').getBoundingClientRect().width}));
   assert.deepEqual(await card.boundingBox(),beforeHover,'Hover moved card');assert.equal(parseFloat(result.border.offset),0);assert.equal(result.border.top,'4px');assert(result.border.rectWidth>200);
   await page.mouse.move(10,10);await page.waitForTimeout(430);
   assert.equal(parseFloat(await card.evaluate(e=>getComputedStyle(e.querySelector('.expiryKpiOutline rect')).strokeDashoffset)),1);
   result.motion=await page.evaluate(async()=>{
    const root=document.getElementById('zebraExpiryShell');ExpiryTopMotion.sync(root);ExpiryTopMotion.sync(root);
    const indicator=document.querySelector('.expiryNavIndicator');
    const inventory=document.getElementById('btnOpenExpiryInventory'),scan=document.getElementById('btnExpirySessionView');
    inventory.setAttribute('aria-selected','false');scan.setAttribute('aria-selected','true');await new Promise(r=>setTimeout(r,400));
    const moved=indicator.getBoundingClientRect().left===scan.getBoundingClientRect().left;
    for(let i=0;i<12;i++){inventory.setAttribute('aria-selected',String(i%2===0));scan.setAttribute('aria-selected',String(i%2!==0));ExpiryTopMotion.sync(root);}
    await new Promise(r=>setTimeout(r,310));
    if(Math.abs(indicator.getBoundingClientRect().left-scan.getBoundingClientRect().left)>.1)throw Error('Rapid switch lost active indicator');
    const style=getComputedStyle(indicator);if(style.backgroundColor!=='rgb(229, 240, 255)'||style.borderBottomWidth!=='3px')throw Error('Hybrid surface or underline missing');

    const gsap=(await import('/node_modules/gsap/index.js')).gsap;ExpiryTopMotion.sync(root);const unchangedTweens=gsap.globalTimeline.getChildren().length;
    const n=document.querySelector('[data-kpi-number="records"]');n.textContent='9';ExpiryTopMotion.sync(root);const immediate=n.textContent;
    await new Promise(r=>setTimeout(r,400));
    ExpiryTopMotion.dispose();const cleaned=document.querySelectorAll('.expiryNavIndicator').length===0;
    ExpiryTopMotion.sync(root);await new Promise(r=>setTimeout(r,400));
    return {singleIndicator:document.querySelectorAll('.expiryNavIndicator').length===1,moved,immediate,cleaned,unchangedTweens};
   });
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForTimeout(100); // Let Chromium dispatch the media-query change event.
   result.reduced=await page.evaluate(async()=>{const gsap=(await import('/node_modules/gsap/index.js')).gsap;document.querySelector('[data-kpi-number="records"]').textContent='11';ExpiryTopMotion.sync();return {indicators:document.querySelectorAll('.expiryNavIndicator').length,value:document.querySelector('[data-kpi-number="records"]').textContent,tweens:gsap.globalTimeline.getChildren().filter(t=>t.duration()>0).length};});
   result.handheld=await page.evaluate(()=>{document.body.classList.add('zebraDevice');ExpiryTopMotion.sync();return {indicators:document.querySelectorAll('.expiryNavIndicator').length,nav:getComputedStyle(document.querySelector('.expiryTopWorkspace')).display};});
  }
  if(!baseline){
   await page.evaluate(()=>{document.body.classList.remove('zebraDevice');document.querySelector('.expiryKpiRow').hidden=true;document.getElementById('expirySessionSummary').hidden=false;});
   result.counterLayouts=[];
   for(const value of ['0','5','350','1,250','12,500']){
    const boxes=await page.evaluate(value=>{
     document.querySelectorAll('[data-session-total]').forEach(e=>e.textContent=value);
     const box=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,client:e.clientWidth,scroll:e.scrollWidth}};
     return {value,metrics:[...document.querySelectorAll('.expirySessionMetric')].map(box),nav:box(document.querySelector('.expiryWorkspaceNav')),review:box(document.getElementById('btnExpiryNeedsReview')),header:box(document.querySelector('.expiryTopWorkspace'))};
    },value);
    assert.equal(boxes.metrics[0].top,boxes.metrics[1].top);assert(boxes.metrics.every(e=>e.client>=e.scroll));assert(boxes.metrics[0].left>=boxes.nav.right);assert(boxes.metrics[1].right<=boxes.review.left);assert.equal(boxes.header.bottom-boxes.header.top,result.after.tabs.height);result.counterLayouts.push(boxes);
   }
   await page.screenshot({path:path.join(out,'after-scan-counters.png')});
  }
  await page.close();
 }
 assert.equal(result.after.toolbar.top,result.before.toolbar.top,'Toolbar moved');assert.equal(result.after.table.height,result.before.table.height,'Table viewport changed');
 assert(result.motion.singleIndicator&&result.motion.moved&&result.motion.cleaned);assert.equal(result.motion.immediate,'9');assert.equal(result.motion.unchangedTweens,0);assert.deepEqual(result.before.counts,result.after.counts);assert.equal(result.reduced.tweens,0);assert.equal(result.handheld.indicators,0);assert.equal(result.handheld.nav,'none');
 fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
