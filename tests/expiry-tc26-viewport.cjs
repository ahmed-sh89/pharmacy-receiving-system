/* Offline canonical startup/render test. Network, auth, RPC and operational
   writes are disabled. Execute the real device bootstrap and UI mode owners;
   never assign post-login classes to make a fixture pass. */
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('ui.js','utf8');
 const css=[...html.matchAll(/href="(css\/[^"?]+)/g)].map(m=>fs.readFileSync(m[1],'utf8')).join('\n');
 const markup=html.replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 const bootstrap=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('var enterprise='))[1];
 function owner(name){const start=ui.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert.ok(start>=0,name);const tail=ui.slice(start+1);const end=tail.search(/^(?:async )?function /m);return ui.slice(start,end<0?undefined:start+1+end);}
 const owners=['isLikelyZebraDevice','initializeZebraInterface','setHandheldWorkerSurface','clearZebraModeClasses','setZebraHomeMode','setZebraReceivingMode','setZebraExpiryMode','ensureHandheldReceivingTools','createProfessionalLastScanLayout','createLastScanQuantityControls','bindHandheldReceivingDialog','getHandheldHistoryOrderNumbers','handheldHistoryTime','getHandheldReceivingHistoryRows','canUndoHandheldHistoryAction','openHandheldAssignedOrdersPanel','openHandheldScansPanel'].map(owner).join('\n');
 const viewport=fs.readFileSync('js/auth-viewport.js','utf8');
 const audit=process.env.TC26_AUDIT==='1';
 const browser=await chromium.launch({headless:true,executablePath:process.env.TC26_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage();await page.route('**/*',r=>r.request().url()==='https://offline.pharmflow.test/'?r.fulfill({body:'<!doctype html>'}):r.abort());await page.goto('https://offline.pharmflow.test/');
 async function load(layout,visible=layout){await page.setViewportSize({width:360,height:layout});await page.setContent(markup);await page.addStyleTag({content:css});await page.evaluate(height=>{
  localStorage.clear();Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (Linux; Android 11) Chrome/110',configurable:true});Object.defineProperty(navigator,'maxTouchPoints',{value:1,configurable:true});Object.defineProperty(window.screen,'width',{value:360,configurable:true});Object.defineProperty(window.screen,'height',{value:800,configurable:true});
  window.__viewportListeners={};Object.defineProperty(window,'visualViewport',{value:{height,offsetTop:0,addEventListener:(t,f)=>window.__viewportListeners[t]=f},configurable:true});
  // Only boundary services are stubbed. Canonical DOM creation/mode selection runs.
  window.AppState={workspace:{},session:{}};window.AuthState={context:{pharmacy_id:'SYNTHETIC'}};window.authRpc=async()=>({rows:[],assigned_orders:getSelectedReceivingOrderNumbers(),indeterminate_count:0});window.pullCloudWorkspaceTransactions=async()=>true;window.getItemByCode=()=>null;window.AppEvents={emit(){}};window.createEmptySession=()=>({});window.ensureDeviceId=()=> 'offline';window.nowISO=()=> '2026-10-11T00:00:00Z';window.refreshUnifiedHandheldWorkspace=()=>{};window.setTimeout=()=>0;
  for(const name of ['openHandheldScansPanel','openHandheldAssignedOrdersPanel','refreshHandheldWorkspaceStatus','refreshHandheldReceivingTools','refreshZebraInterface','focusScannerInput'])window[name]=()=>{};
 },visible);await page.addScriptTag({content:bootstrap+'\n'+owners+'\n'+viewport});
 await page.evaluate(()=>{document.body.classList.remove('authBooting');document.body.classList.add('authLocked');document.querySelector('#authBootPanel').hidden=true;});
 assert.ok(await page.evaluate(()=>document.body.classList.contains('zebraDevice')),'real inline bootstrap must select Handheld');}
 async function measure(label,visible,controls,container){const r=await page.evaluate(({controls,container})=>{const g=document.querySelector(container),root=document.documentElement;return {root:root.scrollHeight,rootClient:root.clientHeight,rootBox:root.getBoundingClientRect().height,body:document.body.scrollHeight,container:{height:g.clientHeight,scroll:g.scrollHeight},controls:controls.map(s=>{const e=document.querySelector(s),r=e?.getBoundingClientRect();return {s,visible:!!e&&getComputedStyle(e).display!=='none',top:r?.top,bottom:r?.bottom,height:r?.height};})};},{controls,container});
 if(audit){console.log(label,JSON.stringify(r));return;}
 assert.ok(r.root<=r.rootClient+1&&r.rootBox<=visible+1,label+' document '+JSON.stringify(r));assert.ok(r.body<=visible+1,label+' body '+JSON.stringify(r));assert.ok(r.container.scroll<=r.container.height+1,label+' content '+JSON.stringify(r));
 for(const c of r.controls)assert.ok(c.visible&&c.height>0&&c.top>=-1&&c.bottom<=visible+1,label+' '+JSON.stringify(c));console.log('PASS '+label+'; fixed document, essential controls visible');}
 for(const [layout,visible] of [[480,480],[520,520],[640,640],[640,480],[640,520]]){
 await load(layout,visible);await measure('login '+layout+'/'+visible,visible,['#authEmail','#authPassword','#btnAuthSignIn','#btnAuthForgotPassword','#btnAuthShowPublicSignup'],'#authGate');
 await page.evaluate(()=>{document.querySelector('#authGate').classList.remove('visible');document.body.classList.remove('authLocked');initializeZebraInterface();window.UI={elements:{lastScanCard:document.querySelector('#lastScanCard')}};createProfessionalLastScanLayout();createLastScanQuantityControls();});
 await measure('Choose Space '+layout+'/'+visible,visible,['#btnZebraReceivingMode','#btnZebraExpiryMode','#btnZebraSignOut'],'#zebraHome');
 await page.evaluate(()=>{setZebraReceivingMode();document.querySelector('#page-dashboard').classList.add('active');});
 await measure('Receiving/Dashboard '+layout+'/'+visible,visible,['#barcodeInput','#btnZebraModes','#btnHandheldAssignedOrders','#btnHandheldTotalScans','#lastScanCard','#btnLastScanPlus','#btnLastScanMinus','#btnLastScanEdit'],'#page-dashboard');
 await page.evaluate(()=>{setZebraExpiryMode();document.querySelector('#expiryScannerDiagnosticToggle').hidden=false;document.querySelector('#expiryScannerDiagnosticToggle').textContent='Diagnose one scan';document.querySelector('.expirySerialField').hidden=false;document.querySelector('#expiryItemName').textContent='Synthetic item';document.querySelector('#expiryItemCode').textContent='Synthetic';document.querySelector('#expiryItemGTIN').textContent='00123456789012';});
 await measure('Expiry '+layout+'/'+visible,visible,['#expiryScanStatus','#expiryBarcodeInput','#expiryScannerDiagnosticToggle','#expiryWorkerSelect','#expiryMonth','#expiryYear','#expiryQuantity','#expiryBatchInput','#expirySerialInput','#btnSaveExpiryCapture'],'.mainContent');
 assert.equal(await page.locator('#expiryDesktopStatus').isVisible(),false);
 }
 if(!audit){
 await load(640,300);await page.evaluate(()=>document.querySelector('#authMessage').textContent='Synthetic validation error. '.repeat(20));await page.locator('#authPassword').focus();await page.locator('#btnAuthSignIn').scrollIntoViewIfNeeded();await page.locator('#authMessage').scrollIntoViewIfNeeded();
 assert.ok(await page.locator('#authGate').evaluate(e=>e.scrollTop>0&&getComputedStyle(e).overflowY==='auto'));assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=document.documentElement.clientHeight+1&&document.body.getBoundingClientRect().height<=301));console.log('PASS keyboard/error scroll belongs to auth gate, not document');
 await load(520);await page.evaluate(()=>{visualViewport.height=480;window.__viewportListeners.resize();});assert.equal(await page.locator('#authGate').evaluate(e=>e.clientHeight),480);console.log('PASS browser chrome resize updates visible viewport');
 await page.addStyleTag({content:'#authLoginForm input{font-size:26px!important} #authMessage{font-size:22px!important}'});await page.evaluate(()=>document.querySelector('#authMessage').textContent='Synthetic accessible error. '.repeat(15));await page.locator('#authMessage').scrollIntoViewIfNeeded();assert.equal(await page.locator('#authMessage').isVisible(),true);console.log('PASS enlarged text/error remains reachable');
 await load(640,480);await page.evaluate(()=>{document.querySelector('#authGate').classList.remove('visible');document.body.classList.remove('authLocked');initializeZebraInterface();setZebraReceivingMode();document.querySelector('#page-dashboard').classList.add('active');window.getActiveReceivingOrderNumbers=window.getSelectedReceivingOrderNumbers=()=>Array.from({length:80},(_,i)=>'SYNTHETIC-'+i);openHandheldAssignedOrdersPanel();});
 assert.ok(await page.locator('.hhReceivingOrderList').evaluate(e=>e.scrollHeight>e.clientHeight&&['auto','scroll'].includes(getComputedStyle(e).overflowY)));
 for(const selector of ['.hhReceivingOrdersPanel header','.hhReceivingOrdersPanel footer'])assert.ok(await page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=480;}));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=document.documentElement.clientHeight+1));console.log('PASS actual long orders dialog: internal list scroll, header and DONE visible');
 await page.evaluate(()=>{document.querySelector('#handheldAssignedOrdersOverlay').remove();window.APP_CONFIG={transactionSources:{scanner:'SCANNER'}};window.getHandheldDeviceReceivingRows=window.getHandheldDeviceScannerRows=()=>Array.from({length:20},(_,i)=>({transactionId:'SYNTHETIC-'+i,orderNumber:'SYNTHETIC-0',itemName:'Synthetic item',source:'SCANNER',quantity:1,dateTime:'2026-10-11T12:00:00Z'}));return openHandheldScansPanel();});
 assert.ok(await page.locator('.hhReceivingHistoryList').evaluate(e=>e.scrollHeight>e.clientHeight&&getComputedStyle(e).overflowY==='auto'));
 await page.locator('.hhReceivingHistoryList').evaluate(e=>e.scrollTop=e.scrollHeight);
 assert.ok(await page.locator('.hhReceivingHistoryPanel footer button').evaluate(e=>e.getBoundingClientRect().bottom<=480));
 await page.evaluate(()=>window.scrollTo(0,500));assert.equal(await page.evaluate(()=>window.scrollY),0);console.log('PASS actual history: independent list scroll and fixed document');
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
