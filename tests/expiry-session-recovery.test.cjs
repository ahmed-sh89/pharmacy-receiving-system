const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./expiry-capture-review.test.cjs');
const raw='(01)04065272072977(17)270831(10)GS1-BATCH';
async function scanned(){const h=harness(true);h.c.engine.selectedWorkerId='worker1';await h.c.resolveExpiryScannedValue(raw);return h;}
async function reload(h){h.c.resetExpiryCaptureForm();h.c.loadExpiryWorkers=async()=>[{worker_id:'worker1',worker_name:'One'}];await h.c.activateExpiryCapture();}
function choice(h,label){const row=h.e('expiryRecoverableDrafts').children?.[0];assert.ok(row);return row.children.find(el=>el.textContent===label);}
async function click(el){el.click();await new Promise(setImmediate);}
test('Save requires an authoritative receipt before success, retains the receipt ID across reload, and reads server facts',async()=>{
 const h=await scanned();await h.c.saveExpiryCapture();assert.equal(h.c.engine.currentItem,null);assert.match(h.e('expiryScanStatus').textContent,/SAVED/);
 const rows=await h.c.loadExpirySessionReceipts();assert.equal(rows.length,1);assert.equal(rows[0].quantity,1);assert.equal(rows[0].raw_scan,raw);
 const metadata=JSON.parse([...h.session.entries()].find(([k])=>k.startsWith('pharmflow_expiry_recent_'))[1]);assert.equal(metadata.operations.length,1);assert.equal(metadata.quantity,undefined);assert.equal(metadata.item_name,undefined);
 await reload(h);assert.equal(h.c.engine.currentItem,null);assert.equal(h.c.engine.draftReady,true);assert.equal((await h.c.loadExpirySessionReceipts()).length,1);
 h.c.clearExpirySessionHistory();assert.equal((await h.c.loadExpirySessionReceipts()).length,0);assert.equal(h.receipts.size,1);assert.equal(h.calls.filter(c=>/delete|clear|reset/i.test(c.name)).length,0);
});
test('Missing or mismatched receipt cannot produce success or discard the draft',async()=>{
 for(const mismatch of [false,true]){
  const h=await scanned(),rpc=h.c.authRpc;h.c.console={error(){},warn(){}};
  h.c.authRpc=async(name,p)=>name==='list_pharmflow_expiry_capture_receipts_v1'?(mismatch?[{...h.c.engine.operation.payload,operation_id:h.c.engine.operation.id,pharmacy_id:'another-pharmacy'}]:[]):rpc(name,p);
  await h.c.saveExpiryCapture();assert.ok(h.c.engine.currentItem);assert.equal(h.c.engine.saveUncertain,true);assert.equal(h.drafts.size,1);assert.doesNotMatch(h.e('expiryScanStatus').textContent,/^✓ SAVED/);
 }
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
test('History keeps the latest 15 unique receipt references and isolates user, pharmacy, operator and device',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';
 for(let i=0;i<17;i++)h.c.rememberExpiryReceipt({operation_id:'op-'+i,pharmacy_id:'isolated-test',created_by:'user1',worker_id:'worker1',device_id:'synthetic-device'});
 h.c.rememberExpiryReceipt({operation_id:'op-16',pharmacy_id:'isolated-test',created_by:'user1',worker_id:'worker1',device_id:'synthetic-device'});
 assert.deepEqual(Array.from(h.c.expiryHandheldSession().session.operations),Array.from({length:15},(_,i)=>'op-'+(16-i)));
 for(const field of ['user','pharmacy','operator','device']){
  const original={user:h.c.AuthState.user.id,pharmacy:h.c.AuthState.context.pharmacy_id,operator:h.c.engine.selectedWorkerId,device:h.c.ensureDeviceId};
  if(field==='user')h.c.AuthState.user.id='other';if(field==='pharmacy')h.c.AuthState.context.pharmacy_id='other';if(field==='operator')h.c.engine.selectedWorkerId='other';if(field==='device')h.c.ensureDeviceId=()=> 'other-device';
  assert.equal((await h.c.loadExpirySessionReceipts()).length,0);
  h.c.AuthState.user.id=original.user;h.c.AuthState.context.pharmacy_id=original.pharmacy;h.c.engine.selectedWorkerId=original.operator;h.c.ensureDeviceId=original.device;
 }
});
test('Draft recovery refuses another device or an invalid operator without replacing the saved draft',async()=>{
 const h=await scanned();await h.c.persistExpiryDraft();h.c.resetExpiryCaptureForm();h.c.ensureDeviceId=()=> 'other-device';await assert.rejects(h.c.prepareExpiryDraftRecovery(),/another device/);assert.equal(h.drafts.size,1);
 h.c.ensureDeviceId=()=> 'synthetic-device';h.c.engine.workers=[{worker_id:'different'}];await assert.rejects(h.c.restoreExpiryDraft(),/operator unavailable/);assert.equal(h.c.engine.currentItem,null);
});
test('Recent Scans uses only authoritative session receipts; Desktop keeps its original panel',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';h.c.loadExpirySessionReceipts=async()=>[{operation_id:'op',identifier_display:'001234',item_code:'ITEM',item_name:'Synthetic',quantity:1,expiry_month:10,expiry_year:2026,kind:'KNOWN',acknowledgement:{state_id:'state'}}];
 await h.c.openExpiryCapturedPanel();const markup=h.c.document.body.children.at(-1).innerHTML;
 assert.match(markup,/Recent Scans/);assert.match(markup,/001234/);assert.match(markup,/Qty 1/);assert.match(markup,/Clear History/);assert.doesNotMatch(markup,/data-source|data-range|data-delete|ALL HISTORY|ALL DEVICES/);
 const pc=harness(false);pc.c.loadExpiryCapturedRecords=async()=>[];await pc.c.openExpiryCapturedPanel();assert.match(pc.c.document.body.children.at(-1).innerHTML,/Recent Expiry/);assert.match(pc.c.document.body.children.at(-1).innerHTML,/data-source/);
});

test('A partial session read is an explicit error, never an empty successful history',async()=>{
 const h=await scanned();await h.c.saveExpiryCapture();h.c.authRpc=async()=>[];
 await assert.rejects(h.c.loadExpirySessionReceipts(),/scope mismatch/);
 await h.c.openExpiryRecentScans();assert.match(h.c.document.body.children.at(-1).innerHTML,/Recent scans unavailable/);
});
