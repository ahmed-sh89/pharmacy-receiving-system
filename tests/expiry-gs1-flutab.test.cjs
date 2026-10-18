const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {harness}=require('./expiry-capture-review.test.cjs');
const GS=String.fromCharCode(29),GTIN='06281086107829',LOT='03077',SERIAL='8ROPSYDT0SS50';
const DOMPY_GTIN='06285128000307',DOMPY_LOT='DA0115',DOMPY_SERIAL='2075594108384';
const raw='01'+GTIN+'1730021810'+LOT+GS+'21'+SERIAL;
function runtime(handheld=true){const h=harness(handheld);vm.runInContext(fs.readFileSync('js/utils.js','utf8')+fs.readFileSync('js/scanner.js','utf8')+'\nthis.strictScanFacts=ExpiryOperation.scanFacts;',h.c);h.c.resetExpiryCaptureForm();h.c.engine.selectedWorkerId='worker1';return h;}
function check(f){assert.equal(f.format,'GS1');assert.equal(f.identifier,GTIN);assert.equal(f['10'],LOT);assert.equal(f['17'],'300218');assert.equal(f['21'],SERIAL);}
test('Exact FLUTAB ASCII-29 fixture extracts four independent fields through the real canonical parser and Expiry adapter',()=>{const h=runtime();check(h.c.strictScanFacts(raw));const shared=h.c.parseGS1Barcode(raw);assert.equal(shared.gtin,GTIN);assert.equal(shared.lot,LOT);assert.equal(shared.expiry,'2030-02-18');assert.equal(shared.serial,SERIAL);});
for(const prefix of [']d2',']C1',']Q3'])test('Supported AIM prefix '+prefix+' and alternative AI ordering',()=>{const h=runtime();check(h.c.strictScanFacts(prefix+'1730021821'+SERIAL+GS+'01'+GTIN+'10'+LOT));});
for(const scan of ['1730021801'+GTIN+'10'+LOT+GS+'21'+SERIAL,'10'+LOT+GS+'1730021801'+GTIN+'21'+SERIAL,'21'+SERIAL+GS+'01'+GTIN+'1730021810'+LOT,'(21)'+SERIAL+'(10)'+LOT+'(17)300218(01)'+GTIN])test('Valid reordered fixed and delimited variable fields stay independent',()=>check(runtime().c.strictScanFacts(scan)));
test('A lot or serial containing digits 21 is never split without a delimiter',()=>{const h=runtime();let f=h.c.strictScanFacts('01'+GTIN+'10LOT21ABC'+GS+'21SER21XYZ');assert.equal(f['10'],'LOT21ABC');assert.equal(f['21'],'SER21XYZ');f=h.c.strictScanFacts('01'+GTIN+'10LOT21ABC');assert.equal(f['10'],'LOT21ABC');assert.equal(f['21'],undefined);});
test('Missing GS never invents serial; exact terminal batch/context is retained',()=>{const h=runtime(),f=h.c.strictScanFacts(raw.replace(GS,''));assert.equal(f.identifier,GTIN);assert.equal(f['10'],LOT+'21'+SERIAL);assert.equal(f['21'],undefined);});
test('Malformed separator, duplicate AI, incomplete GS1 and impossible expiry fail closed',()=>{const h=runtime();for(const scan of [raw.replace(GS,'\u0000'),']d2011234','(01)1234','(01)'+GTIN+'(10)A(10)B','01'+GTIN+'17301318','01'+GTIN+'17300230',']d201'+GTIN+'99BAD'])assert.throws(()=>h.c.strictScanFacts(scan),/GS1/);assert.equal(h.c.strictScanFacts('01'+GTIN+'17300200')['17'],'300200');});
for(const id of [GTIN,'U0030','S00110','1234A','BT 122585','001234'])test('Plain identifier '+id+' remains exact and manually dated',async()=>{const h=runtime();const seen=[];h.c.IdentifierService.resolve=async id=>{seen.push(id);return {found:true,itemCode:'SYNTHETIC',itemName:'Synthetic'};};await h.c.resolveExpiryScannedValue(id);assert.equal(seen[0],id);assert.equal(h.c.engine.currentItem.rawBarcode,id);assert.equal(h.c.engine.scannedGS1.lot,'');assert.equal(h.c.engine.scannedGS1.serial,'');assert.equal(h.e('expiryMonth').dataset.value,'');assert.equal(h.e('expiryYear').dataset.value,'');assert.equal(h.calls.length,0);});
for(const handheld of [true,false])for(const found of [true,false])test((handheld?'Handheld':'Desktop')+' '+(found?'recognized':'Needs Review')+' populates FLUTAB fields with exact V2 lookup and no inventory write',async()=>{const h=runtime(handheld),lookups=[];h.c.IdentifierService.resolve=async id=>{lookups.push(id);return found?{found:true,itemCode:'SYNTHETIC-FLUTAB',itemName:'Synthetic test item'}:{found:false};};assert.equal(await h.c.resolveExpiryScannedValue(raw),true);assert.deepEqual(lookups,[GTIN]);assert.equal(h.e('expiryBatchInput').value,LOT);assert.equal(h.e('expirySerialInput').value,SERIAL);if(handheld){assert.equal(h.e('expiryBatchInput').readOnly,true);assert.equal(h.e('expirySerialInput').readOnly,true);}assert.equal(h.e('expiryMonth').dataset.value,'2');assert.equal(h.e('expiryYear').dataset.value,'2030');assert.equal(h.c.engine.currentItem.needsReview===true,!found);assert.equal(h.c.engine.currentItem.rawBarcode,raw);assert.equal(h.e('expiryBarcodeInput').value,'');assert.equal(h.calls.length,0);if(handheld){await h.c.persistExpiryDraft();assert.equal(h.drafts.get('user1/isolated-test').gs1.serial,SERIAL);assert.equal(h.drafts.get('user1/isolated-test').batch,LOT);}});
test('Handheld ordinary scan retains editable Batch and provides no Serial value or field',async()=>{const h=runtime(true);await h.c.resolveExpiryScannedValue('U0030');assert.equal(h.e('expiryBatchInput').readOnly,false);assert.equal(h.e('expirySerialInput').value,'');assert.equal(h.e('expirySerialInput').readOnly,false);assert.match(fs.readFileSync('index.html','utf8'),/class="expiryReviewField expirySerialField"/);assert.match(fs.readFileSync('js/expiry.js','utf8'),/serialField\.hidden=expiryIsHandheld\(\)/);});
test('Save-boundary payload retains separated batch/serial and exact raw scan through existing operation contracts (mock server only)',async()=>{const h=runtime();await h.c.resolveExpiryScannedValue(raw);await h.c.saveExpiryCapture();const p=h.calls.find(c=>['save_pharmflow_expiry_capture_v3','save_pharmflow_expiry_session_capture_v2','save_pharmflow_expiry_desktop_capture_v1'].includes(c.name)).payload.p_capture;assert.equal(p.raw_scan,raw);assert.equal(p.identifier_display,GTIN);assert.equal(p.batch_no,LOT);assert.equal(p.sample_serial,SERIAL);assert.equal(p.expiry_month,2);assert.equal(p.expiry_year,2030);});
const dompyRaw='01'+DOMPY_GTIN+'17290131'+'10'+DOMPY_LOT+GS+'21'+DOMPY_SERIAL;
function checkDompy(f){assert.equal(f.identifier,DOMPY_GTIN);assert.equal(f['10'],DOMPY_LOT);assert.equal(f['21'],DOMPY_SERIAL);assert.equal(f['17'],'290131');}
for(const scan of [dompyRaw,']d2'+dompyRaw,'(01)'+DOMPY_GTIN+'(17)290131(10)'+DOMPY_LOT+'(21)'+DOMPY_SERIAL,'21'+DOMPY_SERIAL+GS+'10'+DOMPY_LOT+GS+'01'+DOMPY_GTIN+'17290131'])test('Dompy fixture survives scanner frame '+JSON.stringify(scan.slice(0,9)),async()=>{const h=runtime();checkDompy(h.c.strictScanFacts(scan));});
for(const handheld of [true,false])test('Dompy GS1 resolves exact identifier and Batch, Serial, expiry on '+(handheld?'Handheld':'Desktop'),async()=>{const h=runtime(handheld),seen=[];h.c.IdentifierService.resolve=async id=>{seen.push(id);return {found:true,itemCode:'1012686',itemName:'Dompy'};};assert.equal(await h.c.resolveExpiryScannedValue(dompyRaw),true);assert.deepEqual(seen,[DOMPY_GTIN]);assert.equal(h.e('expiryBatchInput').value,DOMPY_LOT);assert.equal(h.e('expirySerialInput').value,DOMPY_SERIAL);assert.equal(h.e('expiryMonth').dataset.value,'1');assert.equal(h.e('expiryYear').dataset.value,'2029');});
test('Dompy Handheld Serial remains exact through save payload and authoritative receipt readback',async()=>{const h=runtime(true);h.c.IdentifierService.resolve=async()=>({found:true,itemCode:'1012686',itemName:'Dompy'});await h.c.resolveExpiryScannedValue(dompyRaw);await h.c.saveExpiryCapture();const call=h.calls.find(c=>['save_pharmflow_expiry_capture_v3','save_pharmflow_expiry_session_capture_v2','save_pharmflow_expiry_desktop_capture_v1'].includes(c.name));const payload=call.payload.p_capture;assert.equal(payload.identifier_display,DOMPY_GTIN);assert.equal(payload.batch_no,DOMPY_LOT);assert.equal(payload.sample_serial,DOMPY_SERIAL);assert.equal(payload.raw_scan,dompyRaw);const receipt=[...h.receipts.values()][0];assert.equal(receipt.sample_serial,DOMPY_SERIAL);assert.equal(receipt.batch_no,DOMPY_LOT);});
test('Malformed GS1 leaves input context intact and invokes neither lookup nor save',async()=>{const h=runtime();let calls=0;h.c.IdentifierService.resolve=async()=>{calls++;};h.e('expiryBarcodeInput').value=']d2011234';assert.equal(await h.c.resolveExpiryScannedValue(h.e('expiryBarcodeInput').value),false);assert.equal(h.e('expiryBarcodeInput').value,']d2011234');assert.equal(h.c.engine.currentItem,null);assert.equal(h.c.engine.resolving,false);assert.equal(calls,0);assert.equal(h.calls.length,0);});

// SYNTHETIC AI11 cases: physical metadata establishes the prefix, not values.
const AI11_GTIN='00123456789012',AI11_BATCH='000ABC',AI11_SERIAL='000123ABC4567';
const ai11Raw='01'+AI11_GTIN+'10'+AI11_BATCH+GS+'11251231'+'17300531'+'21'+AI11_SERIAL;
function checkAI11(f){assert.equal(f.identifier,AI11_GTIN);assert.equal(f['10'],AI11_BATCH);assert.equal(f['11'],'251231');assert.equal(f['17'],'300531');assert.equal(f['21'],AI11_SERIAL);}
for(const scan of [ai11Raw,']d2'+ai11Raw,']C1'+ai11Raw,']Q3'+ai11Raw,
 '01'+AI11_GTIN+'112512311730053110'+AI11_BATCH+GS+'21'+AI11_SERIAL,
 '112512311730053101'+AI11_GTIN+'10'+AI11_BATCH+GS+'21'+AI11_SERIAL,
 '21'+AI11_SERIAL+GS+'10'+AI11_BATCH+GS+'1125123101'+AI11_GTIN+'17300531',
 '(11)251231(01)'+AI11_GTIN+'(10)'+AI11_BATCH+'(21)'+AI11_SERIAL+'(17)300531'
])test('Validated AI11 stays distinct from AI17 with exact fields and valid framing/order',()=>checkAI11(runtime().c.strictScanFacts(scan)));
test('Synthetic 56-character GS24/AI11-at25 envelope now passes only after validating every element',()=>{
 assert.equal(ai11Raw.length,56);assert.equal(ai11Raw.indexOf(GS),24);assert.equal(ai11Raw.slice(25,27),'11');checkAI11(runtime().c.strictScanFacts(ai11Raw));
});
test('Every permutation of five supported AIs preserves exact fields, with only actual variable boundaries',()=>{
 const values={'01':AI11_GTIN,'10':AI11_BATCH,'11':'251231','17':'300531','21':AI11_SERIAL};
 function permutations(xs){return xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map(t=>[x,...t])):[[]];}
 for(const order of permutations(Object.keys(values))){const scan=order.map((ai,i)=>ai+values[ai]+(['10','21'].includes(ai)&&i<order.length-1?GS:'')).join('');checkAI11(runtime().c.strictScanFacts(scan));}
});
for(const date of ['250000','251301','250231','250229','250431','251232','251200','000200'])test('AI11 invalid/incomplete production date '+date+' rejects before lookup/save',async()=>{
 const h=runtime();let lookups=0;h.c.IdentifierService.resolve=async()=>{lookups++;return {found:true};};const scan=ai11Raw.replace('251231',date);
 assert.throws(()=>h.c.strictScanFacts(scan),/production date/);assert.equal(await h.c.resolveExpiryScannedValue(scan),false);assert.equal(lookups,0);assert.equal(h.calls.length,0);
});
for(const date of ['240229','000229','250228','251231'])test('AI11 valid calendar including leap days '+date,()=>assert.equal(runtime().c.strictScanFacts(ai11Raw.replace('251231',date))['11'],date));
for(const scan of ['(01)'+AI11_GTIN+'(11)25123(17)300531','01'+AI11_GTIN+'1125123',
 '01'+AI11_GTIN+'1125A23117300531','01'+AI11_GTIN+'1125'+GS+'17300531',
 '(01)'+AI11_GTIN+'(11)2512317(17)300531','01'+AI11_GTIN+'112512311125123117300531',
 '01'+AI11_GTIN+'1125123117','01'+AI11_GTIN+'1125123117301331',
 '01'+AI11_GTIN+'1125123191NOT-SUPPORTED17300531',
 '01'+AI11_GTIN+'10'+AI11_BATCH+'112512311730053121'+AI11_SERIAL,
 ai11Raw.replace(GS,'\x00')])test('Malformed, duplicate, missing-boundary or unsupported AI11 context rejects',()=>assert.throws(()=>runtime().c.strictScanFacts(scan),/GS1/));
test('Production date cannot supply missing required Expiry AI17; old manual-date paths are preserved',()=>{
 const h=runtime();assert.throws(()=>h.c.strictScanFacts(ai11Raw.replace('17300531','')),/expiry AI 17 required/);
 assert.equal(h.c.strictScanFacts('01'+AI11_GTIN+'10LOT21ABC')['10'],'LOT21ABC');assert.equal(h.c.strictScanFacts('11001234').identifier,'11001234');
});
test('Terminal variable-field AI-looking digits remain exact data; no inferred missing separator',()=>{
 const h=runtime();let f=h.c.strictScanFacts('01'+AI11_GTIN+'112512311730053110LOT21ABC');assert.equal(f['10'],'LOT21ABC');assert.equal(f['21'],undefined);
 f=h.c.strictScanFacts('01'+AI11_GTIN+'112512311730053110ABC'+GS+'21SER11XYZ');assert.equal(f['21'],'SER11XYZ');
});
for(const handheld of [true,false])test('AI11 '+(handheld?'TC26 path':'DS46 path')+' Save & Next uses AI17 and preserves original normalized scan',async()=>{
 const h=runtime(handheld);h.c.IdentifierService.resolve=async id=>({found:true,itemCode:'SYNTHETIC-AI11',itemName:'Synthetic AI11',identifierDisplay:id});
 assert.equal(await h.c.resolveExpiryScannedValue(ai11Raw),true);assert.equal(h.e('expiryMonth').dataset.value,'5');assert.equal(h.e('expiryYear').dataset.value,'2030');assert.equal(h.e('expiryBatchInput').value,AI11_BATCH);assert.equal(h.e('expirySerialInput').value,AI11_SERIAL);
 await h.c.saveExpiryCapture();const p=h.calls.find(c=>['save_pharmflow_expiry_capture_v3','save_pharmflow_expiry_session_capture_v2','save_pharmflow_expiry_desktop_capture_v1'].includes(c.name)).payload.p_capture;
 assert.equal(p.raw_scan,ai11Raw);assert.equal(p.identifier_display,AI11_GTIN);assert.equal(p.batch_no,AI11_BATCH);assert.equal(p.sample_serial,AI11_SERIAL);assert.equal(p.expiry_month,5);assert.equal(p.expiry_year,2030);assert.equal('production_date' in p,false);assert.equal(h.c.engine.currentItem,null);assert.equal(h.e('expiryBarcodeInput').value,'');
});

for(const id of ['11001234','11251231012345','112512311700012345','00112345678901'])test('Plain identifier beginning with AI-like date digits remains exact '+id,()=>{const f=runtime().c.strictScanFacts(id);assert.equal(f.format,'PLAIN');assert.equal(f.identifier,id);});

for(const identifier of ['E0029-L','U0030','S00110','1234A','1234','001234','04065272072977']) {
 test('Expiry PLAIN authoritative lookup preserves approved identifier '+identifier,async()=>{
  const h=runtime(true),seen=[];
  h.c.IdentifierService.resolve=async id=>{seen.push(id);return {found:true,itemCode:'SYNTHETIC',itemName:'Synthetic',identifierDisplay:id};};
  const facts=h.c.strictScanFacts(identifier);assert.equal(facts.format,'PLAIN');assert.equal(facts.identifier,identifier);
  assert.equal(await h.c.resolveExpiryScannedValue(identifier),true);assert.deepEqual(seen,[identifier]);assert.equal(h.c.engine.currentItem.identifierDisplay,identifier);
 });
 test('Expiry unknown PLAIN retains exact identifier for Needs Review '+identifier,async()=>{
  const h=runtime(true);h.c.IdentifierService.resolve=async()=>({found:false});
  assert.equal(await h.c.resolveExpiryScannedValue(identifier),true);assert.equal(h.c.engine.currentItem.identifierDisplay,identifier);assert.equal(h.c.engine.currentItem.needsReview,true);
 });
}
