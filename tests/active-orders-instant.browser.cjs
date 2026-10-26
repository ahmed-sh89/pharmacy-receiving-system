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
let manifest=structuredClone(fixture),revision=1,reads=0,writes=0,held=[],hold=false,failSave=false,failRead=false;
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/pharmflow-next.css"><button id="pfnManageOrders">Manage Orders</button><main><section id="page-files"><div class="twoColumnLayout"><div id="orderFilesList"></div></div></section></main>
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
   if(name==='save_pharmflow_active_order_manifest_v4'){writes++;if(failSave)return send({error:'fixture save failure'},500);if(args.p_expected_revision!==revision)return send({error:'STALE_ACTIVE_ORDER_MANIFEST_REVISION'},409);manifest=structuredClone(args.p_manifest);revision++;return send([{revision,order_files:manifest.orderFiles.length,order_items:manifest.orderData.length}]);}
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
  const p=await page();hold=true;await p.click('#pfnManageOrders');await p.waitForFunction(()=>document.querySelector('#orderFilesList').textContent.includes('Loading Active Orders'));
  assert.equal(await p.locator('.emptyState').count(),0);await p.evaluate(()=>refreshFileLists());assert.match(await p.locator('#orderFilesList').innerText(),/Loading Active Orders/);
  await p.waitForFunction(()=>PharmFlowCloudWorkspace.activeManifestBusy);await new Promise(r=>setTimeout(r,50));assert.equal(reads,1);
  // Overlapping callers join the same response, rather than reporting false readiness.
  await p.evaluate(()=>{window.joined=pullActiveOrderManifest({force:true});});assert.equal(reads,1);
  hold=false;held.splice(0).forEach(f=>f());await p.waitForFunction(()=>document.querySelector('#pfnOrdersOverlay').dataset.ordersReady==='true');
  assert.equal(await p.locator('#orderFilesList .fileItem').count(),2);assert(await p.locator('input[value="FIXTURE-12"]').isChecked());assert(!(await p.locator('input[value="FIXTURE-62"]').isChecked()));assert.equal(await p.locator('[data-save-assignment],[data-remove-assignment]').count(),0);
  // Pending save stays pending without success. Rapid changes/reopen cannot create another write.
  hold=true;await p.locator('input[value="FIXTURE-62"]').check();await p.waitForFunction(()=>!!PharmFlowNext.assignmentSave);assert(await p.locator('input[value="FIXTURE-12"]').isDisabled());assert.equal(await p.evaluate(()=>toasts.filter(t=>t.type==='success').length),0);
  await p.evaluate(()=>{const i=document.querySelector('input[value="FIXTURE-12"]');i.checked=false;i.dispatchEvent(new Event('change',{bubbles:true}));});
  hold=false;held.splice(0).forEach(f=>f());await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);assert.equal(writes,1);assert.deepEqual(manifest.handheldOrderNumbers,['FIXTURE-12','FIXTURE-62']);assert.equal(await p.evaluate(()=>toasts.filter(t=>t.type==='success').length),1);
  assert(await p.locator('input[value="FIXTURE-12"]').isChecked());
  await p.locator('input[value="FIXTURE-12"]').uncheck();await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);assert.deepEqual(manifest.handheldOrderNumbers,['FIXTURE-62']);
  await p.locator('input[value="FIXTURE-62"]').uncheck();await p.waitForFunction(()=>!PharmFlowNext.assignmentSave);assert.deepEqual(manifest.handheldOrderNumbers,[]);assert.equal(manifest.handheldScopeConfigured,true);
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
  // A genuinely empty server answer may show empty only after that answer.
  manifest=null;const empty=await page();await empty.click('#pfnManageOrders');await empty.waitForFunction(()=>document.querySelector('#pfnOrdersOverlay').dataset.ordersReady==='true');assert.equal(await empty.locator('.fileItem').count(),0);assert.equal(await empty.locator('.emptyState').count(),1);
  assert.deepEqual(errors,[]);await empty.close();await failed.close();await second.close();await p.close();
  console.log('PASS Chromium: loading vs empty, shared read, restored assignments, direct check/uncheck including last order, pending/rapid-click protection, Select All, rollback/no false success, refresh and second isolated session, assignment-only update, identity fencing. RPC persistence is local fixture, NOT live Staging.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
