/* Offline rendered acceptance: canonical HTML/CSS only, no application/bootstrap
   scripts, authentication, RPC, Storage, or operational saves. Run with
   NODE_PATH pointing to Playwright and TC26_CHROMIUM_EXECUTABLE if needed. */
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const html=fs.readFileSync('index.html','utf8');
 const css=[...html.matchAll(/href="(css\/[^"?]+)/g)].map(m=>fs.readFileSync(m[1],'utf8')).join('\n');
 const markup=html.replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 const browser=await chromium.launch({headless:true,executablePath:process.env.TC26_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage();await page.route('**/*',r=>r.abort());
  const load=async(height)=>{await page.setViewportSize({width:360,height});await page.setContent(markup);await page.addStyleTag({content:css});};
  for(const height of [480,520,640]){
   await load(height);await page.evaluate(()=>{
    document.body.className='zebraDevice zebraExpiryActive';document.querySelector('#authGate').remove();
    const shell=document.querySelector('#zebraExpiryShell');document.querySelector('.mainContent').replaceChildren(shell);shell.classList.add('active');
    document.querySelector('#expiryDesktopStatus').hidden=false;document.querySelector('#expiryDesktopStatus').textContent='READY TO SCAN';
    document.querySelector('#expiryItemName').textContent='Synthetic Dompy item';document.querySelector('#expiryItemCode').textContent='1012686';document.querySelector('#expiryItemGTIN').textContent='00123456789012';
    document.querySelector('.expirySerialField').hidden=false;document.querySelector('#expiryQuantity').value='1';
   });
   const result=await page.evaluate(()=>{
    const main=document.querySelector('.mainContent');
    const controls=['#expiryScanStatus','#expiryBarcodeInput','#expiryWorkerSelect','#expiryMonth','#expiryYear','#expiryQuantity','#expiryBatchInput','#expirySerialInput','#btnSaveExpiryCapture'];
    return {height:innerHeight,scroll:main.scrollHeight,client:main.clientHeight,duplicateVisible:getComputedStyle(document.querySelector('#expiryDesktopStatus')).display!=='none',controls:controls.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {s,top:r.top,bottom:r.bottom,height:r.height};})};
   });
   assert.equal(result.duplicateVisible,false);assert.ok(result.scroll<=result.client+1,JSON.stringify(result));
   for(const r of result.controls)assert.ok(r.height>0&&r.top>=0&&r.bottom<=height,JSON.stringify(r));
   console.log('PASS capture 360 x '+height+'; all essential controls visible, no overflow');
   await load(height);await page.evaluate(()=>{document.body.className='zebraDevice';document.querySelector('#authBootPanel').hidden=true;document.querySelector('#authMessage').textContent='Synthetic connection error. Please retry sign in.';});
   const auth=await page.evaluate(()=>{const gate=document.querySelector('#authGate');return {scroll:gate.scrollHeight,client:gate.clientHeight,bottom:document.querySelector('#authMessage').getBoundingClientRect().bottom};});
   assert.ok(auth.scroll<=auth.client+1,JSON.stringify(auth));assert.ok(auth.bottom<=height);
   for(const id of ['authEmail','authPassword','btnAuthSignIn','btnAuthForgotPassword','btnAuthShowPublicSignup'])assert.equal(await page.locator('#'+id).isVisible(),true);
   console.log('PASS login 360 x '+height+'; fields, actions, error visible, no overflow');
  }
  await load(300);await page.evaluate(()=>{document.body.className='zebraDevice';document.querySelector('#authBootPanel').hidden=true;document.querySelector('#authMessage').textContent='Synthetic validation error. '.repeat(20);});
  await page.locator('#authEmail').focus();assert.equal(await page.locator('#authEmail').evaluate(e=>e===document.activeElement),true);
  await page.locator('#authPassword').focus();assert.equal(await page.locator('#authPassword').evaluate(e=>e===document.activeElement),true);
  await page.locator('#authMessage').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('#authMessage').evaluate(e=>{const g=document.querySelector('#authGate');return getComputedStyle(g).overflowY==='auto'&&g.scrollTop>0&&getComputedStyle(e.parentElement).overflowY==='visible';}));
  console.log('PASS short viewport/keyboard fallback: validation remains scroll-accessible');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
