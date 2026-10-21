const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {harness}=require('./expiry-capture-review.test.cjs');
async function capture(unknown=false){
 const h=harness(true);h.c.console={error(){},warn(){}};h.c.engine.selectedWorkerId='worker1';
 if(unknown)h.c.IdentifierService.resolve=async()=>({found:false});
 await h.c.resolveExpiryScannedValue('5000167019391');
 h.c.setExpiryControlValue(h.e('expiryMonth'),'2');h.c.setExpiryControlValue(h.e('expiryYear'),'2027');
 h.e('expiryQuantity').value='1';h.e('expiryBatchInput').value='Sa799';return h;
}
const rejected=()=>Object.assign(new Error('Authentication session expired or revoked'),{serverRejected:true,httpStatus:400});
test('Handheld entry refreshes readiness even with a retained capture; unavailable backend gates photo/save only',async()=>{
 const h=await capture(true);h.c.engine.draftScope=h.c.expiryDraftScope();let refreshed=0;
 h.c.ExpiryReviewBackend.ready=false;h.c.ExpiryReviewBackend.refresh=async()=>{refreshed++;return false;};
 await h.c.activateExpiryCapture();assert.equal(refreshed,1);h.c.renderExpiryEvidence();
 assert.equal(h.e('btnExpiryPhoto').disabled,true);assert.equal(h.e('btnSaveExpiryCapture').disabled,true);assert.equal(h.e('btnExpiryNote').disabled,false);
 assert.match(h.e('expiryEvidenceMessage').textContent,/Needs Review unavailable/);
 h.c.ExpiryReviewBackend.ready=true;h.c.renderExpiryEvidence();assert.equal(h.e('btnExpiryPhoto').disabled,false);assert.equal(h.e('btnSaveExpiryCapture').disabled,false);assert.equal(h.e('expiryEvidenceMessage').hidden,true);
 h.c.bindExpiryEvidence();h.e('btnExpiryPhoto').click();assert.equal(h.e('expiryCameraInput').value,'');
 await h.c.saveExpiryCapture();const saved=[...h.receipts.values()][0];assert.equal(saved.kind,'UNKNOWN');assert.ok(saved.acknowledgement.review_id);assert.equal(saved.acknowledgement.state_id,undefined);
});
for(const unknown of [false,true])test(`Expired session retains ${unknown?'unknown':'recognized'} capture and ID; explicit retry reads receipt before one save`,async()=>{
 const h=await capture(unknown),rpc=h.c.authRpc;let fail=true,refreshes=0;const sequence=[];
 h.c.refreshAuthToken=async()=>{refreshes++;return true;};
 h.c.authRpc=async(name,args)=>{sequence.push(name);if(name==='save_pharmflow_expiry_session_capture_v2'&&fail)throw rejected();return rpc(name,args);};
 await h.c.saveExpiryCapture();const operation=h.c.engine.operation,id=operation.id;
 assert.equal(operation.authRecoveryRequired,true);assert.ok(operation.payload);assert.equal(h.e('expiryBatchInput').value,'Sa799');assert.equal(h.receipts.size,0);assert.equal(refreshes,1);
 assert.match(h.e('expiryScanStatus').textContent,/Session restored/);assert.equal([...h.drafts.values()][0].operation.id,id);assert.equal([...h.drafts.values()][0].operation.authRecoveryRequired,true);
 assert.equal(sequence.filter(n=>n==='save_pharmflow_expiry_session_capture_v2').length,1,'refresh never auto-replays');
 fail=false;sequence.length=0;await h.c.saveExpiryCapture();
 assert.equal(sequence[0],'list_pharmflow_expiry_capture_receipts_v1');assert.equal(h.receipts.size,1);assert.equal([...h.receipts.keys()][0],id);assert.equal(h.c.engine.currentItem,null);
 assert.equal([...h.receipts.values()][0].quantity,1);assert.equal([...h.receipts.values()][0].batch_no,'Sa799');
});
test('An existing verified receipt completes retained capture without sending another write',async()=>{
 const h=await capture(),rpc=h.c.authRpc;h.c.refreshAuthToken=async()=>false;
 h.c.authRpc=async(name,args)=>{if(name==='save_pharmflow_expiry_session_capture_v2')throw rejected();return rpc(name,args);};
 await h.c.saveExpiryCapture();const op=h.c.engine.operation;
 await rpc('save_pharmflow_expiry_session_capture_v2',{p_operation_id:op.id,p_pharmacy_id:op.pharmacyId,p_session_id:op.sessionId,p_capture:op.payload});
 let writes=0;h.c.authRpc=async(name,args)=>{if(name.startsWith('save_'))writes++;return rpc(name,args);};
 await h.c.saveExpiryCapture();assert.equal(writes,0);assert.equal(h.receipts.size,1);assert.equal(h.c.engine.currentItem,null);
});
test('Receipt failure or scope switch cannot replay a retained operation',async()=>{
 for(const mode of ['network','scope']){
  const h=await capture(),rpc=h.c.authRpc;h.c.refreshAuthToken=async()=>false;
  h.c.authRpc=async(name,args)=>{if(name==='save_pharmflow_expiry_session_capture_v2')throw rejected();return rpc(name,args);};
  await h.c.saveExpiryCapture();let writes=0;
  h.c.authRpc=async(name,args)=>{if(name==='list_pharmflow_expiry_capture_receipts_v1'){if(mode==='network')throw Error('offline');h.c.AuthState.context.pharmacy_id='other-pharmacy';return [];}if(name.startsWith('save_'))writes++;return rpc(name,args);};
  await h.c.saveExpiryCapture();assert.equal(writes,0);assert.ok(h.c.engine.currentItem);assert.equal(h.receipts.size,0);
 }
});
test('Authentication failure before submission keeps the original ID and can recover explicitly',async()=>{
 const h=await capture(),rpc=h.c.authRpc;h.c.refreshAuthToken=async()=>false;
 h.c.authRpc=async(name,args)=>{if(name==='get_pharmflow_expiry_auth_session_v1')throw rejected();return rpc(name,args);};
 await h.c.saveExpiryCapture();const id=h.c.engine.operation.id;assert.equal(h.c.engine.saveUncertain,false);assert.match(h.e('expiryScanStatus').textContent,/Session expired/);assert.equal(h.e('btnSaveExpiryCapture').disabled,false);
 h.c.authRpc=rpc;await h.c.saveExpiryCapture();assert.equal([...h.receipts.keys()][0],id);assert.equal(h.receipts.size,1);
});
test('TC26 compact rules retain 44px controls and normal-flow save; shared scanner and Receiving files stay outside this fix',()=>{
 const css=fs.readFileSync('css/dashboard.css','utf8'),patch=css.slice(css.indexOf('/* Short Handheld viewport'));
 assert.match(patch,/@media \(min-width:340px\)/);assert.match(patch,/position:static;bottom:auto/);assert.match(patch,/min-width:44px/);assert.match(patch,/expirySerialField\{grid-column:3;grid-row:2\}/);
 assert.doesNotMatch(patch,/overflow:\s*hidden|overflow-y:\s*hidden|font-size|display:none/);
});
test('A revoked signed session uses the existing sign-in recovery after persisting capture, without automatic replay',async()=>{
 const h=await capture(),rpc=h.c.authRpc;let recovery=0;
 h.c.AuthState.session={refresh_token:'synthetic-only'};
 h.c.clearRejectedAuthSession=token=>{assert.equal(token,'synthetic-only');assert.equal([...h.drafts.values()][0].status,'AUTH_REQUIRED');assert.ok([...h.drafts.values()][0].operation.payload);recovery++;};
 h.c.authRpc=async(name,args)=>{if(name==='save_pharmflow_expiry_session_capture_v2')throw rejected();return rpc(name,args);};
 await h.c.saveExpiryCapture();assert.equal(recovery,1);assert.match(h.e('expiryScanStatus').textContent,/Session expired\. Sign in again/);assert.equal(h.receipts.size,0);
});
