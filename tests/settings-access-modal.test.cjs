const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom'),{installModalDOM,loadModalRuntime}=require('./helpers/settings-modal-dom.cjs');
const source=fs.readFileSync('js/auth.js','utf8'),settings=fs.readFileSync('js/settings-workspace.js','utf8');
function fn(name){const a=source.search(new RegExp('(?:async )?function '+name+'\\('));return source.slice(a,source.indexOf('\n}',a)+2);}
const tick=()=>new Promise(setImmediate);
function fixture(){
 const {document,window:dom}=parseHTML(fs.readFileSync('index.html','utf8'));installModalDOM(document,dom);
 document.querySelectorAll('.authGate').forEach(el=>el.remove());
 const state={ownerManagementView:'active',ownerManagementSearch:'QA',ownerManagementSort:'oldest',ownerPharmacies:[{pharmacy_id:'a',pharmacy_name:'QA Alpha',pharmacy_code:'QA001',admin_email:'admin@example.invalid',admin_user_id:'user',status:'active',created_at:'2026-10-20'}]};
 const calls=[],window={addEventListener(){}};let copied='',rerenders=0;
 const ctx={document,window,AuthState:state,Event:dom.Event,navigator:{clipboard:{writeText:async s=>{copied=s;}}},setTimeout(){},isSystemOwner:()=>true,setAuthBusy:b=>state.busy=b,escapeAuthHtml:s=>String(s||''),setText:(id,t)=>document.getElementById(id).textContent=t,reviewRegistration(){},setOwnerManagementMessage(){},setSettingsAccessMessage(){},loadOwnerPharmacies:async()=>{},loadMyAppContext:async()=>{},renderAuthState(){},authRpc:async(n,args)=>{calls.push([n,args]);return [];},callPasswordAdmin:async p=>{calls.push(['password',p]);return {temporary_password:'synthetic-test-only'};}};
 vm.createContext(ctx);for(const n of ['sortOwnerPharmacyRows','ownerPharmacyMatchesSearch','renderOwnerMetrics','getOwnerPharmacyRowsForView','renderOwnerPharmacies','renderOwnerManagementPanel','handleOwnerPharmacyAction'])vm.runInContext(fn(n),ctx);
 const render=ctx.renderOwnerManagementPanel;ctx.renderOwnerManagementPanel=()=>{rerenders++;return render();};
 loadModalRuntime(ctx,true);ctx.renderOwnerManagementPanel();
 return {document,dom,state,window,ctx,calls,getCopied:()=>copied,getRenders:()=>rerenders};
}
test('editable modal uses one dismissal guard for X, Cancel, Escape and backdrop without submitting',async()=>{
 for(const route of ['x','cancel','escape','backdrop']){
  const f=fixture();let accept=false,count=0;f.window.settingsConfirm=async()=>{count++;return accept;};
  const result=f.window.settingsTextPrompt({title:'Admin Assignment',label:'Email',value:'old@example.invalid'});const dialog=f.document.querySelector('dialog'),input=dialog.querySelector('input');
  input.value='new@example.invalid';input.dispatchEvent(new f.dom.Event('input',{bubbles:true}));
  async function dismiss(){
   if(route==='x')await dialog.querySelector('.settingsModalClose').onclick();
   if(route==='cancel')await dialog.querySelector('footer .secondaryButton').onclick();
   if(route==='escape')dialog.dispatchEvent(new f.dom.Event('cancel',{cancelable:true}));
   if(route==='backdrop'){const e=new f.dom.Event('click');e.clientX=0;e.clientY=0;dialog.dispatchEvent(e);}
   await tick();
  }
  await dismiss();assert(dialog.isConnected);assert.equal(input.value,'new@example.invalid');assert.equal(f.calls.length,0);accept=true;await dismiss();assert.equal(await result,null);assert(!dialog.isConnected);assert.equal(count,2);
 }
});
test('nested discard cancellation restores the active modal dismissal hook',async()=>{
 const f=fixture(),anchor=f.document.querySelector('[data-owner-action="admin"]');
 const run=f.window.SettingsAccessActions.run(anchor,()=>f.window.settingsTextPrompt({title:'Pharmacy Admin',label:'Email',value:'old@example.invalid'}));
 const parent=f.document.querySelector('dialog');parent.querySelector('input').value='new@example.invalid';parent.querySelector('input').dispatchEvent(new f.dom.Event('input',{bubbles:true}));
 const first=f.window.SettingsAccessActions.back();await tick();const nested=[...f.document.querySelectorAll('dialog')].at(-1);assert.notEqual(nested,parent);await nested.querySelector('footer .secondaryButton').onclick();assert.equal(await first,false);assert(parent.isConnected);
 const second=f.window.SettingsAccessActions.back();await tick();const discard=[...f.document.querySelectorAll('dialog')].at(-1);discard.querySelector('form').dispatchEvent(new f.dom.Event('submit',{cancelable:true}));await second;await run;assert.equal(f.document.querySelectorAll('dialog').length,0);
});
test('modal keyboard loops focus and restores the original button',async()=>{
 const f=fixture(),anchor=f.document.getElementById('btnOpenCreateAccount');anchor.focus();const p=f.window.settingsTextPrompt({title:'Edit',label:'Name',value:'QA'}),d=f.document.querySelector('dialog');
 const first=d.querySelector('.settingsModalClose'),last=d.querySelector('button[type="submit"]');last.focus();let e=new f.dom.Event('keydown',{cancelable:true});e.key='Tab';d.dispatchEvent(e);assert(f.document.activeElement===first);
 first.focus();e=new f.dom.Event('keydown',{cancelable:true});e.key='Tab';e.shiftKey=true;d.dispatchEvent(e);assert(f.document.activeElement===last);
 await first.onclick();await p;assert(f.document.activeElement===anchor);
});
test('action selection retains grid search/sort/KPI/scroll and restores row focus after close',async()=>{
 const f=fixture(),list=f.document.getElementById('ownerPharmacyList');list.scrollTop=127;const button=list.querySelector('[data-owner-action="admin"]');
 const run=f.window.SettingsAccessActions.run(button,()=>f.window.settingsTextPrompt({title:'Pharmacy Admin',label:'Email',value:'admin@example.invalid'}));
 assert.equal(f.window.SettingsAccessActions.action(),'admin');assert.equal(list.querySelectorAll('.ownerPharmacyRow').length,1);assert(!list.hidden);f.ctx.renderOwnerPharmacies();assert(f.document.querySelector('dialog input'));
 await f.document.querySelector('.settingsModalClose').onclick();await run;assert.equal(list.scrollTop,127);assert.equal(f.state.ownerManagementSearch,'QA');assert.equal(f.state.ownerManagementSort,'oldest');assert.equal(f.state.ownerManagementView,'active');assert.equal(f.document.activeElement.dataset.ownerAction,'admin');
});
test('Edit Pharmacy collects both fields together and preserves existing confirmation and RPC payload',async()=>{
 const f=fixture();const button=f.document.querySelector('[data-owner-action="identity"]');const run=f.window.SettingsAccessActions.run(button,()=>f.ctx.handleOwnerPharmacyAction(button));
 let d=f.document.querySelector('dialog');assert.equal(d.querySelectorAll('input').length,2);d.querySelector('[name="name"]').value='QA Edited';d.querySelector('[name="code"]').value='QA002';d.querySelector('form').dispatchEvent(new f.dom.Event('submit',{cancelable:true}));await tick();
 d=f.document.querySelector('dialog');assert.match(d.textContent,/Confirm Pharmacy Update/);assert.equal(f.calls.length,0);d.querySelector('form').dispatchEvent(new f.dom.Event('submit',{cancelable:true}));await run;assert.equal(f.calls[0][0],'owner_update_pharmacy_identity_v1');assert.equal(f.calls[0][1].p_official_pharmacy_name,'QA Edited');assert.equal(f.calls[0][1].p_official_pharmacy_code,'QA002');
});
test('Admin assignment still requires its separate confirmation',async()=>{
 const f=fixture(),button=f.document.querySelector('[data-owner-action="admin"]');const run=f.window.SettingsAccessActions.run(button,()=>f.ctx.handleOwnerPharmacyAction(button));
 let d=f.document.querySelector('dialog');d.querySelector('input').value='new@example.invalid';d.querySelector('form').dispatchEvent(new f.dom.Event('submit',{cancelable:true}));await tick();d=f.document.querySelector('dialog');assert.match(d.textContent,/Confirm Admin Assignment/);assert.equal(f.calls.length,0);await d.querySelector('footer .secondaryButton').onclick();await run;assert.equal(f.calls.length,0);
});
test('Reset requires confirmation, offers Copy Password and can close the result while auth is busy',async()=>{
 const f=fixture(),button=f.document.querySelector('[data-owner-action="reset-password"]');const run=f.window.SettingsAccessActions.run(button,()=>f.ctx.handleOwnerPharmacyAction(button));
 let d=f.document.querySelector('dialog');assert.match(d.textContent,/Reset Password/);assert.equal(f.calls.length,0);d.querySelector('form').dispatchEvent(new f.dom.Event('submit',{cancelable:true}));await tick();
 d=f.document.querySelector('dialog');assert(d.querySelector('input').readOnly);assert.equal(f.state.busy,true);const copy=[...d.querySelectorAll('button')].find(el=>el.textContent==='Copy Password');await copy.onclick();assert.equal(f.getCopied(),'synthetic-test-only');await d.querySelector('.settingsModalClose').onclick();await run;assert.equal(f.state.busy,false);assert.equal(f.calls[0][0],'password');
});
test('Suspend and Reactivate use compact titled confirmations and preserve status RPC',async()=>{
 for(const action of ['suspend','activate']){const f=fixture(),button=f.document.querySelector('[data-owner-action="suspend"]');button.dataset.ownerAction=action;const run=f.window.SettingsAccessActions.run(button,()=>f.ctx.handleOwnerPharmacyAction(button));const d=f.document.querySelector('dialog');assert.match(d.textContent,action==='suspend'?/Suspend Pharmacy/:/Reactivate Pharmacy/);d.querySelector('form').dispatchEvent(new f.dom.Event('submit',{cancelable:true}));await run;assert.equal(f.calls[0][0],'owner_set_pharmacy_status');assert.equal(f.calls[0][1].p_status,action==='suspend'?'suspended':'active');}
});
test('email copy remains an accessible icon, gives copied confirmation and never expands the row',async()=>{
 const f=fixture();vm.runInContext(settings.slice(settings.indexOf('window.copyPharmacyEmail=')),f.ctx);const button=f.document.querySelector('[data-copy-email]');assert(button.querySelector('svg'));assert.equal(button.textContent,'');assert.equal(button.getAttribute('aria-label'),'Copy admin email');assert.equal(button.title,'Copy email');await f.window.copyPharmacyEmail(button);assert.equal(f.getCopied(),'admin@example.invalid');assert.equal(button.getAttribute('aria-label'),'Email copied');assert.match(f.document.getElementById('ownerCopyFeedback').textContent,/Email copied/);assert.equal(f.document.querySelector('.ownerPharmacySummary').getAttribute('aria-expanded'),'false');
});
