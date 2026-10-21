const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function versionHarness(extra={}){
 const c={window:{addEventListener(){}},document:{visibilityState:'visible',body:{classList:{contains:()=>false}},querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){}},AuthState:{},WeakMap,Array,String,JSON,Date,URL,fetch:()=>{throw Error('Unexpected network');},...extra};
 vm.runInNewContext(fs.readFileSync('js/app-version.js','utf8'),c);return c.window.PharmFlowVersionCheck;
}
test('Merged version checker blocks disabled in-flight Expiry capture and uncertain/pending work',async()=>{
 for(const field of ['busy','resolving','saveUncertain','operation','currentItem','pendingDraft'])assert.equal(await versionHarness({ExpiryCaptureEngine:{[field]:true}}).isSafeToRefresh(),false,field);
 assert.equal(await versionHarness({expiryHasClearIntent:()=>true}).isSafeToRefresh(),false);
});
test('Version checker preserves cross-tab durable drafts and fails closed on unreadable local queue',async()=>{
 for(const draft of [{item:{}},{operation:{}},{status:'UNCERTAIN'}]){
 const api=versionHarness({expiryDraftScope:()=> 'scope',ExpiryDraftStore:{get:async()=>null,list:async()=>[{draft}]}});assert.equal(await api.isSafeToRefresh(),false);
 }
 assert.equal(await versionHarness({expiryDraftScope:()=> 'scope',ExpiryDraftStore:{get:async()=>{throw Error('storage unavailable');}}}).isSafeToRefresh(),false);
 assert.equal(await versionHarness({expiryDraftScope:()=> 'scope',ExpiryDraftStore:{get:async()=>null,list:async()=>[]}}).isSafeToRefresh(),true);
 let scope='first';assert.equal(await versionHarness({expiryDraftScope:()=>scope,ExpiryDraftStore:{get:async()=>{scope='second';return null;},list:async()=>[]}}).isSafeToRefresh(),false);
});
test('Merged entry loads version checker once after shared cloud service and before app bootstrap',()=>{
 const s=fs.readFileSync('index.html','utf8');const tags=[...s.matchAll(/<script src="([^?" ]+)/g)].map(m=>m[1]);
 assert.equal(tags.filter(x=>x==='js/app-version.js').length,1);assert.ok(tags.indexOf('cloud-workspace.js')<tags.indexOf('js/app-version.js'));assert.ok(tags.indexOf('js/app-version.js')<tags.indexOf('js/app.js'));
 for(const file of ['cloud-workspace.js','css/pharmflow-next.css','css/identity.css'])assert.ok(s.includes(file+'?v='));
 assert.ok(s.includes('ui.js?v=EXPIRY_PROMOTION_REVIEW_20261021'));
 assert.doesNotMatch(s,/<<<<<<<|>>>>>>>|expiry-save-diagnostic/);
});
