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

test('Handheld dates start blank and remain mandatory; unknown scan leaves a complete capture and clean input',async()=>{
 const h=harness(true);h.c.bindExpiryCaptureUI();h.c.engine.selectedWorkerId='worker1';
 assert.equal(h.e('expiryMonth').dataset.value||'','');assert.equal(h.e('expiryYear').dataset.value||'','');
 assert.equal(h.e('expiryBarcodeInput').placeholder,'Scan Barcode');
 h.c.parseGS1Barcode=raw=>({raw});h.c.IdentifierService.resolve=async()=>({found:false});h.e('expiryBarcodeInput').value='UNKNOWN-U0030';
 await h.c.resolveExpiryScannedValue('UNKNOWN-U0030');
 assert.equal(h.e('expiryBarcodeInput').value,'');assert.equal(h.c.engine.currentItem.rawBarcode,'UNKNOWN-U0030');
 await h.c.saveExpiryCapture();assert.equal(h.calls.length,0);assert.equal(h.e('expiryScanStatus').textContent,'SELECT MONTH');
 h.c.setExpiryControlValue(h.e('expiryMonth'),'8');await h.c.saveExpiryCapture();assert.equal(h.calls.length,0);assert.equal(h.e('expiryScanStatus').textContent,'SELECT YEAR');
 const item=h.c.engine.currentItem;await h.c.resolveExpiryScannedValue('1234A');assert.equal(h.c.engine.currentItem,item);
 assert.equal(h.e('expiryScanStatus').textContent,'Save current item first');
});
test('Confirmed synthetic GS1 preserves exact GTIN, batch, serial and raw scan with no auto-save',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';let lookedUp;
 h.c.IdentifierService.resolve=async id=>{lookedUp=id;return {found:true,itemCode:'TC26-SYNTHETIC-04065272072977',itemName:'Synthetic TC26 test item 04065272072977'};};
 const raw=']d201040652720729771727083110SYNTH-BATCH\x1d21SYNTH-SERIAL';
 await h.c.resolveExpiryScannedValue(raw);
 assert.equal(lookedUp,'04065272072977');assert.equal(h.c.engine.currentItem.identifierDisplay,'04065272072977');
 assert.equal(h.c.engine.currentItem.rawBarcode,raw);assert.equal(h.c.engine.scannedGS1.lot,'SYNTH-BATCH');assert.equal(h.c.engine.scannedGS1.serial,'SYNTH-SERIAL');
 assert.equal(h.e('expiryMonth').dataset.value,'8');assert.equal(h.e('expiryYear').dataset.value,'2027');assert.equal(h.calls.length,0);
});
test('Recent history is independent of the product card, with a single accessible icon and no visible counter',()=>{
 const html=fs.readFileSync('index.html','utf8');const header=html.slice(html.indexOf('<header class="expiryHandheldHeader'),html.indexOf('<div class="expiryKpiRow'));
 assert.match(header,/id="btnExpiryCaptured"[^>]*aria-label="Recent expiry captures"/);assert.match(header,/id="expiryCapturedCount" hidden/);
 assert.equal(html.split('id="btnExpiryCaptured"').length-1,1);
 const css=fs.readFileSync('css/dashboard.css','utf8');assert.match(css,/body\.zebraDevice \.expiryCapturedDone[^}]*background:#0b5ed7/);
 assert.match(css,/is-selected:not\(\[data-value=""\]\) \.pfSelectCheck/);
});
