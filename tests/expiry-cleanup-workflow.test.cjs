const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const yaml = fs.readFileSync('.github/workflows/expiry-photo-cleanup.yml', 'utf8');
const script = yaml.split("node <<'NODE'\n")[1].split('\n          NODE')[0];
const url = 'https://zznoshzcyxmtwfbznjyr.supabase.co/functions/v1/pharmflow-expiry-photo-cleanup';
const good = { success: true, claimed: 0, completed: 0, failed: 0, claim_lost: 0, deferred: 0 };
async function run({ status=200, body=good, env={}, jsonError=false, networkError=false }={}) {
  const logs=[]; let calls=0;
  const process={env:{WORKER_URL:url,CRON_TOKEN:'PRIVATE_TEST_TOKEN',...env},exitCode:0};
  const context={process,AbortSignal,console:{log:s=>logs.push(s),error:s=>logs.push(s)},
    fetch:async(target,init)=>{
      calls++; assert.equal(target,url); assert.equal(init.redirect,'error');
      assert.equal(init.method,'POST');
      if(networkError)throw new Error('PRIVATE_TEST_TOKEN');
      return {status,ok:status>=200&&status<300,json:async()=>{
        if(jsonError)throw new Error('PRIVATE_TEST_TOKEN');return body;
      }};
    }};
  await vm.runInNewContext(script,context);
  assert(!logs.join('\n').includes('PRIVATE_TEST_TOKEN'));
  return {logs,code:process.exitCode,calls};
}
test('configuration failures never invoke a worker',async()=>{
  for(const env of [{WORKER_URL:'https://wrong.invalid'},{CRON_TOKEN:''}]){
    const r=await run({env});assert.equal(r.calls,0);assert.equal(r.code,1);
    assert.equal(JSON.parse(r.logs[0]).stage,'configuration');
  }
});
test('401 plain-text response reports authentication status before JSON parsing',async()=>{
  const r=await run({status:401,jsonError:true});assert.equal(r.code,1);
  assert.deepEqual(JSON.parse(r.logs[0]),{event:'expiry_cleanup_failed',stage:'http_response',http_status:401});
});
test('transport, malformed JSON, and partial acknowledgement stay distinct and fail closed',async()=>{
  for(const [opts,stage] of [[{networkError:true},'request'],[{jsonError:true},'response_json'],
    [{body:{...good,claimed:1}},'acknowledgement'],[{body:null},'acknowledgement'],
    [{body:{...good,failed:1}},'acknowledgement']]){
    const r=await run(opts);assert.equal(r.code,1);assert.equal(JSON.parse(r.logs[0]).stage,stage);
  }
});
test('empty and fully acknowledged bounded batches pass without extra response fields',async()=>{
  for(const n of [0,4]){
    const r=await run({body:{...good,claimed:n,completed:n,private:'PRIVATE_TEST_TOKEN'}});
    assert.equal(r.code,0);assert.equal(JSON.parse(r.logs[0]).completed,n);
  }
});
test('invalid, oversized and incomplete batch acknowledgements are rejected',async()=>{
  for(const body of [{...good,claimed:5,completed:5},{...good,completed:-1},
    {...good,claimed:'0'},{...good,claim_lost:1},{...good,deferred:1},{...good,success:false}]){
    assert.equal((await run({body})).code,1);
  }
});
