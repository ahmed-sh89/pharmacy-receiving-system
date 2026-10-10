const test=require('node:test');
const assert=require('node:assert/strict');
const {fetchWithTimeout,processCleanupJobs,validCleanupJob,MAX_BATCH}=require('../supabase/functions/pharmflow-expiry-photo-cleanup/cleanup-core.js');

const P='11111111-1111-4111-8111-111111111111';
const OP='22222222-2222-4222-8222-222222222222';
const REVIEW='33333333-3333-4333-8333-333333333333';
const JOB='44444444-4444-4444-8444-444444444444';
const TOKEN='55555555-5555-4555-8555-555555555555';
const PATH=P+'/expiry-v1/'+OP+'/product/'+REVIEW+'.jpg';
const job=(patch={})=>({job_id:JOB,pharmacy_id:P,review_id:REVIEW,operation_id:OP,object_path:PATH,attempts:1,claim_token:TOKEN,...patch});

test('cleanup worker validates pharmacy and operation embedded in exact Storage path',()=>{
 assert.equal(validCleanupJob(job()),true);
 assert.equal(validCleanupJob(job({pharmacy_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})),false);
 assert.equal(validCleanupJob(job({operation_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})),false);
 assert.equal(validCleanupJob(job({object_path:P+'/expiry-v1/'+OP+'/other/'+REVIEW+'.jpg'})),false);
 assert.equal(validCleanupJob(job({claim_token:null})),false);
});

test('cleanup worker completes successful and already-absent Storage objects idempotently',async()=>{
 for(const response of [{ok:true,status:200},{ok:false,status:404}]){
  let deleted=0,completed=0,failed=0;
  const result=await processCleanupJobs([job()],{
   deleteObject:async()=>{deleted++;return response;},
   complete:async()=>{completed++;return true;},
   fail:async()=>{failed++;return true;}
  });
  assert.deepEqual(result,{claimed:1,completed:1,failed:0,claim_lost:0,deferred:0,success:true});
  assert.equal(deleted,1);assert.equal(completed,1);assert.equal(failed,0);
 }
});

test('partial Storage failure persists retry and makes the invocation non-successful',async()=>{
 const errors=[],completed=[];
 const result=await processCleanupJobs([job(),job({job_id:'66666666-6666-4666-8666-666666666666',object_path:P+'/expiry-v1/'+OP+'/expiry/'+REVIEW+'.png'})],{
  deleteObject:async(item)=>item.object_path.endsWith('.png')?{ok:true,status:200}:{ok:false,status:503},
  complete:async(item)=>{completed.push(item.job_id);return true;},
  fail:async(item,code)=>{errors.push([item.job_id,code]);return true;}
 });
 assert.equal(result.success,false);assert.equal(result.failed,1);assert.equal(result.completed,1);
 assert.deepEqual(errors,[[JOB,'storage_503']]);assert.equal(completed.length,1);
});

test('lost Storage response remains retryable and invalid cross-pharmacy jobs never reach Storage',async()=>{
 const errors=[];let deletes=0;
 const invalid=job({pharmacy_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
 const result=await processCleanupJobs([job(),invalid],{
  deleteObject:async()=>{deletes++;throw new Error('timeout');},
  complete:async()=>true,
  fail:async(item,code)=>{errors.push([item.job_id,code]);return true;}
 });
 assert.equal(deletes,1);assert.equal(result.success,false);assert.equal(result.failed,2);
 assert.deepEqual(errors,[[JOB,'storage_unavailable'],[JOB,'invalid_job_scope']]);
});

test('worker defers work before its invocation budget and never processes beyond bounded batch size',async()=>{
 let calls=0;
 const one=await processCleanupJobs([job()],{
  deleteObject:async()=>{calls++;return {ok:true,status:200};},complete:async()=>true,fail:async()=>true,
  startedAt:0,now:()=>109_500,budgetMs:110_000
 });
 assert.equal(one.deferred,1);assert.equal(calls,0);assert.equal(one.success,false);
 const batch=Array.from({length:MAX_BATCH+1},(_,i)=>job({job_id:'77777777-7777-4777-8777-'+String(i).padStart(12,'0'),object_path:P+'/expiry-v1/'+OP+'/product/88888888-8888-4888-8888-'+String(i).padStart(12,'0')+'.jpg'}));
 const bounded=await processCleanupJobs(batch,{
  deleteObject:async()=>{calls++;return {ok:true,status:200};},complete:async()=>true,fail:async()=>true
 });
 assert.equal(bounded.claimed,MAX_BATCH);assert.equal(bounded.deferred,1);assert.equal(calls,MAX_BATCH);
});

test('each worker network request has an aborting timeout',async()=>{
 const original=globalThis.fetch;let signal;
 globalThis.fetch=(_input,init)=>{signal=init.signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));};
 try{
  await assert.rejects(fetchWithTimeout('https://example.invalid',{},5));
  assert.equal(signal.aborted,true);
 }finally{globalThis.fetch=original;}
});
