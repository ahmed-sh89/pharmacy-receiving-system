const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./expiry-capture-review.test.cjs');
function camera(){const h=harness(true);h.c.ExpiryReviewBackend={ready:true};h.c.engine.selectedWorkerId='worker1';h.c.engine.currentItem={identifierDisplay:'U0030',rawBarcode:'U0030',needsReview:true};h.c.bindExpiryEvidence();h.c.renderExpiryEvidence();return h;}
async function take(h,file){h.e('expiryCameraInput').files=[file];for(const fn of h.e('expiryCameraInput').listeners.change)await fn();}
test('One Take Photo creates one evidence image and one Submit for Review action',async()=>{
 const h=camera(),evidence=new Blob(['evidence'],{type:'image/jpeg'});
 h.e('btnExpiryPhoto').click();await take(h,evidence);assert.equal(h.e('btnExpiryPhoto').hidden,true);assert.equal(h.e('expiryEvidencePreviews').children.length,1);
 assert.equal(await h.c.engine.reviewPhotos.evidence.text(),'evidence');assert.equal(h.e('btnSaveExpiryCapture').textContent,'SUBMIT FOR REVIEW');
 assert.equal(h.e('btnExpiryRetakeProduct'),undefined);assert.equal(h.e('btnExpiryRetakeExpiry'),undefined);
});
test('Draft recovery restores one evidence preview and exact bytes',async()=>{
 const h=camera();h.e('btnExpiryPhoto').click();await take(h,new Blob(['persisted evidence'],{type:'image/jpeg'}));await h.c.persistExpiryDraft('DRAFT');
 h.c.resetExpiryCaptureForm();await h.c.restoreExpiryDraft();assert.equal(h.c.engine.selectedWorkerId,'worker1');assert.equal(h.e('expiryEvidencePreviews').children.length,1);assert.equal(await h.c.engine.reviewPhotos.evidence.text(),'persisted evidence');
});
test('Invalid camera photo does not create or replace evidence',async()=>{
 const h=camera();h.e('btnExpiryPhoto').click();await take(h,new Blob(['bad'],{type:'text/plain'}));assert.equal(h.c.engine.reviewPhotos.evidence,null);
});
test('Operation Web Lock rejects another tab until the first releases ownership',async()=>{
 const held=new Set(),locks={request:async(id,opts,callback)=>{
  if(held.has(id))return callback(null);held.add(id);try{return await callback({name:id});}finally{held.delete(id);}
 }};
 const a=harness(true),b=harness(true);a.c.navigator={locks};b.c.navigator={locks};
 await a.c.claimExpiryOperation('operation1');await assert.rejects(b.c.claimExpiryOperation('operation1'),/another tab/);
 a.c.releaseExpiryOperation();await new Promise(setImmediate);await b.c.claimExpiryOperation('operation1');b.c.releaseExpiryOperation();
});
test('Worker selection persists once per user/pharmacy session and does not transfer across users',async()=>{
 const h=harness(true),session=new Map();h.c.sessionStorage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
 h.c.selectExpiryWorker('worker1');h.c.engine.selectedWorkerId='';h.c.authRpc=async()=>[{worker_id:'worker1',worker_name:'One'},{worker_id:'worker2',worker_name:'Two'}];await h.c.loadExpiryWorkers();assert.equal(h.c.engine.selectedWorkerId,'worker1');
 h.c.AuthState.user.id='other-user';await h.c.loadExpiryWorkers();assert.equal(h.c.engine.selectedWorkerId,'');
});
