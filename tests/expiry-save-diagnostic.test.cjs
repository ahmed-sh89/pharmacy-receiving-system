const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
function harness(host='preview.vercel.app',project='tovkcakucyagvbzvlnks',query='?expirySaveTiming=1',handheld=false){
 const {document}=parseHTML('<html><body></body></html>');let now=0,copied='';const frames=[];
 document.visibilityState='visible';
 const c={window:{},document,location:{hostname:host,search:query},URL,URLSearchParams,performance:{now:()=>now},getSupabaseProjectUrl:()=>`https://${project}.supabase.co`,expiryIsHandheld:()=>handheld,navigator:{clipboard:{writeText:async text=>{copied=text;}}},requestAnimationFrame:fn=>frames.push(fn)};
 vm.createContext(c);vm.runInContext(fs.readFileSync('js/expiry-save-diagnostic.js','utf8'),c);
 return {c,document,api:c.window.ExpirySaveDiagnostic,advance:ms=>now+=ms,frames,copied:()=>copied};
}
test('Diagnostic is off without opt-in, on Production, wrong backend, and Handheld',()=>{
 for(const args of [['preview.vercel.app','tovkcakucyagvbzvlnks',''],['ahmed-sh89.github.io'],['preview.vercel.app','production'],['preview.vercel.app','tovkcakucyagvbzvlnks','?expirySaveTiming=1',true]]){const h=harness(...args);assert.equal(h.api.begin(),null);assert.equal(h.document.querySelector('#expirySaveDiagnostic'),null);}
});
test('Numeric stages copy without identifiers and sealed samples ignore later reconciliation',async()=>{
 const h=harness(),t=h.api.begin();h.advance(20);h.api.mark('durable',t);h.api.mark('secret-item-code',t);h.advance(100);h.api.mark('acknowledged',t);h.api.mark('finished',t);h.advance(1000);h.api.mark('rowsResponse',t);
 assert.match(h.api.report(),/durable: \+20.0 ms/);assert.doesNotMatch(h.api.report(),/secret|rowsResponse/);
 await h.document.querySelector('button').onclick();assert.equal(h.copied(),h.api.report());assert.match(h.copied(),/not observed/);assert.doesNotMatch(h.copied(),/tovkc|token|LATENCYTEST/);
});
test('Visible row boundary requires two frames and a connected visible row; stale frame cannot mark next sample',()=>{
 const h=harness(),row=h.document.createElement('tr');h.document.body.appendChild(row);row.getClientRects=()=>[{}];
 h.api.begin();h.api.paint(row);assert.doesNotMatch(h.api.report(),/visibleFrame:/);h.frames.shift()();h.advance(16);h.frames.shift()();assert.match(h.api.report(),/Click-to-visible-row: 16.0 ms/);
 h.api.paint(row);h.frames.shift()();h.api.begin();h.frames.shift()();assert.doesNotMatch(h.api.report(),/visibleFrame:/);
});
test('Diagnostic rendering failures never throw into Save and no network/storage APIs exist',()=>{
 const h=harness();h.document.createElement=()=>{throw Error('DOM unavailable');};assert.doesNotThrow(()=>{h.api.begin();h.api.mark('durable');});
 const s=fs.readFileSync('js/expiry-save-diagnostic.js','utf8');assert.doesNotMatch(s,/fetch\(|authRpc\(|localStorage|sessionStorage|console\./);
});
test('Save hooks retain acknowledgement guard and refresh/flash order',()=>{
 const s=fs.readFileSync('js/expiry.js','utf8');assert.match(s,/acknowledged=true;mark\("acknowledged"\)/);assert.match(s,/await refreshExpiryCurrentState\(\{confirmedSessionId:operation.sessionId,confirmedOperationId:operation.id\}\);\s*if\(saveScope/);
 const d=fs.readFileSync('js/expiry-desktop-v2.js','utf8');assert.match(d,/operationId && !r.members.some/);assert.match(d,/ExpirySaveDiagnostic.paint\(row\)/);
});
