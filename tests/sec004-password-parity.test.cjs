const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const paths=['supabase/functions/pharmflow-password-admin/index.ts','supabase/functions/pharmflow-password-admin-settings-rc/index.ts'];
function fixture(path,opts={}){
 const user={id:'isolated-a',email:'isolated-a@example.invalid',app_metadata:{pharmflow_must_change_password:opts.required!==false}},updates=[];
 let handler;const signIns=[];
 function createClient(url,key,options){return {rpc:async()=>({data:false,error:null}),auth:{getUser:async()=>({data:{user:opts.invalid?null:user},error:opts.invalid?{}:null}),signInWithPassword:async input=>{signIns.push(input);return input.password==='temporary-secret'?{data:{},error:null}:{data:{},error:{code:'invalid_credentials',status:400}};},admin:{getUserById:async()=>({data:{user:{id:'isolated-b'}}}),updateUserById:async(id,value)=>{updates.push({id,value});return {error:null};}}}};}
 const code=stripTypeScriptTypes(fs.readFileSync(path,'utf8').replace(/^import .*\n/gm,''));const c={createClient,Deno:{env:{get:n=>({SUPABASE_URL:'https://isolated.invalid',SUPABASE_ANON_KEY:'fixture-public',SUPABASE_SERVICE_ROLE_KEY:'fixture-server'})[n]},serve:fn=>handler=fn},Request,Response,Headers,crypto:require('node:crypto').webcrypto,Uint8Array};vm.runInNewContext(code,c);
 return {updates,signIns,call:body=>handler(new Request('https://isolated.invalid/function',{method:'POST',headers:opts.unauth?{}:{Authorization:'Bearer isolated-token'},body:JSON.stringify(body)}))};
}
for(const path of paths){
 test(path+': authorized replacement updates caller only and clears mandatory-change flag',async()=>{const h=fixture(path);const r=await h.call({action:'complete',new_password:'distinct-secret'});assert.equal(r.status,200);assert.equal(h.updates.length,1);assert.equal(h.updates[0].id,'isolated-a');assert.equal(h.updates[0].value.app_metadata.pharmflow_must_change_password,false);});
 test(path+': temporary credential reuse denied without update',async()=>{const h=fixture(path);assert.equal((await h.call({action:'complete',new_password:'temporary-secret'})).status,400);assert.equal(h.updates.length,0);});
 test(path+': absent bearer denied',async()=>{const h=fixture(path,{unauth:true});assert.equal((await h.call({action:'complete',new_password:'distinct-secret'})).status,401);assert.equal(h.updates.length,0);});
 test(path+': invalid bearer denied',async()=>{const h=fixture(path,{invalid:true});assert.equal((await h.call({action:'complete',new_password:'distinct-secret'})).status,401);assert.equal(h.updates.length,0);});
 test(path+': foreign user parameter cannot change another account',async()=>{const h=fixture(path);await h.call({action:'complete',new_password:'distinct-secret',target_user_id:'isolated-b',pharmacy_id:'other-pharmacy'});assert.equal(h.updates[0].id,'isolated-a');assert(!h.updates.some(u=>u.id==='isolated-b'));});
 test(path+': ordinary user cannot reset another account',async()=>{const h=fixture(path);assert.equal((await h.call({action:'reset',target_user_id:'isolated-b'})).status,403);assert.equal(h.updates.length,0);});
 test(path+': unrestricted normal session cannot invoke temporary completion',async()=>{const h=fixture(path,{required:false});assert.equal((await h.call({action:'complete',new_password:'distinct-secret'})).status,403);assert.equal(h.updates.length,0);});
 test(path+': short replacement rejected without update',async()=>{const h=fixture(path);assert.equal((await h.call({action:'complete',new_password:'short'})).status,400);assert.equal(h.updates.length,0);});
}
