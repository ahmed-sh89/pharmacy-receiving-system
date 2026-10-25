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
 async function load(layout,visible=layout,sheet=css){await page.setViewportSize({width:360,height:layout});await page.setContent(markup);await page.addStyleTag({content:sheet});await page.evaluate(height=>{
  localStorage.clear();Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (Linux; Android 11) Chrome/110',configurable:true});Object.defineProperty(navigator,'maxTouchPoints',{value:1,configurable:true});Object.defineProperty(window.screen,'width',{value:360,configurable:true});Object.defineProperty(window.screen,'height',{value:800,configurable:true});
  window.__viewportListeners={};Object.defineProperty(window,'visualViewport',{value:{height,offsetTop:0,addEventListener:(t,f)=>window.__viewportListeners[t]=f},configurable:true});
  // Only boundary services are stubbed. Canonical DOM creation/mode selection runs.
  window.AppState={workspace:{},session:{}};window.AuthState={context:{pharmacy_id:'SYNTHETIC'}};window.authRpc=async()=>({rows:[],assigned_orders:getSelectedReceivingOrderNumbers(),indeterminate_count:0});window.pullCloudWorkspaceTransactions=async()=>true;window.getItemByCode=()=>null;window.AppEvents={emit(){}};window.createEmptySession=()=>({});window.ensureDeviceId=()=> 'offline';window.nowISO=()=> '2026-10-11T00:00:00Z';window.refreshUnifiedHandheldWorkspace=()=>{};window.setTimeout=()=>0;
  for(const name of ['openHandheldScansPanel','openHandheldAssignedOrdersPanel','refreshHandheldWorkspaceStatus','refreshHandheldReceivingTools','refreshZebraInterface','focusScannerInput'])window[name]=()=>{};
 },visible);await page.addScriptTag({content:bootstrap+'\n'+owners+'\n'+viewport});
 await page.evaluate(()=>{document.body.classList.remove('authBooting');document.body.classList.add('authLocked');document.querySelector('#authBootPanel').hidden=true;});
 assert.ok(await page.evaluate(()=>document.body.classList.contains('zebraDevice')),'real inline bootstrap must select Handheld');}
 const {execFileSync}=require('node:child_process'),crypto=require('node:crypto');
 const baseline='847dbaf782959b9c010cb321d1dc7167037783d3';
 const oldCSS=[...html.matchAll(/href="(css\/[^"?]+)/g)].map(m=>execFileSync('git',['show',baseline+':'+m[1]],{encoding:'utf8'})).join('\n');
 async function show(mode,height,sheet){
  await load(height,height,sheet);await page.evaluate(mode=>{
   document.getElementById('authGate').classList.remove('visible');document.body.classList.remove('authLocked');initializeZebraInterface();window.UI={elements:{lastScanCard:document.getElementById('lastScanCard')}};createProfessionalLastScanLayout();createLastScanQuantityControls();
   if(mode==='receiving'){setZebraReceivingMode();document.getElementById('page-dashboard').classList.add('active');}
   else setZebraExpiryMode();
  },mode);
 }
 async function operationalGeometry(mode){return page.evaluate(mode=>{
  const ids=mode==='receiving'?['btnHandheldAssignedOrders','handheldWorkspaceStatus','barcodeInput','lastScanCard','btnLastScanPlus','btnLastScanMinus','btnLastScanEdit']:['expiryScanStatus','expiryWorkerSelect','btnClearExpiryActive','expiryBarcodeInput','expiryMonth','expiryYear','expiryQuantity','expiryBatchInput','btnSaveExpiryCapture'];
  return Object.fromEntries(ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect(),s=getComputedStyle(e);return [id,{x:r.x,y:r.y,width:r.width,height:r.height,color:s.color,background:s.backgroundColor}];}));
 },mode);}
 for(const height of [480,520,640])for(const mode of ['receiving','expiry']){
  await show(mode,height,oldCSS);const original=await operationalGeometry(mode);
  await show(mode,height,css);assert.deepEqual(await operationalGeometry(mode),original,mode+' operational control geometry/colors unchanged at '+height);
  const info=await page.evaluate(mode=>{
   const header=document.querySelector(mode==='receiving'?'.hhReceivingTitleRow':'.expiryHandheldHeader');
   const fields=[...header.children].slice(0,3).map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();const content=document.createRange();content.selectNodeContents(el);const t=content.getBoundingClientRect();return {tag:el.tagName,bg:s.backgroundColor,color:s.color,border:s.borderTopColor,borderWidth:s.borderTopWidth,radius:s.borderTopLeftRadius,height:r.height,width:r.width,x:r.x,right:r.right,font:s.fontSize,clipped:t.width>r.width-2};});
   return {fields,rootOverflow:document.documentElement.scrollHeight>document.documentElement.clientHeight+1,horizontal:document.documentElement.scrollWidth>innerWidth,background:getComputedStyle(document.body).backgroundColor};
  },mode);
  assert.equal(info.fields.length,3);assert.ok(info.fields.every(f=>f.height===38&&f.border==='rgb(184, 207, 231)'&&f.borderWidth==='1px'&&f.radius==='8px'&&f.color==='rgb(36, 91, 156)'&&!f.clipped),JSON.stringify(info));
  assert.equal(info.fields[0].width,80);assert.equal(info.fields[2].width,80);assert.ok(info.fields[0].right<info.fields[1].x&&info.fields[1].right<info.fields[2].x);
  assert.equal(info.fields[0].bg,'rgb(255, 255, 255)');assert.equal(info.fields[2].bg,'rgb(255, 255, 255)');assert.equal(info.fields[1].bg,mode==='receiving'?'rgb(217, 233, 250)':'rgb(221, 216, 242)');assert.equal(info.fields[1].tag,mode==='receiving'?'STRONG':'DIV');
  assert.equal(info.rootOverflow,false);assert.equal(info.horizontal,false);if(mode==='receiving')assert.equal(info.background,'rgb(229, 240, 252)');
  if(height===640)await page.screenshot({path:'/tmp/pharmflow-header-fields-'+mode+'.png'});
  console.log('PASS '+mode+' '+height+': three fields, palette, no clipping/overflow; operational positions/colors identical');
 }
 for(const mode of ['receiving','expiry']){
  async function desktop(sheet){await page.setViewportSize({width:1440,height:900});await page.setContent(markup);await page.addStyleTag({content:sheet+'\n*{animation:none!important;transition:none!important;caret-color:transparent!important}'});await page.evaluate(mode=>{document.body.className='pfNextMode pfnCleanReceiving';document.getElementById('authGate')?.remove();document.getElementById('authBootPanel')?.remove();document.getElementById(mode==='receiving'?'page-dashboard':'zebraExpiryShell').classList.add('active');},mode);return crypto.createHash('sha256').update(await page.screenshot()).digest('hex');}
  assert.equal(await desktop(css),await desktop(oldCSS));console.log('PASS Desktop '+mode+': exact baseline pixels');
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
