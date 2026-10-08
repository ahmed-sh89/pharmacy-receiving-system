const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./expiry-capture-review.test.cjs');
function camera(){const h=harness(true);h.c.engine.selectedWorkerId='worker1';h.c.engine.currentItem={identifierDisplay:'U0030',rawBarcode:'U0030',needsReview:true};h.c.bindExpiryEvidence();h.c.renderExpiryEvidence();return h;}
async function take(h,file){h.e('expiryCameraInput').files=[file];for(const fn of h.e('expiryCameraInput').listeners.change)await fn();}
test('One camera proceeds product → expiry → review, cancellation preserves draft, retake changes one role',async()=>{
 const h=camera(),product=new Blob(['p1'],{type:'image/jpeg'}),expiry=new Blob(['e1'],{type:'image/jpeg'});
 assert.equal(h.e('btnExpiryPhoto').textContent,'PRODUCT PHOTO');h.e('btnExpiryPhoto').click();await take(h,product);assert.equal(h.e('btnExpiryPhoto').textContent,'EXPIRY PHOTO');
 h.e('btnExpiryPhoto').click();await take(h,expiry);assert.equal(h.e('btnExpiryPhoto').hidden,true);assert.equal(h.e('expiryEvidencePreviews').children.length,2);
 await take(h,undefined);assert.equal(await h.c.engine.reviewPhotos.expiry.text(),'e1');
 h.e('btnExpiryRetakeProduct').click();await take(h,new Blob(['p2'],{type:'image/jpeg'}));assert.equal(await h.c.engine.reviewPhotos.product.text(),'p2');assert.equal(await h.c.engine.reviewPhotos.expiry.text(),'e1');assert.equal(h.c.document.activeElement.id,'expiryBarcodeInput');
});
test('Submitted photos cannot be retaken; draft recovery restores two previews and selected worker',async()=>{
 const h=camera();h.e('btnExpiryPhoto').click();await take(h,new Blob(['p'],{type:'image/jpeg'}));h.e('btnExpiryPhoto').click();await take(h,new Blob(['e'],{type:'image/jpeg'}));await h.c.persistExpiryDraft('UNCERTAIN');
 h.c.resetExpiryCaptureForm();await h.c.restoreExpiryDraft();assert.equal(h.c.engine.selectedWorkerId,'worker1');assert.equal(h.e('expiryEvidencePreviews').children.length,2);assert.equal(h.e('btnExpiryRetakeProduct').disabled,true);
 await assert.rejects(h.c.setExpiryEvidencePhoto('expiry',new Blob(['changed'],{type:'image/jpeg'})),/editable/);
});
test('Invalid camera photo never erases the existing role',async()=>{
 const h=camera();h.e('btnExpiryPhoto').click();await take(h,new Blob(['p'],{type:'image/jpeg'}));h.e('btnExpiryRetakeProduct').click();await take(h,new Blob(['bad'],{type:'text/plain'}));assert.equal(await h.c.engine.reviewPhotos.product.text(),'p');
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
