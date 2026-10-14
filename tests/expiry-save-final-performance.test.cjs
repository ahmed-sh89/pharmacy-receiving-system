const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const {harness}=require('./expiry-capture-review.test.cjs');
async function prepared(){const h=harness();await h.c.resolveExpiryScannedValue('(01)04065272072977(17)270831(10)GS1-BATCH');await h.c.ensureExpiryActiveSession();h.calls.length=0;return h;}
test('Warm Desktop known save uses one server write and preserves Serial/Batch and confirmed receipt',async()=>{
 const h=await prepared();await h.c.saveExpiryCapture();assert.deepEqual(h.calls.map(x=>x.name),['save_pharmflow_expiry_desktop_capture_v1']);
 assert.equal(h.receipts.size,1);const row=[...h.receipts.values()][0];assert.equal(row.batch_no,'GS1-BATCH');assert.equal(row.quantity,1);
});
test('Lost Desktop acknowledgement retries exact original operation through atomic server write',async()=>{
 const h=await prepared(),rpc=h.c.authRpc;let lost=true;
 h.c.authRpc=async(name,args)=>{const ack=await rpc(name,args);if(lost && name==='save_pharmflow_expiry_desktop_capture_v1'){lost=false;throw Error('response lost');}return ack;};
 await h.c.saveExpiryCapture();assert.equal(h.c.engine.saveUncertain,true);const id=h.c.engine.operation.id;
 await h.c.saveExpiryCapture();assert.equal(h.receipts.size,1);assert.equal([...h.receipts.values()][0].operation_id,id);assert.equal(h.c.engine.saveUncertain,false);assert.equal(h.calls.some(x=>x.name.startsWith('reserve_')),false);
});
test('Cached session never bypasses server rejection or produces falsely saved state',async()=>{
 const h=await prepared();h.c.authRpc=async()=>{const e=Error('Session closed');e.serverRejected=true;e.httpStatus=422;throw e;};
 await h.c.saveExpiryCapture();assert.equal(h.receipts.size,0);assert.ok(h.c.engine.currentItem);assert.ok(h.c.engine.operation);assert.doesNotMatch(h.e('expiryDesktopStatus').textContent,/✓ SAVED/);
});
test('Known Desktop direct write is narrow; unknown photo and Handheld guards remain',()=>{
 const s=fs.readFileSync('js/expiry.js','utf8');assert.match(s,/directKnown:\(!expiryIsHandheld\(\) && payload.kind==="KNOWN"\)/);assert.doesNotMatch(s,/ensureExpiryActiveSession\(\{fresh:!expiryIsHandheld/);
});
test('Controlled baseline/candidate critical path comparison, not real-device latency',async()=>{
 const baselinePath=process.env.PHARMFLOW_SAVE_BASELINE;if(!baselinePath)return;
 const source=fs.readFileSync(baselinePath,'utf8'),start=source.indexOf('async function saveExpiryCapture('),end=source.indexOf('\nfunction expiryIsHandheld()',start),before=source.slice(start,end);
 const result=[];
 for(const baseline of [true,false]){const samples=[],counts=[];
 for(let i=0;i<7;i++){const h=await prepared();if(baseline)vm.runInContext(before,h.c);const rpc=h.c.authRpc;h.c.authRpc=async(name,args)=>{await new Promise(r=>setTimeout(r,25));return rpc(name,args);};h.c.refreshExpiryCurrentState=async()=>{await new Promise(r=>setTimeout(r,25));return [];};const started=performance.now();await h.c.saveExpiryCapture();samples.push(performance.now()-started);counts.push(h.calls.length);}
 samples.sort((a,b)=>a-b);result.push({variant:baseline?'d550edb baseline':'candidate',medianMs:Number(samples[3].toFixed(2)),savePathRpcCounts:counts,conditions:'25ms mocked RPC +25ms mocked authoritative row read; no browser/physical latency claim'});}
 assert.ok(result[1].medianMs<result[0].medianMs);assert.ok(result[0].savePathRpcCounts.every(x=>x===3));assert.ok(result[1].savePathRpcCounts.every(x=>x===1));console.log('CONTROLLED_SAVE_COMPARISON',JSON.stringify(result));
});
