const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {harness}=require('./expiry-capture-review.test.cjs');
test('Handheld Operator switching never reassigns an unsaved capture or pending scan',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';await h.c.resolveExpiryScannedValue('(01)04065272072977(17)270831');await h.c.persistExpiryDraft();
 h.c.selectExpiryWorker('worker2');assert.equal(h.c.engine.selectedWorkerId,'worker1');assert.equal(h.drafts.get('user1/isolated-test').workerId,'worker1');assert.match(h.e('expiryScanStatus').textContent,/before changing Operator/);
 h.c.confirm=()=>true;await h.c.clearExpiryHandheldCapture();h.c.selectExpiryWorker('worker2');assert.equal(h.c.engine.selectedWorkerId,'worker2');
 h.e('expiryBarcodeInput').value='040';h.c.selectExpiryWorker('worker1');assert.equal(h.c.engine.selectedWorkerId,'worker2');
});
test('History has no tabs and shows distinct authoritative status/details',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';const rpc=h.c.authRpc;
 h.c.authRpc=async(name,p)=>name==='list_pharmflow_expiry_session_v2'?[{operation_id:'one',pharmacy_id:'isolated-test',created_by:'user1',kind:'KNOWN',item_name:'Test',expiry_month:10,expiry_year:2026,quantity:1,identifier_display:'001234',status:'SAVED',editable:true,revision:0}]:rpc(name,p);
 await h.c.openExpiryRecentScans();const overlay=h.c.document.body.children.at(-1);
 assert.doesNotMatch(overlay.innerHTML,/role="tab"/);
 const list=overlay.querySelector('.expiryCapturedList');assert.equal(list.children.length,1);assert.match(list.children[0].children[0].children[0].children[1].textContent,/Qty 1/);
});
test('Dedicated header centers Expiry Scanning and places Operator above Scan with scroll-bounded history',()=>{
 const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('css/dashboard.css','utf8'),header=html.match(/<header class="expiryHandheldHeader[\s\S]*?<\/header>/)[0];
 assert.doesNotMatch(header,/PharmFlow/);assert.ok(header.indexOf('btnExpiryBackToModes')<header.indexOf('Expiry Scanning'));assert.ok(header.indexOf('Expiry Scanning')<header.indexOf('btnExpiryCaptured'));
 assert.match(css,/expiryHandheldHeader>div\{[^}]*text-align:center/);assert.match(css,/expiryOperatorActions\{grid-row:1/);assert.match(css,/expiryScanBox\{grid-row:2/);assert.match(css,/max-height:calc\(var\(--handheld-visible-height,100dvh\)\*\.85\)/);assert.match(css,/expiryRecentScans \.expiryCapturedList\{min-height:0;overflow-y:auto/);assert.match(css,/details\[open\] \.expiryRecentChevron\{transform:rotate\(180deg\)/);
});

test('Handheld heading and stronger Back icon change presentation only',()=>{
 const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('css/dashboard.css','utf8'),js=fs.readFileSync('js/expiry.js','utf8');
 const button=html.match(/<button id="btnExpiryBackToModes"[^]*?<\/button>/)[0];assert.match(button,/viewBox="0 0 24 24"/);assert.match(button,/stroke-width="2.75"/);assert.match(button,/<span>Back<\/span>/);assert.match(css,/#btnExpiryBackToModes svg\{width:24px;height:24px;flex:none;display:block\}/);assert.match(css,/#btnExpiryBackToModes\{display:flex;align-items:center;justify-content:center;gap:4px;padding:0 6px;font-size:14px;min-width:72px;font-weight:750\}/);assert.match(js,/modesButton.addEventListener\("click",\(\)=>\{[^]*?leaveExpiryHandheld\(\)/);
});
