const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {harness}=require('./expiry-capture-review.test.cjs');
test('Handheld Operator switching never reassigns an unsaved capture or pending scan',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';await h.c.resolveExpiryScannedValue('(01)04065272072977(17)270831');await h.c.persistExpiryDraft();
 h.c.selectExpiryWorker('worker2');assert.equal(h.c.engine.selectedWorkerId,'worker1');assert.equal(h.drafts.get('user1/isolated-test').workerId,'worker1');assert.match(h.e('expiryScanStatus').textContent,/before changing Operator/);
 h.c.confirm=()=>true;await h.c.clearExpiryHandheldCapture();h.c.selectExpiryWorker('worker2');assert.equal(h.c.engine.selectedWorkerId,'worker2');
 h.e('expiryBarcodeInput').value='040';h.c.selectExpiryWorker('worker1');assert.equal(h.c.engine.selectedWorkerId,'worker2');
});
test('Normal recent rows use explicit chevrons without a redundant collapsed Saved badge; unknown status remains',async()=>{
 const h=harness(true);h.c.loadExpirySessionReceipts=async()=>[{operation_id:'one',kind:'KNOWN',item_name:'Test',operator_name:'Original Operator',expiry_month:10,expiry_year:2026,quantity:1,identifier_display:'001234',status:'SAVED'},{operation_id:'two',kind:'UNKNOWN',status:'PENDING',operator_name:'Other Operator',expiry_month:10,expiry_year:2026,quantity:1,identifier_display:'U0030'}];
 await h.c.openExpiryRecentScans();const markup=h.c.document.body.children.at(-1).innerHTML;
 const summaries=[...markup.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map(m=>m[1]);assert.equal(summaries.length,2);assert.match(summaries[0],/expiryRecentChevron/);assert.doesNotMatch(summaries[0],/Saved|SAVED|expiryHistoryViewOnly/);assert.match(summaries[1],/PENDING/);assert.match(summaries[0],/Original Operator/);assert.doesNotMatch(markup,/data-edit|data-delete/);
});
test('Dedicated header centers Expiry Capture and places Operator above Scan with scroll-bounded history',()=>{
 const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('css/dashboard.css','utf8'),header=html.match(/<header class="expiryHandheldHeader[\s\S]*?<\/header>/)[0];
 assert.doesNotMatch(header,/PharmFlow/);assert.ok(header.indexOf('btnExpiryBackToModes')<header.indexOf('Expiry Capture'));assert.ok(header.indexOf('Expiry Capture')<header.indexOf('btnExpiryCaptured'));
 assert.match(css,/expiryHandheldHeader>div\{[^}]*text-align:center/);assert.match(css,/expiryOperatorActions\{grid-row:1/);assert.match(css,/expiryScanBox\{grid-row:2/);assert.match(css,/max-height:85dvh/);assert.match(css,/expiryRecentScans \.expiryCapturedList\{min-height:0;overflow-y:auto/);assert.match(css,/details\[open\] \.expiryRecentChevron\{transform:rotate\(180deg\)/);
});
