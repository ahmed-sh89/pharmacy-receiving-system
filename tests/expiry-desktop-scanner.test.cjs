const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {harness}=require('./expiry-capture-review.test.cjs');

const GS=String.fromCharCode(29);
const GTIN='06281086107829';
const LOT='03077';
const SERIAL='8ROPSYDT0SS50';
const RAW='01'+GTIN+'1730021810'+LOT+GS+'21'+SERIAL;

function runtime(handheld=false){
  const h=harness(handheld);
  vm.runInContext(fs.readFileSync('js/utils.js','utf8')+fs.readFileSync('js/scanner.js','utf8'),h.c);
  const lookups=[];
  h.c.IdentifierService.resolve=async identifier=>{
    lookups.push(identifier);
    return identifier===GTIN?{found:true,itemCode:'1036607',itemName:'FLUTAB',identifierDisplay:identifier,category:'Medicine'}:{found:false};
  };
  h.c.engine.draftReady=true;
  if(handheld)h.c.engine.selectedWorkerId='worker1';
  h.c.bindExpiryCaptureUI();
  return {...h,lookups,input:h.e('expiryBarcodeInput')};
}

function event(input,type,key){
  let prevented=false;
  input.dispatchEvent({type,key,preventDefault(){prevented=true;}});
  return prevented;
}
function idle(h,ms){h.flush(ms);return new Promise(resolve=>setImmediate(resolve));}

for(const suffix of ['Enter','Tab'])test(`Desktop scanner commits complete FLUTAB GS1 on ${suffix} suffix`,async()=>{
  const h=runtime(false);h.input.value=RAW;event(h.input,'input');
  assert.equal(event(h.input,'keydown',suffix),true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.lookups,[GTIN]);
  assert.equal(h.c.engine.currentItem.itemCode,'1036607');
  assert.equal(h.e('expiryBatchInput').value,LOT);
  assert.equal(h.e('expirySerialInput').value,SERIAL);
  assert.equal(h.e('expiryItemSerial').textContent,SERIAL);
  assert.equal(h.e('expiryMonth').dataset.value,'2');
  assert.equal(h.e('expiryYear').dataset.value,'2030');
  assert.equal(h.input.value,'');
});

for(const [label,separator] of [
  ['ASCII Group Separator',GS],['scanner tilde alias','~'],
  ['visible Group Separator','\u241d'],['replacement character separator','\uFFFD'],['escaped Group Separator','\\u001D'],
  ['scanner shadda alias','\u0651']
])test(`Desktop idle scan normalizes ${label} and resolves FLUTAB`,async()=>{
  const h=runtime(false);h.input.value=RAW.replace(GS,separator);event(h.input,'input');
  await idle(h,120);
  assert.deepEqual(h.lookups,[GTIN]);
  assert.equal(h.c.engine.currentItem.itemCode,'1036607');
  assert.equal(h.e('expiryBatchInput').value,LOT);
  assert.equal(h.e('expirySerialInput').value,SERIAL);
  assert.equal(h.e('expiryItemSerial').textContent,SERIAL);
  assert.equal(h.e('expiryMonth').dataset.value,'2');
  assert.equal(h.e('expiryYear').dataset.value,'2030');
});

test('Desktop per-character scanner input stays buffered until the complete GS1 frame is idle',async()=>{
  const h=runtime(false);let value='';
  for(const character of RAW){value+=character;h.input.value=value;event(h.input,'input');}
  await idle(h,120);
  assert.deepEqual(h.lookups,[GTIN]);
  assert.equal(h.c.engine.currentItem.itemCode,'1036607');
  assert.equal(h.e('expiryItemSerial').textContent,SERIAL);
});

test('Manual name and Item Code search remains on search path',async()=>{
  const h=runtime(false),queries=[];
  h.c.authRpc=async(name,payload)=>{if(name==='search_pharmflow_global_items_v3'){queries.push(payload.p_query);return [];}return [];};
  for(const query of ['FLUTAB','1036607']){
    h.input.value=query;event(h.input,'input');await idle(h,220);
  }
  assert.deepEqual(queries,['FLUTAB','1036607']);
  assert.deepEqual(h.lookups,[]);
  assert.equal(h.c.engine.currentItem,null);
});

test('Desktop save persists the original scanner frame and exact parsed serial',async()=>{
  const h=runtime(false),rawAlias=RAW.replace(GS,'~');
  h.input.value=rawAlias;event(h.input,'input');event(h.input,'keydown','Enter');
  await new Promise(resolve=>setImmediate(resolve));
  await h.c.saveExpiryCapture();
  const write=h.calls.find(call=>call.name==='save_pharmflow_expiry_capture_v3');
  assert.ok(write);
  assert.equal(write.payload.p_capture.raw_scan,RAW);
  assert.equal(write.payload.p_capture.scan_format,'GS1');
  assert.equal(write.payload.p_capture.identifier_display,GTIN);
  assert.equal(write.payload.p_capture.batch_no,LOT);
  assert.equal(write.payload.p_capture.sample_serial,SERIAL);
  assert.equal(write.payload.p_capture.expiry_month,2);
  assert.equal(write.payload.p_capture.expiry_year,2030);
  assert.equal(write.payload.p_capture.quantity,1);
  assert.equal(write.payload.p_capture.worker_id,null);
  assert.equal([...h.receipts.values()].length,1);
  assert.equal([...h.receipts.values()][0].sample_serial,SERIAL);
});

test('Desktop refresh reads Current State from the authoritative list RPC',async()=>{
  const h=runtime(false),authoritative=[{state_id:'server-state',item_code:'1036607',identifier_display:GTIN,batch_no:LOT,sample_serial:SERIAL,expiry_month:2,expiry_year:2030,verified_quantity:1}];
  let request;
  h.c.authRpc=async(name,payload)=>{request={name,payload};return authoritative;};
  const rows=await h.c.loadExpiryCurrentState('FLUTAB');
  assert.deepEqual(rows,authoritative);
  assert.equal(request.name,'list_pharmacy_expiry_current_state_v1');
  assert.equal(request.payload.p_pharmacy_id,'isolated-test');
  assert.equal(request.payload.p_search,'FLUTAB');
  assert.equal(rows[0].sample_serial,SERIAL);
});

test('Handheld scan presents exact serial in Last Scan and save receipt readback',async()=>{
  const h=runtime(true);h.input.value=RAW;event(h.input,'input');await idle(h,90);
  assert.deepEqual(h.lookups,[GTIN]);
  assert.equal(h.c.engine.currentItem.itemCode,'1036607');
  assert.equal(h.e('expiryItemSerial').textContent,SERIAL);
  assert.equal(h.e('expirySerialInput').value,SERIAL);
  await h.c.saveExpiryCapture();
  const write=h.calls.find(call=>call.name==='save_pharmflow_expiry_capture_v3');
  assert.ok(write);
  const payload=write.payload.p_capture;
  assert.equal(payload.identifier_display,GTIN);
  assert.equal(payload.raw_scan,RAW);
  assert.equal(payload.batch_no,LOT);
  assert.equal(payload.sample_serial,SERIAL);
  assert.equal(payload.expiry_month,2);
  assert.equal(payload.expiry_year,2030);
  assert.equal(payload.quantity,1);
  assert.equal(payload.worker_id,'worker1');
  assert.equal([...h.receipts.values()].length,1);
  assert.equal([...h.receipts.values()][0].sample_serial,SERIAL);
  const writes=h.calls.filter(call=>call.name==='save_pharmflow_expiry_capture_v3').length;
  await h.c.saveExpiryCapture();
  assert.equal(h.calls.filter(call=>call.name==='save_pharmflow_expiry_capture_v3').length,writes);
});

test('Handheld keeps Batch and Serial out of Last Scan metadata for the adjacent capture fields',()=>{
  const css=fs.readFileSync('css/dashboard.css','utf8');
  const html=fs.readFileSync('index.html','utf8');
  assert.match(css,/body\.zebraDevice #zebraExpiryShell \.expiryItemMeta>div:nth-child\(n\+3\)\{display:none\}/);
  assert.match(css,/\.expiryEntryGrid:has\(\.expirySerialField:not\(\[hidden\]\)\) \.expiryBatchField\{grid-column:1;grid-row:3\}/);
  assert.match(css,/\.expirySerialField\{grid-column:2;grid-row:3\}/);
  assert.match(html,/class="expiryReviewField expirySerialField"/);
});
