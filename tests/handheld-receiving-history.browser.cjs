// Offline fixtures only. No application bootstrap or backend requests.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const ui=fs.readFileSync('ui.js','utf8'),index=fs.readFileSync('index.html','utf8');
const styles=[...index.matchAll(/href="(css\/[^"?]+\.css)(?:\?[^"]*)?"/g)].map(m=>fs.readFileSync(m[1],'utf8')).join('\n');
const owner=name=>{const start=ui.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert.ok(start>=0,name);const end=ui.slice(start+1).search(/^(?:async )?function /m);return ui.slice(start,end<0?undefined:start+1+end);};
const names=['getHandheldDeviceReceivingRows','getHandheldDeviceScannerRows','getHandheldTotalScans','refreshHandheldWorkspaceStatus','ensureHandheldReceivingTools','refreshHandheldReceivingTools','bindHandheldReceivingDialog','openHandheldAssignedOrdersPanel','getHandheldReceivingHistoryRows','canUndoHandheldHistoryAction','openHandheldScansPanel'];
let browser,page;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.TC26_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});page=await browser.newPage();await page.route('**/*',r=>r.abort());});
after(async()=>browser?.close());
async function fixture(){
 await page.setViewportSize({width:360,height:520});await page.setContent('<body class="zebraDevice zebraReceivingActive"><main id="page-dashboard"></main><input id="barcodeInput" inputmode="none"></body>');await page.addStyleTag({content:styles});
 await page.evaluate(()=>{
  window.AuthState={context:{pharmacy_id:'A'}};window.AppState={workspace:{receivingHistory:[]}};window.assigned=['PO-A'];window.active=['PO-A','PO-B'];window.APP_CONFIG={transactionSources:{scanner:'SCANNER'}};
  window.isLikelyZebraDevice=()=>true;window.ensureDeviceId=()=> 'TC26';window.getSelectedReceivingOrderNumbers=()=>assigned;window.getActiveReceivingOrderNumbers=()=>active;
  window.getItemByCode=code=>({itemCode:code});window.getOrderLifecycleRecord=async()=>({status:'uploaded'});window.PharmFlowPermissions={allowed:()=>true};window.setZebraHomeMode=()=>document.body.dataset.back='yes';
  window.reviews=[];window.nrV3ListHistory=async()=>reviews;window.hhRepairScannerFocus=()=>document.getElementById('barcodeInput').focus();window.hhRefreshReadyState=()=>{};
  window.pharmFlowConfirm=async()=>true;window.undos=[];window.undoRecentScannerTransaction=id=>undos.push(id);
  window.openNeedsReviewPanel=async(_,options)=>{window.reviewOpened=options;const el=document.createElement('div');el.id='needsReviewOverlay';document.body.append(el);};
 });
 await page.addScriptTag({content:names.map(owner).join('\n')});await page.evaluate(()=>ensureHandheldReceivingTools());
}
test('header, Back, live status and zero/one/multiple computer-controlled assignments',async()=>{
 await fixture();assert.match(await page.locator('.hhReceivingTitleRow').innerText(),/Back[\s\S]*Receiving[\s\S]*History/);assert.equal(await page.locator('#btnHandheldNeedsReview').count(),0);
 for(const count of [0,1,30]){
  await page.evaluate(count=>{assigned=Array.from({length:count},(_,i)=>'PO-'+i);refreshHandheldWorkspaceStatus();},count);
  assert.equal(await page.locator('#handheldAssignedOrdersCount').innerText(),count===1?'1 order':`${count} orders`);
  await page.locator('#btnHandheldAssignedOrders').click();assert.equal(await page.locator('.hhReceivingAssignedOrder').count(),count);assert.equal(await page.locator('.hhReceivingOrderList input,.hhReceivingOrderList button').count(),0);
  if(count===30)assert.ok(await page.locator('.hhReceivingOrderList').evaluate(e=>e.scrollHeight>e.clientHeight));
  await page.keyboard.press('Escape');assert.equal(await page.locator('#handheldAssignedOrdersOverlay').count(),0);
 }
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{value:false,configurable:true});refreshHandheldWorkspaceStatus();});assert.equal(await page.locator('#handheldWorkspaceStatus').innerText(),'OFFLINE');
 await page.locator('#btnZebraModes').click();assert.equal(await page.locator('body').getAttribute('data-back'),'yes');assert.ok(await page.locator('#zebraQuickHeader').evaluate(e=>e.getBoundingClientRect().height<100));
});
test('mixed latest ten, exact chronology, device isolation, expansion and internal scroll',async()=>{
 await fixture();await page.evaluate(()=>{
  AppState.workspace.receivingHistory=Array.from({length:14},(_,i)=>({transactionId:'tx-'+i,itemName:'Recognized medicine '+i,itemCode:'CODE'+i,deviceId:'TC26',quantity:1,dateTime:new Date(Date.UTC(2026,9,25,10,i)).toISOString(),source:'SCANNER',orderNumber:'PO-A'}));
  reviews=[{review_id:'review-1',device_id:'TC26',gtin:'UNKNOWN',pending_quantity:3,created_at:'2026-10-25T10:12:30Z',status:'PENDING'},{review_id:'foreign',device_id:'OTHER',gtin:'FOREIGN',created_at:'2026-10-25T12:00:00Z'}];
 });
 await page.evaluate(()=>openHandheldScansPanel());assert.equal(await page.locator('.hhReceivingHistoryRow').count(),10);
 const text=await page.locator('.hhReceivingHistoryList').innerText();assert.ok(text.indexOf('medicine 13')<text.indexOf('Unknown Barcode'));assert.ok(text.indexOf('Unknown Barcode')<text.indexOf('medicine 12'));assert.ok(!text.includes('FOREIGN'));
 assert.equal(await page.locator('.hhReceivingHistoryStatus.review').count(),1);await page.locator('summary').first().click();assert.equal(await page.locator('.hhReceivingHistoryRow').first().getAttribute('open'),'');
 assert.ok(await page.locator('.hhReceivingHistoryList').evaluate(e=>e.scrollHeight>e.clientHeight&&getComputedStyle(e).overflowY==='auto'));assert.ok(await page.locator('.hhReceivingHistoryPanel').evaluate(e=>e.scrollWidth<=e.clientWidth));
 await page.screenshot({path:'/tmp/pharmflow-receiving-history.png'});await page.getByRole('button',{name:'Done',exact:true}).click();await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>document.activeElement.id),'barcodeInput');
});
test('Undo eligibility and post-confirmation recheck preserve safe allocation',async()=>{
 await fixture();await page.evaluate(()=>{AppState.workspace.receivingHistory=[{transactionId:'tx',deviceId:'TC26',source:'SCANNER',itemCode:'C',quantity:1,orderNumber:'PO-A',dateTime:'2026-10-25T10:00:00Z'}];});
 await page.evaluate(()=>openHandheldScansPanel());await page.locator('summary').click();await page.getByRole('button',{name:'Undo last scan'}).click();assert.deepEqual(await page.evaluate(()=>undos),['tx']);await page.evaluate(()=>getOrderLifecycleRecord=async()=>({status:'received'}));await page.locator('summary').click();await page.getByRole('button',{name:'Undo last scan'}).click();assert.deepEqual(await page.evaluate(()=>undos),['tx']);assert.match(await page.locator('[role=status]').innerText(),/view only/);await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.evaluate(()=>{assigned=['PO-A','PO-B'];});await page.evaluate(()=>openHandheldScansPanel());assert.equal(await page.getByRole('button',{name:'Undo last scan'}).count(),0);await page.keyboard.press('Escape');
 await page.evaluate(()=>{assigned=['PO-A'];pharmFlowConfirm=async()=>{assigned=[];return true;};});await page.evaluate(()=>openHandheldScansPanel());await page.locator('summary').click();await page.getByRole('button',{name:'Undo last scan'}).click();assert.deepEqual(await page.evaluate(()=>undos),['tx']);
});
test('focused existing review workflow and return to same History',async()=>{
 await fixture();await page.evaluate(()=>{reviews=[{review_id:'one',device_id:'TC26',gtin:'123',pending_quantity:2,created_at:'2026-10-25T10:00:00Z',status:'PENDING'}];});await page.evaluate(()=>openHandheldScansPanel());await page.locator('summary').click();await page.getByRole('button',{name:'Review details'}).click();assert.equal(await page.locator('#handheldScansOverlay').isVisible(),false);assert.equal(await page.evaluate(()=>reviewOpened.reviewId),'one');await page.evaluate(()=>document.getElementById('needsReviewOverlay').remove());assert.equal(await page.locator('#handheldScansOverlay').isVisible(),true);
});
test('read errors, close during load and account switch fail safely',async()=>{
 await fixture();await page.evaluate(()=>{nrV3ListHistory=async()=>{throw Error('offline');};});await page.evaluate(()=>openHandheldScansPanel());assert.match(await page.locator('[role=status]').innerText(),/could not be loaded/);await page.keyboard.press('Escape');
 await page.evaluate(()=>{nrV3ListHistory=()=>new Promise(resolve=>window.resolveRead=resolve);void openHandheldScansPanel();});await page.keyboard.press('Escape');await page.evaluate(()=>resolveRead([]));assert.equal(await page.locator('#handheldScansOverlay').count(),0);
 await page.evaluate(()=>{nrV3ListHistory=async()=>[];});await page.evaluate(()=>openHandheldScansPanel());await page.evaluate(()=>{AuthState.context.pharmacy_id='B';window.dispatchEvent(new Event('auth:context-ready'));});assert.equal(await page.locator('#handheldScansOverlay').count(),0);
});
test('keyboard trap, X/backdrop dismissal and workspace Sign Out retained',async()=>{
 await fixture();await page.evaluate(()=>openHandheldScansPanel());await page.getByRole('button',{name:'Done',exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Close History');await page.getByRole('button',{name:'Close History',exact:true}).click();assert.equal(await page.locator('#handheldScansOverlay').count(),0);
 await page.evaluate(()=>openHandheldScansPanel());await page.locator('#handheldScansOverlay').click({position:{x:1,y:1}});assert.equal(await page.locator('#handheldScansOverlay').count(),0);assert.ok(!ui.includes('id="btnZebraAccount"'));assert.ok(ui.includes('id="btnZebraSignOut"'));
});
test('scanner focus owner pauses for History and Orders without changing input mode',async()=>{
 await fixture();const runtime=fs.readFileSync('js/handheld-runtime.js','utf8');const start=runtime.indexOf('function hhWorkerIsEditing('),end=runtime.indexOf('\nfunction ',start+1);await page.addScriptTag({content:runtime.slice(start,end)});
 await page.evaluate(()=>openHandheldAssignedOrdersPanel());assert.equal(await page.evaluate(()=>hhWorkerIsEditing()),true);await page.keyboard.press('Escape');await page.evaluate(()=>openHandheldScansPanel());assert.equal(await page.evaluate(()=>hhWorkerIsEditing()),true);await page.getByRole('button',{name:'Done',exact:true}).click();await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>hhWorkerIsEditing()),false);assert.equal(await page.locator('#barcodeInput').getAttribute('inputmode'),'none');
});
test('Desktop and Handheld Expiry render identically to approved baseline',{skip:!process.env.PHARMFLOW_BASELINE_DIR},async()=>{
 await page.close();page=await browser.newPage();await page.route("**/*",r=>r.abort());
 const root=process.env.PHARMFLOW_BASELINE_DIR;
 async function shot(dir,handheld){
  const html=fs.readFileSync(dir+'/index.html','utf8');const css=[...html.matchAll(/href="(css\/[^"?]+\.css)(?:\?[^"]*)?"/g)].map(m=>fs.readFileSync(dir+'/'+m[1],'utf8')).join('\n');
  await page.setViewportSize({width:handheld?360:1440,height:handheld?640:900});await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));await page.addStyleTag({content:css});
  await page.evaluate(handheld=>{document.body.className=handheld?'pfNextMode zebraDevice zebraExpiryActive':'pfNextMode pfnCleanReceiving';document.getElementById('authGate')?.remove();document.getElementById('authBootPanel')?.remove();document.getElementById('zebraExpiryShell')?.classList.toggle('active',handheld);document.getElementById('page-dashboard')?.classList.toggle('active',!handheld);},handheld);
  await page.addStyleTag({content:"*{animation:none!important;transition:none!important;caret-color:transparent!important}"});return require("node:crypto").createHash("sha256").update(await page.screenshot({path:"/tmp/pf-"+(dir==="."?"candidate":"baseline")+(handheld?"-expiry":"-desktop")+".png"})).digest("hex");
 }
 for(const handheld of [false,true])assert.deepEqual(await shot('.',handheld),await shot(root,handheld),handheld?'Expiry pixels unchanged':'Desktop pixels unchanged');
});
