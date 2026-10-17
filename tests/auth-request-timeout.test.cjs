const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/auth.js','utf8');
const start=source.indexOf('async function authRequest('),end=source.indexOf('\nasync function publicRpc(',start);
const requestSource=source.slice(start,end);
function run(fetch){const c={fetch,AbortController,setTimeout,clearTimeout,AUTH_REQUEST_TIMEOUT_MS:8,getSupabasePublishableKey:()=> 'public',getSupabaseProjectUrl:()=> 'https://staging.invalid'};vm.createContext(c);vm.runInContext(requestSource+'\nthis.request=authRequest;',c);return c.request;}

test('auth request timeout remains active after headers while reading response body',async()=>{
 const request=run(async()=>({ok:true,text:()=>new Promise(()=>{})}));
 await assert.rejects(request('/rpc/test'),/connection timed out/i);
});

test('auth request marks a received HTTP rejection without retaining its body',async()=>{
 const request=run(async()=>({ok:false,status:422,text:async()=>JSON.stringify({message:'Invalid test capture'})}));
 await assert.rejects(request('/rpc/test'),error=>error.serverRejected===true&&error.httpStatus===422&&error.message==='Invalid test capture'&&!('responseBody' in error));
});
