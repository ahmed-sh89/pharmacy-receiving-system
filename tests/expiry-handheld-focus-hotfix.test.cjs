const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {harness}=require('./expiry-capture-review.test.cjs');
async function prepare(unknown=false){const h=harness(true);h.c.engine.selectedWorkerId='worker1';if(unknown)h.c.IdentifierService.resolve=async()=>({found:false});await h.c.resolveExpiryScannedValue('5000167019391');h.e('expiryQuantity').value='2';return h;}
test('Both required date failures are red, highlight the missing control and preserve the capture',async()=>{
 const h=await prepare(),item=h.c.engine.currentItem;
 await h.c.saveExpiryCapture();assert.equal(h.e('expiryScanStatus').textContent,'Select expiry month');assert.match(h.e('expiryScanStatus').className,/\berror\b/);assert.ok(h.e('expiryMonth').classList.contains('expiryFieldError'));
 h.c.setExpiryControlValue(h.e('expiryMonth'),'2');await h.c.saveExpiryCapture();assert.equal(h.e('expiryScanStatus').textContent,'Select expiry year');assert.match(h.e('expiryScanStatus').className,/\berror\b/);assert.ok(h.e('expiryYear').classList.contains('expiryFieldError'));assert.equal(h.c.engine.currentItem,item);assert.equal(h.receipts.size,0);
});
for(const unknown of [false,true])test(`Committed ${unknown?'unknown':'known'} saves restore scanner focus after final rendering, with consecutive scans`,async()=>{
 const h=await prepare(unknown),render=h.c.renderExpiryEvidence;let finalRender=false;
 h.c.renderExpiryEvidence=()=>{render();if(!h.c.engine.busy&&!h.c.engine.currentItem)finalRender=true;};
 const input=h.e('expiryBarcodeInput'),focus=input.focus.bind(input);let focused=0;input.focus=()=>{assert.equal(h.c.engine.busy,false);assert.equal(h.c.engine.currentItem,null);assert.equal(finalRender,true);focused++;focus();};
 for(let n=0;n<3;n++){
  if(n)await h.c.resolveExpiryScannedValue('500016701939'+n);
  h.c.setExpiryControlValue(h.e('expiryMonth'),'2');h.c.setExpiryControlValue(h.e('expiryYear'),'2027');h.e('expiryQuantity').value='2';h.e('expiryBatchInput').focus();finalRender=false;
  await h.c.saveExpiryCapture();assert.equal(h.c.document.activeElement,input);assert.equal(input.inputmode,'none');assert.equal(h.receipts.size,n+1);
 }
 assert.equal(focused,3);
});
test('Rejected save retains capture and operation without stealing editing focus',async()=>{
 const h=await prepare(),rpc=h.c.authRpc;h.c.console={error(){}};h.c.setExpiryControlValue(h.e('expiryMonth'),'2');h.c.setExpiryControlValue(h.e('expiryYear'),'2027');h.e('expiryBatchInput').value='RETAIN';h.e('expiryBatchInput').focus();
 h.c.authRpc=async(name,args)=>{if(name==='save_pharmflow_expiry_session_capture_v2')throw Object.assign(Error('invalid capture'),{serverRejected:true});return rpc(name,args);};
 await h.c.saveExpiryCapture();assert.ok(h.c.engine.currentItem);assert.ok(h.c.engine.operation.id);assert.equal(h.c.document.activeElement,h.e('expiryBatchInput'));assert.equal(h.e('expiryBatchInput').value,'RETAIN');assert.equal(h.receipts.size,0);
});
test('Batch and scanner presentation changes are Handheld scoped and preserve the existing markup/input contract',()=>{
 const css=fs.readFileSync('css/dashboard.css','utf8').split('/* Handheld capture: primary scanner')[1],html=fs.readFileSync('index.html','utf8');
 assert.match(css,/\.expiryScanBox\{background:#eef4ff\}/);assert.match(css,/grid-template-columns:auto minmax\(0,1fr\)/);assert.match(css,/border-right:1px solid #dbe3ed/);assert.match(css,/#expiryBatchInput\{[^}]*background:#fff/);
 for(const rule of css.trim().split('}').filter(s=>s.trim()))assert.match(rule,/body\.zebraDevice #zebraExpiryShell/);
 assert.equal((html.match(/id="expiryBatchInput"/g)||[]).length,1);
});
