const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./expiry-desktop-harness.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){const h=harness();h.e('zebraExpiryShell').classList.add('active');h.c.ExpiryCaptureEngine.draftReady=true;h.c.getComputedStyle=()=>({paddingBottom:'0'});h.e('zebraExpiryShell').getBoundingClientRect=()=>({top:0});return h;}
test('Expiry waits for delayed permission restoration before reading; concurrent callers share the authorized read',async()=>{
 const h=setup();let finish,state='loading';const waiting=new Promise(r=>finish=r);
 h.c.PharmFlowPermissions={allowed:()=>state==='ready',state:()=>state,generation:()=>1,whenReady:()=>waiting};
 const a=h.refresh(),b=h.refresh();await tick();assert.equal(h.calls.length,0);state='ready';finish();await Promise.all([a,b]);assert.equal(h.calls.filter(x=>x.name==='list_pharmflow_expiry_desktop_session_v1').length,1);assert.equal(h.e('expiryCurrentStateEmpty').textContent.includes('Unable to load'),false);
});
test('unavailable authorization is not a workspace error or a grant; actual denial makes no protected RPC',async()=>{
 const h=setup();h.c.PharmFlowPermissions={allowed:()=>false,state:()=> 'unavailable',whenReady:async()=>null};await h.refresh();assert.equal(h.calls.length,0);assert.notEqual(h.c.status?.text,'EXPIRY LOAD FAILED');h.c.PharmFlowPermissions.state=()=> 'ready';await h.refresh();assert.equal(h.calls.length,0);assert.equal(h.c.status.text,'EXPIRY ACCESS DENIED');
});
for(const mode of ['SESSION','INVENTORY'])test(mode+' transient failure retries, clears stale error with identical data and preserves capture/search',async()=>{
 const h=setup();await h.refresh();if(mode==='INVENTORY')await h.click('btnOpenExpiryInventory');
 const base=h.c.authRpc;let failing=true;h.c.authRpc=async(...args)=>{if(failing&&args[0]===(mode==='SESSION'?'list_pharmflow_expiry_desktop_session_v1':'query_pharmflow_expiry_inventory_v1'))throw Error('temporary lost connection');return base(...args);};
 h.e('expiryBarcodeInput').value='UNSAVED';h.e('expiryQuantity').value='9';h.c.ExpiryCaptureEngine.currentItem={item_code:'UNSAVED'};await h.refresh();assert.equal(h.c.status.text,'EXPIRY LOAD FAILED');failing=false;await h.flush();assert.notEqual(h.c.status.text,'EXPIRY LOAD FAILED');assert.equal(h.e('expiryCurrentStateEmpty').textContent.includes('Unable to load'),false);assert.equal(h.e('expiryBarcodeInput').value,'UNSAVED');assert.equal(h.e('expiryQuantity').value,'9');assert.equal(h.c.ExpiryCaptureEngine.desktopView,mode);
});
test('genuine server authorization denial is retained and never retried by a timer',async()=>{
 const h=setup();h.c.authRpc=async()=>{throw Object.assign(Error('permission denied'),{serverRejected:true,httpStatus:403});};await h.refresh();const n=h.calls.length;await h.flush();assert.equal(h.calls.length,n);assert.equal(h.c.status.text,'EXPIRY LOAD FAILED');assert.match(h.e('expiryCurrentStateEmpty').textContent,/permission denied/);
});
test('late old-pharmacy data and failure cannot populate or overwrite a new workspace',async()=>{
 for(const fails of [false,true]){const h=setup(),base=h.c.authRpc;let complete;
 h.c.authRpc=async(name,p)=>name==='list_pharmflow_expiry_desktop_session_v1'?new Promise((r,j)=>complete=()=>fails?j(Error('old failure')):r([{kind:'KNOWN',item_code:'OLD',quantity:1}])):base(name,p);
 const old=h.refresh();await tick();h.c.account='new-user/new-pharmacy';h.c.pharmacy='new-pharmacy';h.c.authIdentity='new-auth';h.c.authRpc=base;await h.refresh();complete();await old;assert.equal(h.e('expiryCurrentStateBody').textContent.includes('OLD'),false);assert.notEqual(h.c.status?.text,'EXPIRY LOAD FAILED');}
});
test('late read from an earlier permission generation cannot commit after recovery',async()=>{
 const h=setup(),base=h.c.authRpc;let generation=1,complete;h.c.PharmFlowPermissions={allowed:()=>true,state:()=> 'ready',generation:()=>generation,whenReady:async()=>true};
 h.c.authRpc=async(name,p)=>name==='list_pharmflow_expiry_desktop_session_v1'?new Promise(r=>complete=r):base(name,p);const old=h.refresh();await tick();generation++;h.c.authRpc=base;await h.refresh();complete([{kind:'KNOWN',item_code:'STALE',quantity:1}]);await old;assert.equal(h.e('expiryCurrentStateBody').textContent.includes('STALE'),false);
});
test('retries have a finite budget and perform no mutation calls',async()=>{
 const h=setup();let n=0;h.c.authRpc=async()=>{n++;throw Error('offline');};await h.refresh();for(let i=0;i<5;i++)await h.flush();assert.equal(n,8); // each attempt reads independent summary and session
 assert.equal(h.storage.size,0);assert.equal(h.c.ExpiryCaptureEngine.currentItem,undefined);
});
test('permission-ready event recovers active Inventory without activation, Clear or user input loss',async()=>{
 const h=setup();await h.refresh();await h.click('btnOpenExpiryInventory');let phase='unavailable';h.c.PharmFlowPermissions={allowed:()=>phase==='ready',state:()=>phase,generation:()=>1,whenReady:async()=>null};h.e('expiryBarcodeInput').value='KEEP';await h.refresh();const before=h.calls.length;phase='ready';h.emit('pharmflow:permissions-ready');await tick();assert(h.calls.length>before);assert.equal(h.c.ExpiryCaptureEngine.desktopView,'INVENTORY');assert.equal(h.e('expiryBarcodeInput').value,'KEEP');assert.equal(h.listeners.get('pharmflow:permissions-ready').length,1);
});
