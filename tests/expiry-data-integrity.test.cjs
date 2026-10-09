const test=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./expiry-capture-review.test.cjs');
const raw='(01)04065272072977(17)270831(10)GS1-BATCH';
async function scanned(){const h=harness(true);h.c.engine.selectedWorkerId='worker1';await h.c.resolveExpiryScannedValue(raw);return h;}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
test('Untouched capture survives 30 seconds and explicit Clear; new scan cannot replace it',async()=>{
 const h=await scanned();h.flush(30000);h.c.clearExpiryScreen();
 assert.equal(h.c.engine.currentItem.itemCode,'ITEM1');
 assert.equal(await h.c.resolveExpiryScannedValue('S00110'),false);
 assert.equal(h.c.engine.currentItem.identifierDisplay,'04065272072977');
});
test('Overlapping lookups cannot publish competing captures; parser exception releases lock',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';const d=deferred();h.c.IdentifierService.resolve=()=>d.promise;
 const first=h.c.resolveExpiryScannedValue(raw);assert.equal(await h.c.resolveExpiryScannedValue('U0030'),false);
 d.resolve({found:true,itemCode:'ONE',identifierDisplay:'04065272072977'});await first;assert.equal(h.c.engine.currentItem.itemCode,'ONE');
 h.c.resetExpiryCaptureForm();h.c.parseGS1Barcode=()=>{throw new Error('bad parser');};assert.equal(await h.c.resolveExpiryScannedValue(raw),false);assert.equal(h.c.engine.resolving,false);
});
for(const identifier of ['U0030','S00110','1234A','001234','04065272072977'])test('Unknown '+identifier+' retains exact identifier/raw/date/quantity/batch and both photo blobs; no legacy write',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';h.c.IdentifierService.resolve=async()=>({found:false});h.c.parseGS1Barcode=raw=>({identifierDisplay:raw});h.e('expiryBatchInput').value='LOT-KEEP';h.c.authRpc=async(name,payload)=>{h.calls.push({name,payload});throw new Error('backend not deployed');};
 await h.c.resolveExpiryScannedValue(identifier);h.e('expiryQuantity').value='7';h.c.setExpiryControlValue(h.e('expiryMonth'),'8');h.c.setExpiryControlValue(h.e('expiryYear'),'2028');
 const product=new Blob(['product'],{type:'image/jpeg'}),expiry=new Blob(['expiry'],{type:'image/png'});
 await h.c.setExpiryEvidencePhoto('product',product);await h.c.setExpiryEvidencePhoto('expiry',expiry);await h.c.saveExpiryCapture();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'reserve_pharmflow_expiry_capture_v1');const draft=h.drafts.get('user1/isolated-test');assert.equal(draft.item.identifierDisplay,identifier);assert.equal(draft.item.rawBarcode,identifier);assert.equal(draft.quantity,'7');assert.equal(draft.month,'8');assert.equal(draft.year,'2028');assert.equal(draft.batch,'LOT-KEEP');assert.equal(await draft.photos.product.text(),'product');assert.equal(await draft.photos.expiry.text(),'expiry');
 h.c.resetExpiryCaptureForm();assert.equal(await h.c.restoreExpiryDraft(),true);assert.equal(h.e('expiryQuantity').value,'7');assert.equal(await h.c.engine.reviewPhotos.expiry.text(),'expiry');
});
test('Scope switch cannot hydrate or submit another account/pharmacy draft',async()=>{
 const h=await scanned();await h.c.persistExpiryDraft();h.c.AuthState.context.pharmacy_id='other';
 await h.c.saveExpiryCapture();assert.equal(h.calls.length,0);h.c.resetExpiryCaptureForm();assert.equal(await h.c.restoreExpiryDraft(),false);
 h.c.AuthState.context.pharmacy_id='isolated-test';h.c.AuthState.user.id='other-user';assert.equal(await h.c.restoreExpiryDraft(),false);
});
test('Duplicate Save and scan during write produce one write; no delayed reset erases next scan',async()=>{
 const h=await scanned(),d=deferred();let writes=0;h.c.authRpc=async(name,p)=>{if(name.startsWith('reserve_'))return {operation_id:p.p_operation_id,status:'RESERVED'};if(name==='list_pharmflow_expiry_capture_receipts_v1')return [{...h.c.engine.operation.payload,operation_id:h.c.engine.operation.id,pharmacy_id:'isolated-test',created_by:'user1',acknowledgement:{state_id:'state1',event_id:'event1',operation_id:h.c.engine.operation.id}}];writes++;const r=await d.promise;return {...r,operation_id:p.p_operation_id};};
 const save=h.c.saveExpiryCapture();await new Promise(setImmediate);await h.c.saveExpiryCapture();assert.equal(await h.c.resolveExpiryScannedValue('U0030'),false);assert.equal(writes,1);
 d.resolve({state_id:'state1',event_id:'event1'});await save;assert.equal(h.c.engine.currentItem,null);assert.equal(h.drafts.size,0);
 await h.c.resolveExpiryScannedValue(raw);h.flush(500);assert.equal(h.c.engine.currentItem.itemCode,'ITEM1');
});
test('Post-commit refresh failure cannot invite a duplicate write',async()=>{
 const h=await scanned();h.c.console={error(){},warn(){}};h.c.refreshExpiryCurrentState=async()=>{throw new Error('display offline');};await h.c.saveExpiryCapture();
 assert.equal(h.calls.length,3);assert.equal(h.c.engine.currentItem,null);assert.equal(h.c.engine.saveUncertain,false);assert.equal(h.drafts.size,0);
});
test('Lost acknowledgement is durably locked through recovery, with no automatic replay',async()=>{
 const h=await scanned();h.c.console={error(){}};let writes=0;h.c.authRpc=async(name,p)=>{if(name.startsWith('reserve_'))return {operation_id:p.p_operation_id,status:'RESERVED'};writes++;throw new Error('network reply lost');};await h.c.saveExpiryCapture();
 assert.equal(writes,1);assert.equal(h.drafts.get('user1/isolated-test').status,'UNCERTAIN');h.c.resetExpiryCaptureForm();await h.c.restoreExpiryDraft();assert.equal(writes,1);assert.equal(h.c.engine.saveUncertain,true);
});
test('Storage failure prevents submission; empty server reply is not success',async()=>{
 const h=await scanned();h.c.console={error(){}};h.c.ExpiryDraftStore.put=async()=>{throw new Error('quota');};await h.c.saveExpiryCapture();assert.equal(h.calls.length,0);assert.equal(h.c.engine.currentItem.itemCode,'ITEM1');
 const h2=await scanned();h2.c.console={error(){}};h2.c.authRpc=async(name,p)=>name.startsWith('reserve_')?{operation_id:p.p_operation_id,status:'RESERVED'}:[];await h2.c.saveExpiryCapture();assert.equal(h2.c.engine.saveUncertain,true);assert.equal(h2.c.engine.currentItem.itemCode,'ITEM1');
});
test('Custom worker selection uses canonical dataset value and persists worker once selected',()=>{
 const h=harness(true);h.c.bindExpiryCaptureUI();h.c.setExpiryControlValue(h.e('expiryWorkerSelect'),'worker1',true);assert.equal(h.c.engine.selectedWorkerId,'worker1');
});
test('Dropdown binding and worker selection binding coexist in the real initialization order',()=>{
 const h=harness(true),worker=h.e('expiryWorkerSelect');h.c.document.querySelectorAll=selector=>selector==='#zebraExpiryShell .pfSelect'?[worker]:[];
 h.c.initExpirySelects();h.c.bindExpiryCaptureUI();h.c.setExpiryControlValue(worker,'worker1',true);
 assert.equal(worker.dataset.selectBound,'1');assert.equal(worker.dataset.workerBound,'1');assert.equal(h.c.engine.selectedWorkerId,'worker1');
});
test('Offline worker lookup retains the draft without automatically hydrating the capture',async()=>{
 const h=await scanned();await h.c.persistExpiryDraft();h.c.resetExpiryCaptureForm();h.c.engine.draftReady=false;
 assert.equal(await h.c.resolveExpiryScannedValue('U0030'),false);h.c.loadExpiryWorkers=async()=>{throw new Error('offline');};await h.c.activateExpiryCapture();
 assert.equal(h.c.engine.currentItem,null);assert.equal(h.drafts.get('user1/isolated-test').item.identifierDisplay,'04065272072977');assert.equal(h.c.engine.draftReady,false);
});
test('Known standard identifiers remain exact at the save boundary and optional manual batch survives',async()=>{
 for(const id of ['U0030','S00110','1234A','001234','04065272072977']){
  const h=harness(true);h.c.engine.selectedWorkerId='worker1';h.c.parseGS1Barcode=raw=>({identifierDisplay:raw});await h.c.resolveExpiryScannedValue(id);
  h.c.setExpiryControlValue(h.e('expiryMonth'),'7');h.c.setExpiryControlValue(h.e('expiryYear'),'2028');h.e('expiryBatchInput').value='MANUAL-LOT';await h.c.saveExpiryCapture();
  assert.equal(h.calls[1].payload.p_capture.identifier_display,id);assert.equal(h.calls[1].payload.p_capture.batch_no,'MANUAL-LOT');
 }
});
