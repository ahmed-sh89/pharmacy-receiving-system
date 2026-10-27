// Isolated real Chromium, production runtime functions and a shared local RPC fixture.
// No Supabase/account access: cross-session assertions prove the client contract only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function fn(source,name){const at=source.indexOf(`function ${name}(`);assert(at>=0,name);const start=source.slice(at-6,at)==='async '?at-6:at;return source.slice(start,source.indexOf('\n}',at)+2);}
const cloud=read('cloud-workspace.js'),ui=read('ui.js');
const functions=['cloudWorkspacePharmacyId','activeOrderAuthorityScope','getCloudWorkspaceGeneration','serializeActiveOrderManifest','applyActiveOrderManifest','applyAuthoritativeEmptyActiveOrders','pullActiveOrderManifest','pullActiveOrderManifestAuthority','prepareActiveOrderManifestWrite','saveActiveOrderManifest','setHandheldAssignedOrderNumbers'].map(n=>fn(cloud,n)).join('\n');
const cloudState=cloud.slice(cloud.indexOf('const PharmFlowCloudWorkspace ='),cloud.indexOf('\nfunction cloudWorkspacePharmacyId'));
const fixture={orderFiles:[{documentId:'FIXTURE-12',name:'fixture-12.xlsx',rows:2},{documentId:'FIXTURE-62',name:'fixture-62.xlsx',rows:2}],orderData:[{itemCode:'A',orderedQty:12},{itemCode:'B',orderedQty:62}],handheldScopeConfigured:true,handheldOrderNumbers:['FIXTURE-12']};
let manifest=structuredClone(fixture),revision=1,reads=0,writes=0,held=[],hold=false,failSave=false,failRead=false,partialSave=false,holdSave=false,saveHeld=[],failNextSave=0;
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/pharmflow-next.css"><link rel="stylesheet" href="/css/mobile-phone.css"><button id="pfnManageOrders">Manage Orders</button><main><section id="page-files"><div class="twoColumnLayout"><div id="orderFilesList"></div></div></section></main>
<script src="/js/config.js"></script><script src="/js/utils.js"></script><script src="/js/state.js"></script><script>
window.AuthState={identityEpoch:1,user:{id:'fixture-user'},session:{access_token:'fixture'},context:{pharmacy_id:'isolated-fixture',member_role:'admin'}};
window.permissionRow={pharmacy_id:'isolated-fixture',receiving:'FULL',expiry:'FULL',data_access:'PHARMACY_ONLY'};
window.authRpc=async(name,args)=>{window.PharmFlowPermissions?.checkRpc(name,args);if(name==='get_my_pharmflow_permissions_v1')return permissionRow;const r=await fetch('/rpc',{method:'POST',body:JSON.stringify({name,args})});const v=await r.json();if(!r.ok)throw Error(v.error);return v;};
window.AppRouter={currentRoute:'receiving'};window.navigateTo=()=>{};
window.toasts=[];window.showToast=(message,type)=>toasts.push({message,type});
window.saveWorkspaceSnapshot=window.deleteWorkspaceSnapshot=window.recalculateStatistics=window.resetStatistics=window.focusScannerInput=()=>{};
window.normalizeOrderNumber=v=>String(v||'').toUpperCase();window.getActiveReceivingOrderNumbers=()=>AppState.workspace.orderFiles.map(f=>f.documentId);
window.setCloudWorkspaceStatus=()=>{};window.UI={elements:{orderFilesList:document.getElementById('orderFilesList')}};
window.refreshEntireUI=()=>refreshFileLists();
${cloudState}\n${functions}
${fn(ui,'renderFileList')}\n${fn(ui,'refreshFileLists')}
</script><script src="/js/permissions.js"></script><script>PharmFlowPermissions.load();</script><script src="/js/pharmflow-next.js"></script>`;
const server=http.createServer((req,res)=>{
 if(req.url==='/fixture'){res.setHeader('Content-Type','text/html');return res.end(html);}
 if(req.url==='/rpc'){
  let text='';req.on('data',d=>text+=d);req.on('end',()=>{const {name,args}=JSON.parse(text);const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
   if(args.p_pharmacy_id!=='isolated-fixture')return send({error:'forbidden'},403);
   if(name==='get_pharmflow_workspace_generation')return send(0);
   if(name==='get_pharmflow_active_order_manifest_v3'){reads++;if(failRead)return send({error:'fixture read failure'},503);const row={manifest:structuredClone(manifest),revision,order_files:manifest?.orderFiles.length||0,order_items:manifest?.orderData.length||0};if(hold)held.push(()=>send([row]));else send([row]);return;}
   if(name==='save_pharmflow_active_order_manifest_v4'){writes++;if(failNextSave>0){failNextSave--;return send({error:'fixture first save failure'},500);}if(failSave)return send({error:'fixture save failure'},500);if(args.p_expected_revision!==revision)return send({error:'STALE_ACTIVE_ORDER_MANIFEST_REVISION'},409);manifest=structuredClone(args.p_manifest);if(partialSave)manifest.handheldOrderNumbers=manifest.handheldOrderNumbers.slice(0,1);revision++;const reply=()=>send([{revision,order_files:manifest.orderFiles.length,order_items:manifest.orderData.length}]);if(holdSave)saveHeld.push(reply);else reply();return;}
   send({error:'unexpected RPC '+name},400);
  });return;
 }
 const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':'text/css');res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.TC26_CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu']});
 try{
  const errors=[];const context=await browser.newContext({viewport:{width:1366,height:768}});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  async function page(){const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/fixture');await p.waitForFunction(()=>PharmFlowPermissions.state()==='ready');return p;}
  async function watch(p,order){await p.evaluate(order=>{
   const row=[...document.querySelectorAll('[data-assignment-order]')].find(r=>r.dataset.assignmentOrder===order),input=row.querySelector('input');
   window.stability={row,input,checked:input.checked,bg:getComputedStyle(row).backgroundColor,samples:[],active:true};
   const w=window.stability;const sample=()=>{if(!w.active)return;const live=[...document.querySelectorAll('[data-assignment-order]')].find(r=>r.dataset.assignmentOrder===order);w.samples.push({same:live===w.row,checked:input.checked,bg:getComputedStyle(row).backgroundColor,disabled:input.disabled,state:row.dataset.assignmentState});};
   window.assignmentObserver?.disconnect();window.assignmentObserver=new MutationObserver(sample);assignmentObserver.observe(document.querySelector('.pfnHandheldAssignment'),{subtree:true,attributes:true,childList:true,characterData:true});
   function frame(){sample();if(w.active)requestAnimationFrame(frame);}requestAnimationFrame(frame);sample();
  },order);}
  async function stable(p){const w=await p.evaluate(()=>{stability.active=false;assignmentObserver.disconnect();return {checked:stability.checked,bg:stability.bg,samples:stability.samples};});assert(w.samples.length>0);for(const s of w.samples){assert(s.same,'untouched row was replaced');assert.equal(s.checked,w.checked,'untouched checkbox flickered');assert.equal(s.bg,w.bg,'untouched selected color flickered');assert.equal(s.disabled,false,'untouched row was disabled');assert.notEqual(s.state,'saving','untouched row showed Saving');}}
  const p=await page();hold=true;await p.click('#pfnManageOrders');await p.waitForFunction(()=>document.querySelector('#orderFilesList').textContent.includes('Loading Active Orders'));
  assert.equal(await p.locator('.emptyState').count(),0);await p.evaluate(()=>refreshFileLists());assert.match(await p.locator('#orderFilesList').innerText(),/Loading Active Orders/);
  await p.waitForFunction(()=>PharmFlowCloudWorkspace.activeManifestBusy);await new Promise(r=>setTimeout(r,50));assert.equal(reads,1);
  // Overlapping callers join the same response, rather than reporting false readiness.
  await p.evaluate(()=>{window.joined=pullActiveOrderManifest({force:true});});assert.equal(reads,1);
  hold=false;held.splice(0).forEach(f=>f());await p.waitForFunction(()=>document.querySelector('#pfnOrdersOverlay').dataset.ordersReady==='true');
  assert.equal(await p.locator('#orderFilesList .fileItem').count(),2);assert(await p.locator('input[value="FIXTURE-12"]').isChecked());assert(!(await p.locator('input[value="FIXTURE-62"]').isChecked()));assert.equal(await p.locator('[data-save-assignment],[data-remove-assignment]').count(),0);
  // Pending save stays pending without success. Rapid changes/reopen cannot create another write.
  await watch(p,'FIXTURE-12');hold=true;await p.locator('input[value="FIXTURE-62"]').check();await p.waitForFunction(()=>!!PharmFlowNext.assignmentSave);assert(!(await p.locator('input[value="FIXTURE-12"]').isDisabled()));assert.equal(await p.evaluate(()=>toasts.filter(t=>t.type==='success').length),0);
  await p.evaluate(()=>{const i=document.querySelector('input[value="FIXTURE-62"]');i.checked=false;i.dispatchEvent(new Event('change',{bubbles:true}));});
  hold=false;held.splice(0).forEach(f=>f());await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);assert.equal(writes,1);assert.deepEqual(manifest.handheldOrderNumbers,['FIXTURE-12','FIXTURE-62']);assert.equal(await p.evaluate(()=>toasts.filter(t=>t.type==='success').length),1);
  assert(await p.locator('input[value="FIXTURE-12"]').isChecked());await stable(p);
  await watch(p,'FIXTURE-62');await p.locator('input[value="FIXTURE-12"]').uncheck();await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);assert.deepEqual(manifest.handheldOrderNumbers,['FIXTURE-62']);await stable(p);
  await p.locator('input[value="FIXTURE-62"]').uncheck();await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);assert.deepEqual(manifest.handheldOrderNumbers,[]);assert.equal(manifest.handheldScopeConfigured,true);
  await p.click('[data-assign-all]');await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);assert.equal(manifest.handheldOrderNumbers.length,2);
  await watch(p,'FIXTURE-12');await p.locator('input[value="FIXTURE-62"]').uncheck();await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);await stable(p);assert.equal(await p.locator('[data-assignment-order="FIXTURE-62"] [data-order-assignment-status]').textContent(),'Not Assigned');
  // Failure of B must leave confirmed A visually unchanged at every frame/mutation.
  await watch(p,'FIXTURE-12');failSave=true;const beforeFailure=await p.evaluate(()=>toasts.filter(t=>t.type==='success').length);await p.locator('input[value="FIXTURE-62"]').check();await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);failSave=false;await stable(p);assert(!(await p.locator('input[value="FIXTURE-62"]').isChecked()));assert.equal(await p.evaluate(()=>toasts.filter(t=>t.type==='success').length),beforeFailure);
  // Select All must also cover a locally assigned row changed by another session.
  manifest.handheldOrderNumbers=[];revision++;await p.click('[data-assign-all]');await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);assert.equal(manifest.handheldOrderNumbers.length,2);
  await p.locator('input[value="FIXTURE-62"]').uncheck();await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);
  // Rapid changes to different rows queue serial writes, with per-row pending state.
  await p.locator('input[value="FIXTURE-12"]').uncheck();await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);
  holdSave=true;const beforeQueue=writes;await p.locator('input[value="FIXTURE-12"]').check();await p.waitForFunction(()=>PharmFlowNext.assignmentModel.running);await new Promise(r=>setTimeout(r,50));assert.equal(await p.locator('[data-assignment-state="saving"]').count(),1);assert(!(await p.locator('input[value="FIXTURE-62"]').isDisabled()));
  await p.locator('input[value="FIXTURE-62"]').check();assert.equal(await p.locator('[data-assignment-state="saving"]').count(),2);assert.equal(writes,beforeQueue+1,'full Manifest writes overlapped');
  holdSave=false;saveHeld.splice(0).forEach(f=>f());await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);assert.equal(writes,beforeQueue+2);assert.equal(manifest.handheldOrderNumbers.length,2);assert.equal(await p.locator('[data-assignment-state="assigned"]').count(),2);
  // A failed first request must not roll back a separately queued order.
  for(const order of ['FIXTURE-12','FIXTURE-62']){await p.locator(`input[value="${order}"]`).uncheck();await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);}
  hold=true;failNextSave=1;await p.locator('input[value="FIXTURE-12"]').check();await p.locator('input[value="FIXTURE-62"]').check();const beforeMixed=await p.evaluate(()=>toasts.filter(t=>t.type==='success').length);hold=false;held.splice(0).forEach(f=>f());await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);assert.deepEqual(manifest.handheldOrderNumbers,['FIXTURE-62']);assert(!(await p.locator('input[value="FIXTURE-12"]').isChecked()));assert(await p.locator('input[value="FIXTURE-62"]').isChecked());assert.equal(await p.evaluate(()=>toasts.filter(t=>t.type==='success').length),beforeMixed+1);
  // Bulk readback mismatch/partial persistence cannot produce a success toast.
  for(const order of ['FIXTURE-12','FIXTURE-62']){await p.locator(`input[value="${order}"]`).uncheck();await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);}
  const bulkSuccesses=await p.evaluate(()=>toasts.filter(t=>t.type==='success').length);partialSave=true;await p.click('[data-assign-all]');await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);partialSave=false;assert.equal(await p.evaluate(()=>toasts.filter(t=>t.type==='success').length),bulkSuccesses);assert.equal(await p.locator('input:checked').count(),1);assert.equal(await p.locator('[data-assignment-state="assigned"]').count(),1);assert.equal(await p.locator('[data-assignment-state="unassigned"]').count(),1);
  await p.click('[data-assign-all]');await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);assert.equal(manifest.handheldOrderNumbers.length,2);
  // A separately loaded page restores only persisted authority (not local UI state).
  const second=await page();await second.click('#pfnManageOrders');await second.waitForFunction(()=>document.querySelector('#pfnOrdersOverlay').dataset.ordersReady==='true');assert.equal(await second.locator('input:checked').count(),2);
  // Same order structure, assignment-only authority refresh must update existing inputs.
  await p.locator('input[value="FIXTURE-12"]').uncheck();await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);await second.evaluate(()=>pullActiveOrderManifestAuthority({clearIfMissing:true}));assert(!(await second.locator('input[value="FIXTURE-12"]').isChecked()));
  const successes=await p.evaluate(()=>toasts.filter(t=>t.type==='success').length);failSave=true;await p.locator('input[value="FIXTURE-12"]').check();await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);failSave=false;assert(!(await p.locator('input[value="FIXTURE-12"]').isChecked()));assert.equal(await p.evaluate(()=>toasts.filter(t=>t.type==='success').length),successes);assert(await p.evaluate(()=>toasts.some(t=>t.type==='error')));
  // Refresh reloads the two fixture orders and confirmed assignment from server.
  await p.reload();await p.waitForFunction(()=>PharmFlowPermissions.state()==='ready');await p.click('#pfnManageOrders');await p.waitForFunction(()=>document.querySelector('#pfnOrdersOverlay').dataset.ordersReady==='true');assert.equal(await p.locator('.fileItem').count(),2);assert(!(await p.locator('input[value="FIXTURE-12"]').isChecked()));assert(await p.locator('input[value="FIXTURE-62"]').isChecked());
  // Scope changes while reading cannot apply another session's response.
  hold=true;await p.evaluate(()=>{window.oldPull=pullActiveOrderManifest({force:true});});await new Promise(r=>setTimeout(r,50));await p.evaluate(()=>{AuthState.identityEpoch++;AppState.workspace=createEmptyWorkspace();});hold=false;held.splice(0).forEach(f=>f());assert.equal(await p.evaluate(()=>oldPull),false);assert.equal(await p.evaluate(()=>AppState.workspace.orderFiles.length),0);
  // Loading failures never become an authoritative empty state; explicit Retry recovers.
  const failed=await page();failRead=true;await failed.click('#pfnManageOrders');await failed.waitForSelector('[data-retry-orders]');assert.equal(await failed.locator('.emptyState').count(),0);assert.equal(await failed.locator('.pfnHandheldAssignment:visible').count(),0);failRead=false;await failed.click('[data-retry-orders]');await failed.waitForFunction(()=>document.querySelector('#pfnOrdersOverlay').dataset.ordersReady==='true');assert.equal(await failed.locator('.fileItem').count(),2);
  // Read-only operators can see restored orders but cannot assign them.
  await failed.evaluate(async()=>{permissionRow.receiving='READ_ONLY';await PharmFlowPermissions.load();});assert(await failed.locator('input[value="FIXTURE-12"]').isDisabled());
  // Compact layout: 1–4 have natural height, larger lists scroll internally, never horizontally.
  for(const count of [1,2,4,5,10,20])for(const zoom of [1,.8,.75]){
    manifest={...structuredClone(fixture),orderFiles:Array.from({length:count},(_,i)=>({documentId:'TO-'+String(i+1).padStart(9,'0'),name:'fixture-'+i+'.xlsx',rows:1})),handheldOrderNumbers:[]};revision++;
    const layout=await page();await layout.evaluate(zoom=>document.body.style.zoom=String(zoom),zoom);await layout.click('#pfnManageOrders');await layout.waitForFunction(()=>document.querySelector('#pfnOrdersOverlay').dataset.ordersReady==='true');
    const dims=await layout.locator('.pfnHandheldOrderGrid').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,client:el.clientHeight,scroll:el.scrollHeight,width:el.clientWidth,scrollWidth:el.scrollWidth,rows:[...el.children].map(r=>({w:r.clientWidth,sw:r.scrollWidth})),summary:el.previousElementSibling.textContent}));
    assert.equal(dims.columns,2);assert(dims.client<=177);assert(dims.scrollWidth<=dims.width+1);assert(dims.rows.every(r=>r.sw<=r.w+1));assert.match(dims.summary,/assigned/);
    if(count<=4)assert(dims.scroll<=dims.client+1);if(count>=10)assert(dims.scroll>dims.client);if(process.env.ASSIGNMENT_SCREENSHOT_DIR && [2,20].includes(count) && zoom===.8){fs.mkdirSync(process.env.ASSIGNMENT_SCREENSHOT_DIR,{recursive:true});await layout.locator('.pfnHandheldAssignment').screenshot({path:path.join(process.env.ASSIGNMENT_SCREENSHOT_DIR,'assignment-'+count+'.png')});}await layout.close();
  }
  // Long order identifiers wrap rather than ellipsize or overflow.
  manifest=structuredClone(fixture);manifest.orderFiles[0].documentId='TO-000529235-EXTENDED-SUPPLIER-IDENTIFIER-20261027';revision++;
  const long=await page();await long.click('#pfnManageOrders');await long.waitForFunction(()=>document.querySelector('#pfnOrdersOverlay').dataset.ordersReady==='true');const longId=await long.locator('.pfnAssignmentOrderId').first().evaluate(el=>({text:el.textContent,overflow:getComputedStyle(el).textOverflow,width:el.clientWidth,scroll:el.scrollWidth}));assert.equal(longId.text,manifest.orderFiles[0].documentId);assert.notEqual(longId.overflow,'ellipsis');assert(longId.scroll<=longId.width+1);await long.close();
  // A genuinely empty server answer may show empty only after that answer.
  manifest=null;const empty=await page();await empty.click('#pfnManageOrders');await empty.waitForFunction(()=>document.querySelector('#pfnOrdersOverlay').dataset.ordersReady==='true');assert.equal(await empty.locator('.fileItem').count(),0);assert.equal(await empty.locator('.emptyState').count(),1);
  assert.deepEqual(errors,[]);await empty.close();await failed.close();await second.close();await p.close();
  console.log('PASS Chromium: continuous untouched-row checkbox/color/DOM stability, independent pending rows, serialized rapid changes, failure and partial-bulk readback, confirmed statuses, refresh/second fixture session, loading/denial/identity guards; 18 desktop count/zoom layouts and long identifiers. Local RPC fixtures, NOT live Staging.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
