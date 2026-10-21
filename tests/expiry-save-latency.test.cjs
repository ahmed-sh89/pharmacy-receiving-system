const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./expiry-desktop-harness.cjs');
const turn=()=>new Promise(r=>setImmediate(r));
test('Authoritative Session rows render while independent Inventory summary is held',async()=>{
 const h=harness(),rpc=h.c.authRpc;let release;
 h.c.authRpc=(name,args)=>name==='summary_pharmflow_expiry_inventory_v1'?new Promise(r=>release=r):rpc(name,args);
 await h.refresh();assert.equal(h.e('expirySessionCount').textContent,'2');assert.match(h.e('expiryCurrentStateBody').textContent,/First/);
 release([]);await turn();
});
test('Acknowledged matching session skips only duplicate getter; normal refresh still discovers session',async()=>{
 const h=harness();let getters=0;h.c.ensureExpiryActiveSession=async()=>{getters++;return 'session1';};await h.refresh();assert.equal(getters,1);
 const count=h.calls.filter(x=>x.name==='list_pharmflow_expiry_desktop_session_v1').length;
 await h.c.refreshExpiryCurrentState({confirmedSessionId:'session1',confirmedOperationId:'committed1'});
 assert.equal(getters,1);assert.equal(h.calls.filter(x=>x.name==='list_pharmflow_expiry_desktop_session_v1').length,count+1);
 await h.c.refreshExpiryCurrentState({confirmedSessionId:'other',confirmedOperationId:'committed2'});assert.equal(getters,2);
 await h.refresh();assert.equal(getters,3);
});
test('Post-ack read cannot coalesce with stale pre-save poll or let it overwrite fresh rows',async()=>{
 const h=harness();await h.refresh();const rpc=h.c.authRpc;let release,held=true;
 h.c.authRpc=(name,args)=>{if(name==='list_pharmflow_expiry_desktop_session_v1' && held){held=false;const old=structuredClone(h.receipts);return new Promise(r=>release=()=>r(old));}return rpc(name,args);};
 const old=h.refresh();await turn();h.receipts.push({...h.receipts[0],operation_id:'new',quantity:2});
 await h.c.refreshExpiryCurrentState({confirmedSessionId:'session1',confirmedOperationId:'new'});
 assert.equal(h.engine.sessionRows.length,3);release();await old;assert.equal(h.engine.sessionRows.length,3);
 assert.equal(h.engine.sessionRows.reduce((a,r)=>a+r.quantity,0),12);
});
test('Summary failure is handled without hiding saved session rows',async()=>{
 const h=harness(),rpc=h.c.authRpc;h.c.authRpc=(name,args)=>name==='summary_pharmflow_expiry_inventory_v1'?Promise.reject(Error('summary offline')):rpc(name,args);
 await h.refresh();await turn();assert.match(h.e('expiryCurrentStateBody').textContent,/First/);assert.equal(h.e('expiryCurrentStateEmpty').hidden,true);
});
test('Account switch rejects late summary and shared rows; no foreign state is adopted',async()=>{
 const h=harness(),rpc=h.c.authRpc;let release;
 h.c.authRpc=(name,args)=>name==='summary_pharmflow_expiry_inventory_v1'?new Promise(r=>release=r):rpc(name,args);
 await h.refresh();h.c.account='foreign';h.c.authIdentity='other';release([{key:'foreign-old',quantity:999}]);await turn();
 // Existing reset owns account isolation; old asynchronous summary cannot commit after scope changes.
 h.c.resetExpiryDesktopSession();assert.equal(h.engine.sessionRows.length,0);
});
