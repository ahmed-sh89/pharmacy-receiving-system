const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {IDBFactory,IDBKeyRange}=require('fake-indexeddb');
const code=fs.readFileSync('js/receiving-release.js','utf8');
function client(db,history,receiving){
 const handlers=new Map();let sequence=0;
 const c={window:{addEventListener(){},hhRefreshReadyState(){},hhRepairScannerFocus(){}},AuthState:{context:{pharmacy_id:'P'}},ensureDeviceId:()=> 'HH',crypto:{randomUUID:()=>`scan-${++sequence}`},indexedDB:db,IDBKeyRange,navigator:{onLine:false},AppState:{workspace:{receivingHistory:history}},parseGS1Barcode:raw=>({gtin:raw}),receiveParsedBarcode:receiving,Logger:{warn(){}},AppEvents:{on:(n,f)=>handlers.set(n,f)},document:{readyState:'loading',addEventListener(){}},setTimeout:()=>0};
 vm.runInNewContext(code,c);return {c,handlers,queue:c.window.PharmFlowReceivingScanQueue};
}
test('durable split scan waits for every acknowledgement, survives restart, and never reprocesses receipts',async()=>{
 const db=new IDBFactory(),history=[];let writes=0;let first;
 first=client(db,history,async(parsed,options)=>{
  await options.beforeReceive([{orderNumber:'A',quantity:60},{orderNumber:'B',quantity:10}]);
  const pending=await first.queue.pending();assert.deepEqual(Array.from(pending[0].transactionIds),['scan-1:A1','scan-1:A2'],'IDs are durable before quantities change');
  const receipts=[{transactionId:'scan-1:A1',quantity:60,cloudSynced:false},{transactionId:'scan-1:A2',quantity:10,cloudSynced:false}];history.push(...receipts);writes+=2;return receipts;
 });
 await first.queue.enqueue('CODE');first.c.navigator.onLine=true;await first.queue.resume();assert.equal((await first.queue.pending()).length,1);
 history[0].cloudSynced=true;await first.queue.resume();assert.equal((await first.queue.pending()).length,1,'first child acknowledgement cannot discard second child');
 const reloaded=client(db,history,async()=>{throw Error('awaiting receipt must not replay');});reloaded.c.navigator.onLine=true;
 await reloaded.queue.resume();assert.equal((await reloaded.queue.pending()).length,1);
 history[1].cloudSynced=true;await reloaded.queue.resume();assert.equal((await reloaded.queue.pending()).length,0);assert.equal(writes,2);
});
test('single scan retains base ID and pre-split persisted entries remain compatible',async()=>{
 const history=[],app=client(new IDBFactory(),history,async(parsed,options)=>{
  await options.beforeReceive([{orderNumber:'A',quantity:1}]);const tx={transactionId:options.transactionId,quantity:1,cloudSynced:false};history.push(tx);return [tx];
 });await app.queue.enqueue('CODE');app.c.navigator.onLine=true;await app.queue.resume();
 assert.deepEqual(Array.from((await app.queue.pending())[0].transactionIds),['scan-1']);history[0].cloudSynced=true;await app.queue.resume();assert.equal((await app.queue.pending()).length,0);
});
