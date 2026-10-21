const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {harness}=require('./expiry-capture-review.test.cjs');
const scanner=fs.readFileSync('js/scanner.js','utf8');
const clean=scanner.slice(scanner.indexOf('function cleanScannerInput('),scanner.indexOf('/* =====================================================\n   GS1 PARSER',scanner.indexOf('function cleanScannerInput(')));
const context={toSafeString:v=>String(v??'')};vm.createContext(context);vm.runInContext(clean,context);
vm.runInContext(fs.readFileSync('js/expiry-operation.js','utf8')+';globalThis.api=ExpiryOperation;',context);
const raw='01040652720729771731020010Ab12cD45\x1d21SERIAL1';
test('Expiry Batch validation detects full supported GS1 frames without changing parser facts',()=>{
 for(const s of [raw,']C1'+raw,']d2'+raw,']Q3'+raw,raw.replace('\x1d','~'),raw.replace('\x1d','<gs>'),raw.replace('\x1d','\\u001d'),raw.replace('\x1d','\u241d'),'(01)04065272072977(17)310200(10)Ab12cD45',']C10105000167019391~10SA799~21~17270200'])assert.equal(context.api.batchIsScannerPayload(s),true,s);
 assert.equal(context.api.scanFacts(raw)['10'],'Ab12cD45');
 for(const s of ['',null,'Ab12cD45','0'.repeat(90),'LongAb12'.repeat(15),'SERIAL-123456789012345678901234567890','0101234567890123'])assert.equal(context.api.batchIsScannerPayload(s),false,s);
});
for(const handheld of [false,true])test(`${handheld?'Handheld':'Desktop'} accidental Batch scan blocks before operation/save and preserves fields`,async()=>{
 const h=harness(handheld);h.c.engine.selectedWorkerId='worker1';await h.c.resolveExpiryScannedValue('5000167019391');
 h.c.setExpiryControlValue(h.e('expiryMonth'),'2');h.c.setExpiryControlValue(h.e('expiryYear'),'2031');h.e('expiryQuantity').value='2';h.e('expiryBatchInput').value=raw;
 const item=h.c.engine.currentItem,operation=h.c.engine.operation;h.e('expiryBatchInput').focus();await h.c.saveExpiryCapture();
 assert.equal(h.receipts.size,0);assert.equal(h.c.engine.operation,operation);assert.equal(h.c.engine.currentItem,item);assert.equal(h.e('expiryBatchInput').value,raw);
 assert.match(h.e('expiryScanStatus').textContent,/Use Scan Barcode, not Batch/);assert.equal(h.e('expiryBatchInput')['aria-invalid'],'true');assert.equal(h.c.document.activeElement,h.e('expiryBatchInput'));
 h.e('expiryBatchInput').value='LongAb12'.repeat(15);await h.c.saveExpiryCapture();assert.equal(h.receipts.size,1);assert.equal([...h.receipts.values()][0].batch_no,'LongAb12'.repeat(15));
});
test('GS1 extracted Batch casing is submitted exactly, not normalized',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';h.c.parseGS1Barcode=()=>({gtin:'04065272072977',identifierDisplay:'04065272072977',lot:'Ab12cD45',serial:'SERIAL1',expiry:'2031-02-28'});
 await h.c.resolveExpiryScannedValue('(01)04065272072977(17)310200(10)Ab12cD45(21)SERIAL1');h.e('expiryQuantity').value='1';await h.c.saveExpiryCapture();
 assert.equal(h.receipts.size,1);assert.equal([...h.receipts.values()][0].batch_no,'Ab12cD45');
});
test('Session group display uses its first original contribution, preserving member history',()=>{
 const source=fs.readFileSync('js/expiry-desktop-v2.js','utf8');const start=source.indexOf('  function sessionGroups() {'),end=source.indexOf('\n  const inventoryIcon',start);
 const rows=[{operation_id:'later',effective_state_id:'same',batch_no:'ab12cd45',quantity:1,captured_at:'2030-01-02T00:00:00Z'},{operation_id:'first',effective_state_id:'same',batch_no:'Ab12cD45',quantity:1,captured_at:'2030-01-01T00:00:00Z'}];
 const c={currentRows:()=>rows,groupKey:r=>r.effective_state_id,qty:r=>r.quantity};vm.createContext(c);vm.runInContext(source.slice(start,end)+';globalThis.groups=sessionGroups();',c);
 assert.equal(c.groups.length,1);assert.equal(c.groups[0].quantity,2);assert.equal(c.groups[0].batch_no,'Ab12cD45');assert.equal(rows[0].batch_no,'ab12cd45');
});
