import assert from 'node:assert/strict';
import test from 'node:test';
let handler;
globalThis.Deno={env:{get:n=>({SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',EXPIRY_CLEANUP_CRON_TOKEN:'synthetic-cron'})[n]},serve:h=>{handler=h;}};
await import('../supabase/functions/pharmflow-expiry-photo-cleanup/index.ts');
const job={job_id:'11111111-1111-4111-8111-111111111111',pharmacy_id:'22222222-2222-4222-8222-222222222222',operation_id:'33333333-3333-4333-8333-333333333333',claim_token:'44444444-4444-4444-8444-444444444444'};
job.object_path=job.pharmacy_id+'/expiry-v1/'+job.operation_id+'/product/55555555-5555-4555-8555-555555555555.jpg';
async function scenario(remove,read){
 const calls=[];
 globalThis.fetch=async(url,init)=>{
  const path=new URL(url).pathname;calls.push({path,init});
  if(path.endsWith('/claim_photo_cleanup_jobs'))return Response.json([job]);
  if(path.endsWith('/complete_photo_cleanup_job')||path.endsWith('/fail_photo_cleanup_job'))return Response.json(true);
  if(init.method==='DELETE')return remove();
  if(init.method==='GET')return read();
  throw Error('Unexpected network request');
 };
 const response=await handler(new Request('https://worker.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic-cron'}}));
 return {response,result:await response.json(),calls};
}
test('unauthorized caller cannot claim or delete',async()=>{globalThis.fetch=()=>{throw Error('Network prohibited');};assert.equal((await handler(new Request('https://worker.invalid',{method:'POST'}))).status,401);});
test('exact JSON remove request and uncached authenticated absence before completion',async()=>{
 const {response,result,calls}=await scenario(()=>Response.json([{name:job.object_path}]),()=>new Response(null,{status:404}));
 assert.equal(response.status,200);assert.equal(result.completed,1);
 const del=calls.find(c=>c.init.method==='DELETE');assert.equal(del.path,'/storage/v1/object/pharmflow-needs-review');assert.deepEqual(JSON.parse(del.init.body),{prefixes:[job.object_path]});assert.equal(del.init.headers['Content-Type'],'application/json');
 const get=calls.find(c=>c.init.method==='GET');assert.equal(get.path,'/storage/v1/object/authenticated/pharmflow-needs-review/'+job.object_path);assert.equal(get.init.headers['Content-Type'],undefined);assert.equal(get.init.headers['Cache-Control'],'no-cache, no-store');assert.equal(get.init.headers.Range,'bytes=0-0');assert.ok(calls.at(-1).path.endsWith('/complete_photo_cleanup_job'));
});
test('Storage failure retains retry without completion',async()=>{const {result,calls}=await scenario(()=>Response.json({code:'InvalidRequest'},{status:400}),()=>{throw Error('Must not read');});assert.equal(result.failed,1);assert.ok(calls.at(-1).path.endsWith('/fail_photo_cleanup_job'));assert.equal(JSON.parse(calls.at(-1).init.body).p_error_code,'storage_400');});
test('still readable binary cannot acknowledge deletion',async()=>{const {result,calls}=await scenario(()=>Response.json([]),()=>new Response('x',{status:206}));assert.equal(result.completed,0);assert.equal(JSON.parse(calls.at(-1).init.body).p_error_code,'storage_409');});
test('explicit missing-object response supports retry reconciliation',async()=>{const {result}=await scenario(()=>Response.json([]),()=>Response.json({statusCode:'404',message:'Object not found'},{status:400}));assert.equal(result.completed,1);});
test('read authorization failure is not proof of absence',async()=>{const {result}=await scenario(()=>Response.json([]),()=>Response.json({statusCode:'403',message:'Unauthorized'},{status:403}));assert.equal(result.completed,0);assert.equal(result.failed,1);});
