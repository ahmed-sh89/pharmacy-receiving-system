import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const files=['js/config.js','js/utils.js','js/state.js','js/receiving.js','js/reports.js',
  'supabase.js','js/orders.js','cloud-workspace.js','js/app.js'];
const tx=(id,quantity,order='SYNTHETIC-A',source='SCAN')=>({transactionId:id,quantity,
  itemCode:'X',orderId:order,selectedOrderNumber:order,source,deviceId:'MOCK-PC',cloudSynced:true});
function client(){
  const memory=new Map(),calls=[],paints=[];
  let rpc=async name=>{throw Error('Unexpected RPC '+name);};
  const ctx=vm.createContext({console,structuredClone,navigator:{onLine:false},
    document:{readyState:'loading',visibilityState:'hidden',documentElement:{dataset:{}},
      addEventListener(){},getElementById(){return null;},querySelector(){return null;}},
    setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},addEventListener(){},
    AuthState:{context:null},fetch(){throw Error('Network forbidden');},
    localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)},
    refreshEntireUI(){paints.push(sample());},
    authRpc:async(name,args)=>{calls.push({name,args});return rpc(name,args);}
  });
  ctx.window=ctx;
  const run=code=>vm.runInContext(code,ctx);
  for(const file of files) vm.runInContext(fs.readFileSync(new URL(file,root),'utf8'),ctx,{filename:file});
  function sample(){return JSON.parse(run(`JSON.stringify({qty:AppState.workspace.orderData[0]?.receivedQty,
    remaining:AppState.workspace.orderData[0]?.remainingQty,history:AppState.workspace.receivingHistory.length,
    stats:AppState.statistics,pending:readCloudQueue().length})`));}
  function seed(rows=[],orders=['SYNTHETIC-A']){
    ctx.fixture=rows;ctx.orders=orders;
    run(`AuthState.context={pharmacy_id:'MOCK-PHARMACY',user_id:'MOCK-USER'};
      AppState.session.deviceId='MOCK-PC';
      localStorage.setItem(APP_CONFIG.storageKeys.deviceId,JSON.stringify('MOCK-PC'));
      Object.assign(PharmFlowCloudWorkspace,{activeAccountScope:getAuthenticatedWorkspaceScope(),generation:7,
        hydratedPharmacyId:'MOCK-PHARMACY',activeManifestPresent:true,activeManifestRevision:9});
      AppState.workspace={...createEmptyWorkspace(),active:true,orderFiles:orders.map(documentId=>({documentId,rowCount:1})),
        orderData:[{itemCode:'X',orderedQty:11,receivedQty:0,orderNumbers:orders}]};
      rebuildStateIndexes();fixture.forEach(addReceivingTransaction);recalculateStatistics();`);
  }
  return {ctx,run,seed,sample,calls,paints,memory,setRpc:f=>{rpc=f;}};
}
const passed=[];
const check=(name,fn)=>{fn();passed.push(name);};
const c=client();c.seed([tx('scan',1),tx('manual',10,'SYNTHETIC-A','MANUAL_ADD')]);
check('actual app dashboard: 11 received, complete, zero remaining, one scanner event',()=>{
  assert.equal(c.sample().qty,11);assert.equal(c.sample().remaining,0);
  assert.equal(c.sample().stats.completedItems,1);assert.equal(c.sample().stats.totalScans,1);
});
c.ctx.pending=[tx('negative',-2,'SYNTHETIC-A','MANUAL_DECREASE')];
c.run('writeCloudQueue(pending);recalculateStatistics();');
check('pending negative absent from history restored into signed projection',()=>{
  assert.equal(c.sample().qty,9);assert.equal(c.sample().history,3);assert.equal(c.sample().pending,1);
});
c.setRpc(async name=>{assert.equal(name,'get_pharmflow_workspace_generation');return 7;});
c.run('navigator.onLine=true;');
assert.equal(await c.run('reconcileCloudWorkspaceAuthority()'),true);
check('pending negative survives routine reconciliation',()=>assert.equal(c.sample().qty,9));
c.run('const structure=deepClone(AppState.workspace);structure.orderData[0].receivedQty=0;applyActiveOrderManifest(structure,9);');
check('manifest preserves pending negative before render',()=>assert.equal(c.paints.at(-1).qty,9));
c.run('mergeCloudReceivingLedger(pending);mergeCloudReceivingLedger(pending);recalculateStatistics();');
check('ledger acknowledgment and duplicate count once',()=>{
  assert.equal(c.sample().qty,9);assert.equal(c.sample().history,3);assert.equal(c.sample().pending,0);
});
c.ctx.pending=[tx('positive',2)];c.run('writeCloudQueue(pending);recalculateStatistics();');
check('pending positive restored exactly once',()=>{
  assert.equal(c.sample().qty,11);c.run('recalculateStatistics();');assert.equal(c.sample().history,4);
});
assert.equal(await c.run('reconcileCloudWorkspaceAuthority()'),true);
check('pending positive survives routine reconciliation',()=>assert.equal(c.sample().qty,11));
c.run('AppState.workspace.orderData[0].receivedQty=999;');
check('report bypasses snapshot quantity fallback',()=>assert.equal(c.run("buildReceivedQuantityByOrder().get('SYNTHETIC-A||X')"),11));
const m=client();m.seed([tx('a',4),tx('b',7,'SYNTHETIC-B'),tx('inactive',50,'SYNTHETIC-INACTIVE')],['SYNTHETIC-A','SYNTHETIC-B']);
check('same item exact multi-order attribution; inactive evidence not reassigned',()=>{
  assert.equal(m.run("buildReceivedQuantityByOrder().get('SYNTHETIC-A||X')"),4);
  assert.equal(m.run("buildReceivedQuantityByOrder().get('SYNTHETIC-B||X')"),7);
  assert.equal(m.sample().qty,11);assert.equal(m.sample().stats.totalScans,2);
});
m.run("mergeCloudReceivingLedger([{transactionId:'invisible',itemCode:'Y',orderId:'SYNTHETIC-A',quantity:3}]);");
check('temporarily invisible item evidence retained without creating an item',()=>{
  assert.equal(m.run('AppState.workspace.receivingHistory.length'),4);
  assert.equal(m.run('AppState.workspace.orderData.length'),1);
});
// Normal authenticated startup preserves known receiving while reading manifest + ledger.
const h=client();h.seed([tx('scan',1),tx('manual',10,'SYNTHETIC-A','MANUAL_ADD')]);
const manifest=JSON.parse(h.run('JSON.stringify(serializeActiveOrderManifest())'));
h.setRpc(async name=>{
  if(name==='get_pharmflow_workspace_generation') return 7;
  if(name==='get_pharmflow_active_order_manifest_v3') return {manifest:structuredClone(manifest),revision:10};
  if(name==='list_pharmflow_cloud_transactions_v2') return [];
  throw Error('Forbidden startup RPC '+name);
});
h.run('navigator.onLine=true;PharmFlowCloudWorkspace.hydratedPharmacyId=null;');
assert.equal(await h.run('restoreCloudWorkspaceOnLogin()'),true);
check('startup no compatibility read or false-zero render',()=>{
  assert.equal(h.sample().qty,11);assert.ok(h.paints.every(p=>p.qty===11));
  assert.ok(!h.calls.some(c=>c.name==='get_pharmflow_cloud_workspace'));
});
h.run("AppState.session.cloud=true;AppState.session.id='MOCK';AppState.session.secret='MOCK';");
const count=h.calls.length;
let sessionReads=0;
const statusElement={};
h.ctx.document.getElementById=id=>id==='cloudSyncStatus'?statusElement:null;
h.run('let sessionEvents=0;AppEvents.on("session:updated",()=>sessionEvents++);');
h.ctx.mockSessionRpc=async()=>{sessionReads++;return [{item_code:'X',received_qty:0,transaction_count:99}];};
h.run('cloudRpc=mockSessionRpc;');
assert.equal(await h.run('refreshCloudSnapshot({replaceWorkspace:true})'),true);
check('legacy snapshot validates session without mutating ledger-backed receiving',()=>{
  assert.equal(h.sample().qty,11);assert.equal(h.sample().history,2);assert.equal(h.calls.length,count);
  assert.equal(sessionReads,1);assert.equal(h.run('AppState.session.cloudTotalScans'),99);
  assert.equal(statusElement.textContent,'SYNCED');assert.equal(h.run('sessionEvents'),1);
  assert.ok(h.run('CloudSyncEngine.lastSnapshotAt'));
});
const sessionError=client();sessionError.seed([tx('still-here',11)]);
const errorStatus={};sessionError.ctx.document.getElementById=id=>id==='cloudSyncStatus'?errorStatus:null;
sessionError.run("navigator.onLine=true;AppState.session.cloud=true;AppState.session.id='S';AppState.session.secret='MOCK';cloudRpc=async()=>{throw Error('network unavailable');};");
assert.equal(await sessionError.run('refreshCloudSnapshot()'),false);
check('legacy network status preserved without losing receiving',()=>{
  assert.equal(errorStatus.textContent,'CONNECTION ISSUE');assert.equal(sessionError.sample().qty,11);
});
sessionError.run("let ended=0;isLikelyZebraDevice=()=>true;isCloudSessionTerminatedOnServer=async()=>false;resetZebraWorkingState=()=>ended++;setZebraHomeMode=()=>{};showToast=()=>{};AppState.session.role='ZEBRA';cloudRpc=async()=>{throw Error('session closed');};");
assert.equal(await sessionError.run('refreshCloudSnapshot()'),false);
check('legacy terminal session validation still invokes supported handling',()=>{
  assert.equal(sessionError.run('ended'),1);assert.equal(errorStatus.textContent,'SESSION ENDED');
});
const legacy=client();legacy.seed([tx('scan',11)]);
legacy.run("AuthState.context=null;PharmFlowCloudWorkspace.activeAccountScope='';navigator.onLine=true;AppState.session.cloud=true;AppState.session.id='LEGACY';AppState.session.secret='MOCK';");
let legacyRelease;
legacy.ctx.mockSessionRpc=async()=>await new Promise(resolve=>{legacyRelease=resolve;});
legacy.run('cloudRpc=mockSessionRpc;');
const legacyFlight=legacy.run('refreshCloudSnapshot({replaceWorkspace:true})');
assert.ok(legacyRelease);
legacy.seed([tx('current',11)]);
legacyRelease([{item_code:'X',ordered_qty:11,received_qty:0}]);
await legacyFlight;
check('in-flight legacy snapshot cannot overwrite newly authenticated state',()=>assert.equal(legacy.sample().qty,11));
// Account switch while a ledger read is outstanding must discard that result.
let release;h.setRpc(async name=>{
  assert.equal(name,'list_pharmflow_cloud_transactions_v2');
  return await new Promise(resolve=>{release=resolve;});
});
const flight=h.run('pullCloudWorkspaceTransactions({force:true})');
assert.ok(release);
h.run("AuthState.context={pharmacy_id:'OTHER-PHARMACY',user_id:'OTHER-USER'};ensureCloudAccountContextIsolation();");
release([tx('foreign',9)]);assert.equal(await flight,false);
check('late ledger and old pending do not leak across account switch',()=>{
  assert.equal(h.sample().history,0);assert.equal(h.sample().pending,0);
});
const ack=client();ack.seed();ack.ctx.pending=[tx('same-id',1)];
ack.run('writeCloudQueue(pending);navigator.onLine=true;');
let ackRelease;
ack.setRpc(async name=>{assert.equal(name,'append_pharmflow_cloud_transaction_v2');return await new Promise(resolve=>{ackRelease=resolve;});});
const ackFlight=ack.run('flushCloudWorkspaceQueue()');
assert.ok(ackRelease);
ack.run("AuthState.context.user_id='SECOND-USER';ensureCloudAccountContextIsolation();writeCloudQueue([{transactionId:'same-id',itemCode:'X',quantity:2,orderId:'SYNTHETIC-A'}]);");
ackRelease(true);await ackFlight;
check('old acknowledgment cannot remove another user pending ID in same pharmacy',()=>{
  assert.equal(ack.sample().pending,1);
  assert.equal(ack.run('readCloudQueue()[0].quantity'),2);
});
// PC and handheld contexts use the existing append/flush/delta functions.
const server=new Map();
const deviceRpc=async(name,args)=>{
  if(name==='append_pharmflow_cloud_transaction_v2'){
    server.set(args.p_transaction_id,{...args.p_payload,transaction_id:args.p_transaction_id});return true;
  }
  if(name==='list_pharmflow_cloud_transactions_v2') return [...server.values()];
  throw Error('Unexpected device RPC '+name);
};
const pc=client(),hh=client();pc.seed();hh.seed();
for(const [device,transaction] of [[pc,tx('pc',1)],[hh,tx('hh',10,'SYNTHETIC-A','MANUAL_ADD')]]){
  device.setRpc(deviceRpc);device.ctx.pending=[transaction];
  device.run('navigator.onLine=true;writeCloudQueue(pending);recalculateStatistics();');
}
await Promise.all([pc.run('flushCloudWorkspaceQueue()'),hh.run('flushCloudWorkspaceQueue()')]);
await Promise.all([pc.run('pullCloudWorkspaceTransactions({force:true})'),hh.run('pullCloudWorkspaceTransactions({force:true})')]);
check('PC/Handheld mock convergence and upload acknowledgment',()=>{
  for(const device of [pc,hh]){assert.equal(device.sample().qty,11);assert.equal(device.sample().history,2);assert.equal(device.sample().pending,0);}
  assert.equal(pc.calls.length+hh.calls.length,4);
});
// Surgical startup regression: busy without a flight must fail, not hydrate.
const busy=client();busy.seed();busy.setRpc(async()=>7);
busy.run("navigator.onLine=true;AppState.workspace=createEmptyWorkspace();rebuildStateIndexes();PharmFlowCloudWorkspace.hydratedPharmacyId=null;PharmFlowCloudWorkspace.activeManifestPresent=false;PharmFlowCloudWorkspace.activeManifestBusy=true;");
assert.equal(await busy.run('restoreCloudWorkspaceOnLogin()'),false);
check('busy manifest without completed authority never hydrates',()=>assert.equal(busy.run('PharmFlowCloudWorkspace.hydratedPharmacyId'),null));
// Real in-flight manifest is shared with startup; ledger completion is awaited.
const waiting=client();waiting.seed();
const waitingManifest=JSON.parse(waiting.run('JSON.stringify(serializeActiveOrderManifest())'));
waiting.run('navigator.onLine=true;PharmFlowCloudWorkspace.hydratedPharmacyId=null;');
let manifestRelease,ledgerRelease;
waiting.setRpc(async name=>{
  if(name==='get_pharmflow_workspace_generation')return 7;
  if(name==='get_pharmflow_active_order_manifest_v3')return await new Promise(r=>{manifestRelease=r;});
  if(name==='list_pharmflow_cloud_transactions_v2')return await new Promise(r=>{ledgerRelease=r;});
  throw Error(name);
});
const manifestFlight=waiting.run('pullActiveOrderManifest()');
const startupFlight=waiting.run('restoreCloudWorkspaceOnLogin()');
assert.ok(manifestRelease);
manifestRelease({manifest:waitingManifest,revision:10});await manifestFlight;
for(let i=0;i<10 && !ledgerRelease;i++)await Promise.resolve();
assert.ok(ledgerRelease);
assert.equal(waiting.run('PharmFlowCloudWorkspace.hydratedPharmacyId'),null);
ledgerRelease([{...tx('local-latest',11),device_id:'MOCK-PC',occurred_at:'2026-01-01T00:00:00Z'}]);assert.equal(await startupFlight,true);
check('startup shares manifest flight and waits for ledger',()=>assert.equal(waiting.sample().qty,11));
waiting.setRpc(async name=>{if(name==='get_pharmflow_workspace_generation') return 7;if(name==='get_pharmflow_active_order_manifest_v3') return {manifest:waitingManifest,revision:10};if(name==='list_pharmflow_cloud_transactions_v2')return [];throw Error(name);});
const reloginReads=waiting.calls.length;
waiting.run('AppState.workspace.lastScan=null;');
assert.equal(await waiting.run('restoreCloudWorkspaceOnLogin()'),true);
check('relogin Last Scan recovery preserves A existing authority read path',()=>{
  assert.equal(waiting.calls.length,reloginReads+2);
  assert.equal(waiting.run('AppState.workspace.lastScan.transactionId'),'local-latest');
});
check('Last Scan recovered only from current-device ledger',()=>{
  assert.equal(waiting.run('AppState.workspace.lastScan.transactionId'),'local-latest');
  waiting.ctx.foreign={...tx('foreign-device',1),deviceId:'OTHER-DEVICE',dateTime:'2099-01-01T00:00:00Z'};
  waiting.run('addReceivingTransaction(foreign);recalculateStatistics();');
  const before=JSON.stringify(waiting.sample());
  waiting.run('recoverCurrentDeviceLastScan();');
  assert.equal(waiting.run('AppState.workspace.lastScan.transactionId'),'local-latest');
  assert.equal(JSON.stringify(waiting.sample()),before);
  waiting.run("AuthState.context.user_id='OTHER';ensureCloudAccountContextIsolation();recoverCurrentDeviceLastScan();");
  assert.equal(waiting.run('AppState.workspace.lastScan'),null);
});
check('conflicting immutable ID fails without changing known evidence or queue',()=>{
  const conflict=client();conflict.seed([tx('known',11)]);conflict.ctx.pending=[tx('known',11)];
  conflict.run('writeCloudQueue(pending);');
  assert.throws(()=>conflict.run("mergeCloudReceivingLedger([{transactionId:'known',itemCode:'X',orderId:'SYNTHETIC-A',quantity:1}])"),/RECEIVING_TRANSACTION_CONFLICT/);
  assert.equal(conflict.sample().qty,11);assert.equal(conflict.sample().pending,1);
  assert.throws(()=>conflict.run("mergeCloudReceivingLedger([{transactionId:'known',itemCode:'X',orderId:'SYNTHETIC-A',quantity:1},{transactionId:'new',itemCode:'X',orderId:'SYNTHETIC-A',quantity:2}])"),/RECEIVING_TRANSACTION_CONFLICT/);
  assert.equal(conflict.sample().history,1);
});
// Run the unchanged root UI dashboard functions with mock DOM outputs.
const dashboard=client();dashboard.seed([tx('scan',1),tx('manual',10,'SYNTHETIC-A','MANUAL_ADD')]);
const uiSource=fs.readFileSync(new URL('js/ui.js',root),'utf8');
const uiStart=uiSource.indexOf('function getSelectedOrderDashboardMetrics(){');
const uiEnd=uiSource.indexOf('function refreshProgress(',uiStart);
assert.ok(uiEnd>uiStart);
dashboard.run('const UI={elements:{statTotalItems:{},statCompleted:{},statRemaining:{},statOver:{},statManual:{},statScans:{}}};function refreshProgress(){} function setElementText(el,text){if(el)el.textContent=String(text);}');
vm.runInContext(uiSource.slice(uiStart,uiEnd),dashboard.ctx,{filename:'ui.js/dashboard'});
dashboard.run("AppState.workspace.selectedOrderNumber='SYNTHETIC-A';AppState.workspace.orderData[0].receivedQty=999;refreshDashboard();");
check('actual root dashboard renders ledger metrics',()=>{
  assert.equal(dashboard.run('Number(UI.elements.statCompleted.textContent)'),1);
  assert.equal(dashboard.run('Number(UI.elements.statRemaining.textContent)'),0);
  assert.equal(dashboard.run('Number(UI.elements.statScans.textContent)'),1);
});
dashboard.run("addReceivingTransaction({transactionId:'decrease',itemCode:'X',quantity:-2,orderId:'SYNTHETIC-A',source:'MANUAL_DECREASE'});refreshDashboard();");
check('actual dashboard negative adjustment renders remaining and scanner count consistently',()=>{
  assert.equal(dashboard.run('Number(UI.elements.statCompleted.textContent)'),0);
  assert.equal(dashboard.run('Number(UI.elements.statRemaining.textContent)'),2);
  assert.equal(dashboard.run('Number(UI.elements.statScans.textContent)'),1);
});
const support=client();support.seed([tx('keep',11)]);
support.run('navigator.onLine=true;let archiveRefreshes=0;reconcileWorkspaceGeneration=async()=>true;restoreHistoricalArchive=async()=>archiveRefreshes++;');
await Promise.all([support.run('reconcileCloudWorkspaceAuthority()'),support.run('reconcileCloudWorkspaceAuthority()')]);
check('reconciliation single-flight preserves archive refresh support',()=>assert.equal(support.run('archiveRefreshes'),1));

const stress=client();stress.seed(Array.from({length:1000},(_,i)=>tx('unit-'+i,1)));
assert.equal(stress.sample().qty,1000);
stress.run('mergeCloudReceivingLedger([]);recalculateStatistics();');assert.equal(stress.sample().qty,1000);
stress.run("mergeCloudReceivingLedger([{transactionId:'unit-0',itemCode:'X',orderId:'SYNTHETIC-A',quantity:1}]);recalculateStatistics();");
check('1000 units and IDs -> 1000 -> 1000 across empty/smaller response',()=>{assert.equal(stress.sample().qty,1000);assert.equal(stress.sample().history,1000);});
const handheldSource=fs.readFileSync(new URL('js/handheld-runtime.js',root),'utf8');
stress.run(handheldSource.match(/function hhReceivingSessionReady\(\)\{[^]*?^}/m)[0]);
stress.run('PharmFlowCloudWorkspace.hydratedPharmacyId=null;');assert.equal(stress.run('hhReceivingSessionReady()'),false);
stress.run("PharmFlowCloudWorkspace.hydratedPharmacyId='MOCK-PHARMACY';");assert.equal(stress.run('hhReceivingSessionReady()'),true);
check('actual handheld readiness requires ledger hydration',()=>{});
const appGate=client();appGate.seed();
appGate.run('PharmacyApp.initialized=true;let archiveCalls=0;restoreCloudWorkspaceOnLogin=async()=>false;restoreHistoricalArchive=async()=>archiveCalls++;');
assert.equal(await appGate.run('startApplication()'),false);
check('actual authenticated app startup stops on authority failure',()=>assert.equal(appGate.run('archiveCalls'),0));
console.log(JSON.stringify({verdict:'LOCAL EXTENDED TESTS PASS',passed},null,2));
