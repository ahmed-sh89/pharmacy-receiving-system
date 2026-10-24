const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom'),{stripTypeScriptTypes}=require('node:module');
const auth=fs.readFileSync('js/auth.js','utf8'),settings=fs.readFileSync('js/settings-workspace.js','utf8');
const fn=name=>{const start=auth.search(new RegExp('(?:async )?function '+name+'\\('));return auth.slice(start,auth.indexOf('\n}',start)+2);};
function dom(){const d=parseHTML(fs.readFileSync('index.html','utf8'));d.window.HTMLElement.prototype.focus=function(){};
 Object.defineProperty(d.window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.firstElementChild?.value||'';},set(value){for(const option of this.children)option.toggleAttribute('selected',option.value===value);}});return d;}
test('newest default and all sorts combine with canonical KPI/search without mutating source',()=>{
 const AuthState={ownerPharmacies:[{pharmacy_id:'a',pharmacy_name:'Zulu',created_at:'2024-01-01',status:'active'},{pharmacy_id:'b',pharmacy_name:'Alpha',created_at:'2026-01-01',status:'active'},{pharmacy_id:'c',pharmacy_name:'Unknown',created_at:null,status:'suspended'}]};
 const c={AuthState};vm.createContext(c);for(const n of ['sortOwnerPharmacyRows','ownerPharmacyMatchesSearch','getOwnerPharmacyRowsForView'])vm.runInContext(fn(n),c);
 const ids=()=>Array.from(c.getOwnerPharmacyRowsForView(),p=>p.pharmacy_id);
 assert.deepEqual(ids(),['b','a','c']);AuthState.ownerManagementSort='oldest';assert.deepEqual(ids(),['a','b','c']);
 AuthState.ownerManagementSort='az';assert.deepEqual(ids(),['b','c','a']);AuthState.ownerManagementSort='za';assert.deepEqual(ids(),['a','c','b']);
 AuthState.ownerManagementView='active';AuthState.ownerManagementSearch='alpha';assert.deepEqual(ids(),['b']);assert.equal(AuthState.ownerPharmacies[0].pharmacy_id,'a');
});
function createFixture(){const {document,window:domWindow}=dom();document.readyState='complete';const calls=[],memory=new Map();let confirm=true,fail=false;
 const window={SettingsAccessActions:{target:()=>null},settingsConfirm:async()=>confirm,addEventListener(){}};
 const form=document.getElementById('ownerCreateAccountForm');form.reportValidity=()=>true;form.reset=()=>{form.querySelectorAll('input,select').forEach(el=>el.value='');};
 const ctx={document,window,AuthState:{},sessionStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},crypto:require('node:crypto').webcrypto,isSystemOwner:()=>true,setAuthBusy(){},callPasswordAdmin:async p=>{calls.push(p);if(fail)throw Error('incomplete');return {credential_status:'EXISTING_LOGIN'};},loadOwnerPharmacies:async()=>{},renderOwnerManagementPanel(){}};
 vm.createContext(ctx);vm.runInContext(settings.slice(settings.indexOf('(function bindDirectAccountCreation(){'),settings.indexOf('\nwindow.pharmflowInitialPermissionFields=')),ctx);
 const field=n=>form.querySelector(`[name="${n}"]`),submit=()=>form.onsubmit({preventDefault(){}});
 for(const [n,v]of Object.entries({pharmacy_name:'QA',pharmacy_code:'QA001',admin_email:'test@example.invalid'}))field(n).value=v;
 return {document,window,domWindow,form,field,calls,memory,submit,setConfirm:x=>confirm=x,setFail:x=>fail=x};
}
test('create requires explicit permissions, journals them, retries same operation, never broadens automatically',async()=>{
 const f=createFixture();await f.submit();assert.equal(f.calls.length,0);
 f.field('receiving').value='FULL';f.field('expiry').value='DISABLED';f.field('data_access').value='READ_ONLY';f.setFail(true);
 await f.submit();const op=f.calls[0].operation_id;assert(op);assert.equal(f.calls[0].receiving,'FULL');assert.equal(f.calls[0].expiry,'DISABLED');
 f.field('expiry').value='FULL';await f.submit();assert.equal(f.calls.length,1);
 f.field('expiry').value='DISABLED';await f.submit();assert.equal(f.calls[1].operation_id,op);
 f.setFail(false);await f.submit();assert.equal(f.calls[2].operation_id,op);assert.equal(f.memory.size,0);assert.match(f.form.querySelector('[data-create-status]').textContent,/password is unchanged/);assert(!JSON.stringify([...f.memory]).includes('password'));
});
test('creation uses focused view and protects dirty Cancel/Back then restores list controls and scroll',async()=>{
 const f=createFixture();const list=f.document.getElementById('ownerPharmacyList');list.scrollTop=162;
 f.document.getElementById('btnOpenCreateAccount').click();assert.equal(f.document.getElementById('ownerManagementPanel').hidden,true);assert.equal(f.document.getElementById('ownerCreateAccountPanel').hidden,false);
 f.field('pharmacy_name').dispatchEvent(new f.domWindow.Event('input',{bubbles:true}));f.setConfirm(false);
 await f.form.querySelector('[data-create-cancel]').onclick();assert.equal(f.document.getElementById('ownerCreateAccountPanel').hidden,false);
 f.setConfirm(true);await f.document.getElementById('btnCreateAccountBack').onclick();assert.equal(f.document.getElementById('ownerCreateAccountPanel').hidden,true);assert.equal(list.scrollTop,162);assert.equal(f.document.getElementById('ownerManagementSort').disabled,false);
});
test('registration approval refuses missing permissions and sends explicit selections to atomic server API',async()=>{
 const {document}=dom();const calls=[];const ctx={document,window:{settingsConfirm:async()=>true},CSS:{escape:s=>s},isSystemOwner:()=>true,setSettingsAccessMessage(){},setAuthBusy(){},authRpc:async(...a)=>calls.push(a),loadOwnerControlCenter:async()=>{}};
 document.body.insertAdjacentHTML('beforeend','<input data-reg-name="r" value="QA"><input data-reg-code="r" value="QA001"><select data-permission-request="r" data-initial-permission="receiving"><option value="FULL" selected>Enabled</option></select><select data-permission-request="r" data-initial-permission="expiry"><option value="DISABLED" selected>Disabled</option></select><select data-permission-request="r" data-initial-permission="data_access"><option value="">Choose</option><option value="PHARMACY_ONLY">Pharmacy Only</option></select>');
 vm.createContext(ctx);vm.runInContext(fn('reviewRegistration'),ctx);await ctx.reviewRegistration('r','approve');assert.equal(calls.length,0);
 document.querySelector('[data-initial-permission="data_access"]').value='PHARMACY_ONLY';await ctx.reviewRegistration('r','approve');assert.equal(calls[0][0],'owner_review_pharmacy_registration_v3');assert.equal(calls[0][1].p_receiving,'FULL');assert.equal(calls[0][1].p_expiry,'DISABLED');assert.equal(calls[0][1].p_data_access,'PHARMACY_ONLY');
});
test('suspension replaces registration instruction; reactivation restores ordinary pending view',()=>{
 const {document}=dom(),AuthState={ownerExists:true,user:{email:'qa@example.invalid'},pharmacyAccessStatus:{suspended:true}};
 const c={document,AuthState,setText:(id,t)=>document.getElementById(id).textContent=t};vm.createContext(c);vm.runInContext(fn('renderPendingAccessPanel'),c);c.renderPendingAccessPanel();assert(document.getElementById('pendingStandardAccessBox').hidden);assert(!document.getElementById('pendingSuspendedBox').hidden);
 AuthState.pharmacyAccessStatus.suspended=false;c.renderPendingAccessPanel();assert(!document.getElementById('pendingStandardAccessBox').hidden);assert(document.getElementById('pendingSuspendedBox').hidden);
});
test('email rate limit shows readable actionable message and does not alter signup verification',()=>{
 const {document}=dom();const c={document};vm.createContext(c);vm.runInContext(fn('setAuthMessage'),c);c.setAuthMessage('email rate limit exceeded','error');assert.match(document.getElementById('authMessage').textContent,/Email sending limit reached/);
});
test('20-character temporary credentials retain 96 random bits and all required character classes',()=>{
 const source=fs.readFileSync('supabase/functions/pharmflow-password-admin/index.ts','utf8');const a=source.indexOf('const temporaryPassword'),b=source.indexOf('\nDeno.serve',a);
 const c={crypto:require('node:crypto').webcrypto,btoa:s=>Buffer.from(s,'binary').toString('base64')};vm.createContext(c);vm.runInContext(source.slice(a,b)+'\nthis.makePassword=temporaryPassword;',c);
 const passwords=new Set();for(let i=0;i<1000;i++){const p=c.makePassword();assert.equal(p.length,20);assert.match(p,/^Pf7![A-Za-z0-9_-]{16}$/);passwords.add(p);}assert.equal(passwords.size,1000);
});
test('privileged create forwards initial permissions to prepare and finish without changing existing credentials',async()=>{
 let handler;const calls=[];const client={auth:{getUser:async()=>({data:{user:{id:'owner',app_metadata:{}}}})},rpc:async(n,p)=>{calls.push([n,p]);return {data:{admin_user_id:'existing',admin_email:'existing@example.invalid',completed:p.p_finish===true}};}};
 const admin={auth:{admin:{createUser:()=>{throw Error('Existing credentials overwritten');},updateUserById:()=>{throw Error('Existing credentials reset');}}}};
 const ctx={Response,crypto:require('node:crypto').webcrypto,btoa:s=>Buffer.from(s,'binary').toString('base64'),Deno:{env:{get:n=>({SUPABASE_URL:'https://tovkcakucyagvbzvlnks.supabase.co',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture-service'})[n]},serve:f=>handler=f},createClient:(url,key)=>key==='fixture-service'?admin:client};
 let source=fs.readFileSync('supabase/functions/pharmflow-password-admin/index.ts','utf8').replace(/^import .*\n/,'');source=stripTypeScriptTypes(source);vm.createContext(ctx);vm.runInContext(source,ctx);
 const response=await handler(new Request('https://fixture',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({action:'create-account',operation_id:'op',pharmacy_name:'QA',pharmacy_code:'QA1',admin_email:'existing@example.invalid',receiving:'FULL',expiry:'DISABLED',data_access:'READ_ONLY'})}));
 assert.equal(response.status,200);assert.equal(calls.length,2);assert(calls.every(([n,p])=>n==='owner_provision_pharmacy_v2'&&p.p_receiving==='FULL'&&p.p_expiry==='DISABLED'&&p.p_data_access==='READ_ONLY'));assert.equal(calls[1][1].p_finish,true);assert.equal((await response.json()).credential_status,'EXISTING_LOGIN');
});
