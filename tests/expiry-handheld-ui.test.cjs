const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const postcss=require('postcss');
const {harness}=require('./expiry-capture-review.test.cjs');
test('Handheld quantity controls bind once, respect capture lock and retain integer floor',()=>{
 const h=harness(true);h.c.bindExpiryCaptureUI();h.c.bindExpiryCaptureUI();
 h.c.engine.currentItem={identifierDisplay:'U0030',rawBarcode:'U0030'};
 h.e('expiryQuantity').value='1';h.e('btnExpiryQtyPlus').click();assert.equal(h.e('expiryQuantity').value,'2');
 h.e('btnExpiryQtyMinus').click();h.e('btnExpiryQtyMinus').click();assert.equal(h.e('expiryQuantity').value,'1');
 h.c.engine.busy=true;h.e('btnExpiryQtyPlus').click();assert.equal(h.e('expiryQuantity').value,'1');
 assert.equal(h.e('expiryBarcodeInput').inputmode,'none','Scanner must keep the existing hardware keyboard mode');
});
test('Handheld presentation parses and retains one instance of controls and live feedback',()=>{
 const html=fs.readFileSync('index.html','utf8');
 for(const id of ['expiryScanStatus','expiryBarcodeInput','expiryQuantity','btnExpiryQtyMinus','btnExpiryQtyPlus','expiryCameraInput'])assert.equal(html.split(`id="${id}"`).length-1,1);
 assert.match(html,/id="expiryBarcodeInput"[^>]*inputmode="none"/);
 assert.doesNotMatch(html,/<details class="expiryBatchDisclosure"/,'Shared Desktop fields must not acquire a closed disclosure');
 assert.doesNotThrow(()=>postcss.parse(fs.readFileSync('css/dashboard.css','utf8')));
});
