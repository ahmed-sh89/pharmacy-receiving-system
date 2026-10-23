const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const {parseHTML}=require('linkedom');
const html=fs.readFileSync('index.html','utf8'),script=fs.readFileSync('js/settings-workspace.js','utf8');
function fixture(owner=false,admin=false){
 const {document,window}=parseHTML(html);let active=document.body;
 Object.defineProperty(document,'activeElement',{get:()=>active});
 document.querySelectorAll('*').forEach(el=>el.focus=()=>{active=el;});
 const access=document.getElementById('ownerManagementCard');access.hidden=!owner;
 const workers=document.createElement('section');workers.id='expiryWorkersSettingsCard';workers.hidden=!admin;document.getElementById('settingsOperatorsPanel').append(workers);
 const observers=[];const context={document,window,Promise,MutationObserver:class{constructor(fn){this.fn=fn;}observe(el){observers.push([el,this.fn]);}}};vm.runInNewContext(script,context);
 const notify=el=>observers.filter(([target])=>target===el).forEach(([,fn])=>fn());
 return {document,window,access,workers,notify,context};
}
test('four tabs switch one inline workspace and follow existing role visibility',()=>{
 for(const owner of [false,true])for(const admin of [false,true]){
  const {document,access,workers,notify}=fixture(owner,admin);
  const tabs=[...document.querySelectorAll('#page-settings [role="tab"]')];
  assert.deepEqual(tabs.map(e=>e.textContent.trim()),['Items Control','Data Management','Operators','Access Management']);
  assert.equal(document.getElementById('settingsItemsPanel').hidden,false);
  assert.equal(document.getElementById('settingsAccessTab').hidden,!owner);
  document.getElementById('settingsDataTab').click();assert.equal(document.getElementById('settingsDataPanel').hidden,false);assert.equal(document.getElementById('settingsItemsPanel').hidden,true);
  document.getElementById('settingsOperatorsTab').click();assert.equal(document.getElementById('settingsOperatorsUnavailable').hidden,admin);
  assert.equal(workers.hidden,!admin,'presentation must not grant admin visibility');
  access.hidden=false;notify(access);document.getElementById('settingsAccessTab').click();assert.equal(document.getElementById('settingsAccessPanel').hidden,false);
  access.hidden=true;notify(access);assert.equal(document.getElementById('settingsItemsPanel').hidden,false);
 }
});
test('keyboard tabs skip unavailable Access and preserve content/search state',()=>{
 const {document,window}=fixture(false,true);const items=document.getElementById('settingsItemsTab'),input=document.querySelector('[data-admin-search]');input.value='00123';
 const key=(el,k)=>{const event=new window.Event('keydown',{bubbles:true,cancelable:true});event.key=k;el.dispatchEvent(event);};
 key(items,'End');assert.equal(document.activeElement.id,'settingsOperatorsTab');
 key(document.activeElement,'ArrowRight');assert.equal(document.activeElement,items);assert.equal(input.value,'00123');
});
test('existing Settings controls stay unique; redundant launcher/modal removed',()=>{
 const {document}=fixture(true,true);for(const id of ['btnResetWorkspace','btnDeleteAllHistory','ownerManagementPanel','ownerRegistrationRequests','ownerPharmacyList','settingsAccessMessage','globalIdentifierMasterAdmin','globalIdentifierMasterSearch','globalIdentifierMasterResults'])assert.equal(document.querySelectorAll('#'+id).length,1,id);
 assert.equal(document.getElementById('barcodeControlOverlay'),null);assert.equal(document.getElementById('btnOpenBarcodeControl'),null);
 assert(document.querySelector('#settingsItemsPanel [data-admin-search]'));assert(document.querySelector('#settingsAccessPanel #ownerManagementCard[hidden]')===null);
});
test('Owner mutations retain their exact accepted validation, guards, RPCs and confirmations',()=>{
 const baseline=cp.execFileSync('git',['show','ef0077c:js/auth.js'],{encoding:'utf8'}),current=fs.readFileSync('js/auth.js','utf8');
 const fn=(s,name)=>{const a=s.indexOf('async function '+name+'(');return s.slice(a,s.indexOf('\n}',a)+2);};
 for(const name of ['handleOwnerPharmacyAction','reviewRegistration'])assert.equal(fn(current,name).replaceAll(',anchor:button',''),fn(baseline,name));
});
test('restricted account cannot trigger Owner actions even with injected controls',async()=>{
 const source=fs.readFileSync('js/auth.js','utf8');const a=source.indexOf('async function handleOwnerPharmacyAction('),b=source.indexOf('async function loadOwnerRegistrationRequests',a);let calls=0;
 const ctx={isSystemOwner:()=>false,authRpc:()=>calls++,window:{settingsConfirm:()=>{throw Error('unauthorized dialog');}}};vm.runInNewContext(source.slice(a,b)+';globalThis.run=handleOwnerPharmacyAction;',ctx);
 for(const action of ['identity','admin','reset-password','activate','suspend'])await ctx.run({dataset:{ownerAction:action,pharmacyId:'test'}});assert.equal(calls,0);
});
test('Handheld runtime, Receiving, identifier service and password/session flows remain untouched',()=>{
 for(const path of ['js/handheld-runtime.js','js/receiving.js','js/scanner.js','js/identifier-service.js','js/session.js','js/header-account-ui.js','js/header-account-responsive.js'])assert.equal(fs.readFileSync(path,'utf8'),cp.execFileSync('git',['show','66ac0b2:'+path],{encoding:'utf8'}),path);
 const source=fs.readFileSync('js/expiry.js','utf8'),baseline=cp.execFileSync('git',['show','66ac0b2:js/expiry.js'],{encoding:'utf8'});
 const fn=(s,name)=>s.slice(s.indexOf('async function '+name+'('),s.indexOf('\n}',s.indexOf('async function '+name+'('))+2);
 for(const name of ['refreshExpiryOperatorManagement','saveExpiryWorkerFromSettings'])assert.equal(fn(source,name),fn(baseline,name));
});
test('Staging configuration fails closed for wrong project, key role and deployment branch',async()=>{
 const {stagingPreviewConfig}=await import('../scripts/staging-preview-config.mjs');
 const key=claims=>'x.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.x';
 const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feature/settings-workspace-preview-20261024',PHARMFLOW_STAGING_SUPABASE_URL:'https://tovkcakucyagvbzvlnks.supabase.co',PHARMFLOW_STAGING_SUPABASE_ANON_KEY:key({ref:'tovkcakucyagvbzvlnks',role:'anon'})};
 assert.equal(stagingPreviewConfig(env).url,env.PHARMFLOW_STAGING_SUPABASE_URL);
 for(const changes of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},{PHARMFLOW_STAGING_SUPABASE_URL:'https://zznoshzcyxmtwfbznjyr.supabase.co'},{PHARMFLOW_STAGING_SUPABASE_ANON_KEY:key({ref:'tovkcakucyagvbzvlnks',role:'service_role'})},{PHARMFLOW_STAGING_SUPABASE_ANON_KEY:key({ref:'zznoshzcyxmtwfbznjyr',role:'anon'})}])assert.throws(()=>stagingPreviewConfig({...env,...changes}));
 const runtime=fs.readFileSync('js/supabase.js','utf8');assert(!runtime.includes('zznoshzcyxmtwfbznjyr'));assert(runtime.includes('Connection disabled; no Production fallback'));
});
test('generated review reuses real markup and renderers, with no app initialization or connections',()=>{
 const review=fs.readFileSync('dist/settings-ui-review.html','utf8'),{document}=parseHTML(review);
 assert(document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("connect-src 'none'"));
 const paths=[...document.querySelectorAll('script[src]')].map(e=>e.getAttribute('src'));
 assert.deepEqual(paths,['/settings-review-runtime.js','/js/settings-workspace.js','/js/header-account-menu.js','/js/header-account-popover.js','/js/header-account-ui.js']);
 const runtime=fs.readFileSync('dist/settings-review-runtime.js','utf8');assert(!/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|serviceWorker|WebSocket/.test(runtime));
 const app=parseHTML(html).document;for(const id of ['settingsItemsPanel','settingsDataPanel','settingsAccessPanel'])assert.equal(document.getElementById(id).outerHTML,app.getElementById(id).outerHTML.replace('id="ownerManagementCard" class="contentCard ownerControlCenter settingsModuleCard" hidden','id="ownerManagementCard" class="contentCard ownerControlCenter settingsModuleCard"'));
});
test('review delegates Owner actions only once and retains actual destructive confirmation source',()=>{
 const runtime=fs.readFileSync('dist/settings-review-runtime.js','utf8');
 assert.equal((runtime.match(/handleOwnerPharmacyAction\(btn\)/g)||[]).length,1);
 assert(!runtime.includes("document.getElementById('ownerPharmacyList').addEventListener"));
 const app=fs.readFileSync('js/app.js','utf8');
 for(const name of ['requestResetWorkspace','requestDeleteAllHistory']){
 const start=app.indexOf('function '+name+'(');assert(runtime.includes(app.slice(start,app.indexOf('\n}',start)+2)));
 }
});
