const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
function adapter(){const c={Blob,structuredClone,AbortController,setTimeout,clearTimeout};vm.createContext(c);vm.runInContext(fs.readFileSync('js/expiry-operation.js','utf8')+'\nthis.api=ExpiryOperation;',c);return c.api;}
function scenario(kind='KNOWN'){
 const api=adapter(),operation={id:crypto.randomUUID(),pharmacyId:'pharmacy1'},scope='user1/pharmacy1';let current=scope,committed=null,payload,saves=0,lost=false,uploads=[],drafts=[];
 const input={rpc:async(name,p)=>{
  if(name.startsWith('reserve_'))return {operation_id:operation.id,status:committed?'COMMITTED':'RESERVED',result:committed};
  if(name.startsWith('get_'))return {...payload,pharmacy_id:operation.pharmacyId,review_id:'review1'};
  saves++;if(committed){assert.deepEqual(p.p_capture,payload);return committed;}
  payload=structuredClone(p.p_capture);committed=kind==='KNOWN'?{operation_id:operation.id,state_id:'state',event_id:'event'}:{operation_id:operation.id,review_id:'review1',product_photo_path:payload.product_photo_path,expiry_photo_path:payload.expiry_photo_path};
  if(lost)throw new Error('reply lost');return committed;
 },upload:async(path,file)=>uploads.push({path,file}),persist:async status=>drafts.push(structuredClone({status,operation})),scope,currentScope:()=>current,operation,payload:{kind,identifier_display:'U0030',raw_scan:']C0U0030\r\n',scan_format:'PLAIN',quantity:7,expiry_month:8,expiry_year:2028,batch_no:'LOT',sample_serial:null,worker_id:'worker1',device_id:'device',source:'HANDHELD',item_code:'ITEM',item_name:'Item',category:''},photos:{evidence:new Blob(['single evidence'],{type:'image/jpeg'})},uuid:()=>crypto.randomUUID()};
 return {api,input,uploads,drafts,setScope:v=>current=v,lose:()=>lost=true,get saves(){return saves;}};
}
for(const id of ['U0030','S00110','1234A','001234','00000000000001'])test('Exact ordinary identifier and scanner framing: '+id,()=>{const f=adapter().scanFacts(']C0'+id+'\r\n');assert.equal(f.identifier,id);assert.equal(f.format,'PLAIN');});
test('GS1 parenthesized and FNC1 preserve lot, serial and day-zero expiry',()=>{
 for(const raw of ['(01)04065272072977(17)280800(10)LOT-A(21)SERIAL',']C101040652720729771728080010LOT-A\x1d21SERIAL']){const f=adapter().scanFacts(raw);assert.equal(f.identifier,'04065272072977');assert.equal(f['10'],'LOT-A');assert.equal(f['21'],'SERIAL');assert.equal(f['17'],'280800');}
 assert.throws(()=>adapter().scanFacts('(01)04065272072977(10)LOT(10)LOT'),/Invalid/);
});
test('Lost committed reply reconciles same payload and operation without another quantity increment',async()=>{
 const h=scenario();h.lose();await assert.rejects(h.api.save(h.input),e=>e.uncertain===true);const id=h.input.operation.id;
 const result=await h.api.save(h.input);assert.equal(result.operation_id,id);assert.equal(h.saves,2);assert.equal(h.drafts.at(-1).operation.id,id);
});
test('HTTP rejection is definitive while timeout and network loss retain uncertain operation identity',async()=>{
 const rejected=scenario();rejected.input.rpc=async(name)=>{if(name.startsWith('reserve_'))return {operation_id:rejected.input.operation.id,status:'RESERVED'};const e=new Error('invalid capture');e.httpStatus=422;e.serverRejected=true;throw e;};
 await assert.rejects(rejected.api.save(rejected.input),e=>e.expiryOutcome==='rejected'&&!e.uncertain);assert.ok(rejected.input.operation.payload);
 const timed=scenario();timed.input.rpc=async(name,p)=>{if(name.startsWith('reserve_'))return {operation_id:timed.input.operation.id,status:'RESERVED'};const e=new Error('connection timed out');throw e;};
 await assert.rejects(timed.api.save(timed.input),e=>e.expiryOutcome==='uncertain'&&e.uncertain);const stableId=timed.input.operation.id,stablePayload=structuredClone(timed.input.operation.payload);
 const original=timed.input.rpc;let calls=0;timed.input.rpc=async(name,p)=>{if(name.startsWith('reserve_'))return {operation_id:stableId,status:'RESERVED'};calls++;assert.equal(p.p_operation_id,stableId);assert.deepEqual(p.p_capture,stablePayload);return {operation_id:stableId,state_id:'state',event_id:'event'};};
 await timed.api.save(timed.input);assert.equal(calls,1);assert.equal(timed.input.operation.id,stableId);
});
test('One immutable evidence upload and authorized read verify unknown fields before acknowledgement',async()=>{
 const h=scenario('UNKNOWN');const result=await h.api.save(h.input);assert.equal(result.review_id,'review1');assert.equal(h.uploads.length,1);
 assert.match(h.uploads[0].path,/\/product\/.*\.jpg$/);assert.equal(await h.uploads[0].file.text(),'single evidence');
 await h.api.save(h.input);assert.equal(h.uploads.length,1);
});
test('Legacy two-photo drafts remain retry-compatible',async()=>{
 const h=scenario('UNKNOWN');h.input.photos={product:new Blob(['legacy product'],{type:'image/jpeg'}),expiry:new Blob(['legacy expiry'],{type:'image/png'})};
 const result=await h.api.save(h.input);assert.equal(result.review_id,'review1');assert.equal(h.uploads.length,2);
 assert.match(h.uploads[0].path,/\/product\//);assert.match(h.uploads[1].path,/\/expiry\//);assert.ok(h.input.operation.payload.expiry_photo_path);
 await h.api.save(h.input);assert.equal(h.uploads.length,2);
});
test('Single photo upload failure retains the draft and retries without false acknowledgement',async()=>{
 const h=scenario('UNKNOWN');const upload=h.input.upload;h.input.upload=async()=>{throw new Error('offline');};
 await assert.rejects(h.api.save(h.input),/offline/);assert.equal(h.input.operation.payload,undefined);assert.equal(h.saves,0);
 h.input.upload=upload;await h.api.save(h.input);assert.equal(h.uploads.length,1);
});
test('Missing backend, wrong acknowledgement and scope changes fail closed',async()=>{
 const h=scenario();h.input.rpc=async()=>null;await assert.rejects(h.api.save(h.input),/incompatible/);assert.equal(h.input.operation.payload,undefined);
 const h2=scenario();h2.setScope('user2/pharmacy1');await assert.rejects(h2.api.save(h2.input),/account changed/);assert.equal(h2.saves,0);
 assert.throws(()=>h.api.acknowledgement({operation_id:'different',state_id:'s',event_id:'e'},h.input.operation.id,'KNOWN'),/acknowledgement/);
});
test('Unknown read failure cannot produce success and retries reuse both uploaded references',async()=>{
 const h=scenario('UNKNOWN'),rpc=h.input.rpc;h.input.rpc=(name,p)=>name.startsWith('get_')?Promise.resolve(null):rpc(name,p);
 await assert.rejects(h.api.save(h.input),e=>e.uncertain===true);assert.equal(h.uploads.length,1);
 h.input.rpc=rpc;await h.api.save(h.input);assert.equal(h.uploads.length,1);
});
test('Legacy uncertain capture with no operation remains locked and never calls an RPC',async()=>{
 const {harness}=require('./expiry-capture-review.test.cjs');const h=harness(true);h.c.engine.currentItem={identifierDisplay:'U0030'};h.c.engine.saveUncertain=true;h.c.engine.operation=null;await h.c.saveExpiryCapture();assert.equal(h.calls.length,0);
});
