const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./expiry-capture-review.test.cjs');
const raw='(01)04065272072977(17)270831(10)GS1-BATCH';
async function scanned(){const h=harness(true);h.c.engine.selectedWorkerId='worker1';await h.c.resolveExpiryScannedValue(raw);return h;}
async function reload(h){h.c.resetExpiryCaptureForm();h.c.loadExpiryWorkers=async()=>[{worker_id:'worker1',worker_name:'One'}];await h.c.activateExpiryCapture();}
function choice(h,label){const row=h.e('expiryRecoverableDrafts').children?.[0];assert.ok(row);return row.children.find(el=>el.textContent===label);}
async function click(el){el.click();await new Promise(setImmediate);}
test('Authoritative save acknowledgement survives refresh; History reads server facts on demand',async()=>{
 const h=await scanned();await h.c.saveExpiryCapture();assert.equal(h.c.engine.currentItem,null);assert.match(h.e('expiryScanStatus').textContent,/Saved · Ready to Scan/);
 const rows=await h.c.loadExpirySessionReceipts();assert.equal(rows.length,1);assert.equal(rows[0].raw_scan,raw);
 const metadata=JSON.parse([...h.session.entries()].find(([k])=>k.startsWith('pharmflow_expiry_active_v1_'))[1]);assert.equal(metadata.serverOpened,true);assert.equal(metadata.item_name,undefined);
 await reload(h);assert.equal((await h.c.loadExpirySessionReceipts()).length,1);
});
test('Missing save acknowledgement cannot produce success or discard the draft',async()=>{
 const h=await scanned(),rpc=h.c.authRpc;h.c.console={error(){},warn(){}};
 h.c.authRpc=async(name,p)=>name==='save_pharmflow_expiry_session_capture_v2'?[]:rpc(name,p);
 await h.c.saveExpiryCapture();assert.ok(h.c.engine.currentItem);assert.equal(h.c.engine.saveUncertain,true);assert.equal(h.drafts.size,1);
});
test('Refresh offers Resume or Discard; it never renders an unsaved item as a new scan',async()=>{
 const h=await scanned();h.e('expiryQuantity').value='7';await h.c.persistExpiryDraft();await reload(h);
 assert.equal(h.c.engine.currentItem,null);assert.equal(h.c.engine.draftReady,false);assert.equal(h.e('expiryItemGTIN').textContent,'—');assert.equal(h.e('expiryRecoverableDrafts').hidden,false);
 assert.equal(await h.c.resolveExpiryScannedValue('U0030'),false);assert.equal(h.calls.length,0);
 await click(choice(h,'Resume'));assert.equal(h.c.engine.currentItem.identifierDisplay,'04065272072977');assert.equal(h.e('expiryQuantity').value,'7');assert.equal(h.c.engine.draftReady,true);assert.equal(h.calls.length,0);
});
test('Discard removes only a genuine unsent local draft and returns to scan readiness',async()=>{
 const h=await scanned();await h.c.persistExpiryDraft();await reload(h);await click(choice(h,'Discard'));
 assert.equal(h.drafts.size,0);assert.equal(h.receipts.size,0);assert.equal(h.c.engine.currentItem,null);assert.equal(h.c.engine.draftReady,true);assert.equal(h.calls.length,0);
});
test('A committed draft left by interrupted cleanup reconciles read-only and cannot reappear as unsaved',async()=>{
 const h=await scanned(),remove=h.c.ExpiryDraftStore.remove;h.c.console={error(){},warn(){}};h.c.ExpiryDraftStore.remove=async()=>{throw new Error('interrupted cleanup');};
 await h.c.saveExpiryCapture();assert.equal(h.drafts.get('user1/isolated-test').status,'ACKNOWLEDGED');const writes=h.calls.filter(c=>c.name.startsWith('save_')).length;
 h.c.ExpiryDraftStore.remove=remove;await reload(h);assert.equal(h.c.engine.currentItem,null);assert.equal(h.drafts.size,0);assert.equal((await h.c.loadExpirySessionReceipts()).length,1);assert.equal(h.calls.filter(c=>c.name.startsWith('save_')).length,writes);
});
test('Uncertain and legacy writes cannot be discarded or automatically replayed',async()=>{
 const h=await scanned();await h.c.persistExpiryDraft('UNCERTAIN');await reload(h);
 assert.equal(choice(h,'Discard').disabled,true);assert.equal(h.c.engine.currentItem,null);assert.equal(h.calls.length,0);
 const draft=h.drafts.get('user1/isolated-test');draft.operation=null;h.drafts.set(draft.scope,draft);await reload(h);assert.equal(choice(h,'Discard').disabled,true);await click(choice(h,'Resume'));assert.equal(h.c.engine.saveUncertain,true);await h.c.saveExpiryCapture();assert.equal(h.calls.length,0);
});
test('History displays at most ten authoritative operations without deleting storage',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';await h.c.ensureExpiryActiveSession();
 h.c.authRpc=async()=>Array.from({length:17},(_,i)=>({operation_id:'op-'+i,pharmacy_id:'isolated-test',created_by:'user1',quantity:1}));
 // The versioned server is the owner of the ten-operation display limit.
 assert.equal((await h.c.loadExpirySessionReceipts()).length,17);
 h.c.authRpc=async()=>[{pharmacy_id:'other',created_by:'user1'}];await assert.rejects(h.c.loadExpirySessionReceipts(),/scope mismatch/);
});
test('Draft recovery refuses another device or an invalid operator without replacing the saved draft',async()=>{
 const h=await scanned();await h.c.persistExpiryDraft();h.c.resetExpiryCaptureForm();h.c.ensureDeviceId=()=> 'other-device';await assert.rejects(h.c.prepareExpiryDraftRecovery(),/another device/);assert.equal(h.drafts.size,1);
 h.c.ensureDeviceId=()=> 'synthetic-device';h.c.engine.workers=[{worker_id:'different'}];await assert.rejects(h.c.restoreExpiryDraft(),/operator unavailable/);assert.equal(h.c.engine.currentItem,null);
});
test('History uses one panel while Desktop keeps the original panel',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';await h.c.openExpiryCapturedPanel();const markup=h.c.document.body.children.at(-1).innerHTML;
 assert.doesNotMatch(markup,/role="tab"/);assert.match(markup,/History/);assert.doesNotMatch(markup,/Clear History/);
 const pc=harness(false);pc.c.loadExpiryCapturedRecords=async()=>[];await pc.c.openExpiryCapturedPanel();assert.match(pc.c.document.body.children.at(-1).innerHTML,/Recent Expiry/);
});
test('Invalid session response is an explicit error, never empty success',async()=>{
 const h=await scanned();await h.c.saveExpiryCapture();h.c.authRpc=async()=>null;
 await assert.rejects(h.c.loadExpirySessionReceipts(),/scope mismatch/);
});
