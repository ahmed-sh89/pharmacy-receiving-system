const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),cp=require('child_process');
const {parseHTML}=require('linkedom');const html=fs.readFileSync('index.html','utf8'),auth=fs.readFileSync('js/auth.js','utf8');
function fn(name){const start=auth.search(new RegExp('(?:async )?function '+name+'\\('));return auth.slice(start,auth.indexOf('\n}',start)+2);}
function fixture(){
 const {document,window}=parseHTML(html);let active=document.body;Object.defineProperty(document,'activeElement',{get:()=>active});
 document.querySelectorAll('*').forEach(el=>{el.focus=()=>{active=el;};el.select=()=>{};});
 const state={ownerPharmacies:[{pharmacy_id:'a',pharmacy_code:'AAA001',pharmacy_name:'Harbor Test',admin_email:'owner@example.invalid',admin_user_id:'user-a',status:'active'},{pharmacy_id:'b',pharmacy_code:'BBB002',pharmacy_name:'Community Test',pending_admin_email:'pending@example.invalid',status:'suspended'},{pharmacy_id:'c',pharmacy_code:'CCC003',pharmacy_name:'Another Test',admin_email:'other@example.invalid',status:'active',active:false}],ownerRegistrations:[{request_id:'p',request_status:'pending',pharmacy_code:'REQ001',applicant_email:'request@example.invalid'},{request_id:'old',request_status:'approved'}]};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const actions=[],ctx={document,window,Event:window.Event,AuthState:state,setText:(id,v)=>{document.getElementById(id).textContent=v;},escapeAuthHtml:esc,formatAuthDate:()=>'',handleOwnerPharmacyAction:b=>actions.push(b.dataset),reviewRegistration:(...v)=>actions.push(v),setOwnerManagementMessage:()=>{}};
 vm.createContext(ctx);for(const name of ['renderOwnerMetrics','ownerPharmacyMatchesSearch','getOwnerPharmacyRowsForView','renderOwnerPharmacies','openOwnerManagementPanel','renderOwnerManagementPanel','renderOwnerRegistrationRequests'])vm.runInContext(fn(name),ctx);
 document.querySelectorAll('[data-owner-view]').forEach(b=>b.addEventListener('click',()=>ctx.openOwnerManagementPanel(b.dataset.ownerView)));
 const input=document.getElementById('ownerManagementSearch');input.addEventListener('input',()=>{state.ownerManagementSearch=input.value;ctx.renderOwnerManagementPanel();});
 ctx.renderOwnerManagementPanel();return {document,window,state,ctx,actions,input};
}
test('KPI counts keep canonical definitions; each click selects and filters inline',()=>{
 const {document,ctx}=fixture();ctx.renderOwnerMetrics();assert.deepEqual(['ownerMetricTotalPharmacies','ownerMetricActivePharmacies','ownerMetricPendingRequests','ownerMetricSuspendedPharmacies'].map(id=>document.getElementById(id).textContent),['3','1','1','2']);
 for(const [view,count] of [['total',3],['active',1],['suspended',2]]){
  document.querySelector(`[data-owner-view="${view}"]`).click();assert.equal(document.querySelectorAll('#ownerPharmacyList .ownerPharmacyRow').length,count);
  assert.equal(document.querySelectorAll('[data-owner-view][aria-pressed="true"]').length,1);assert(document.querySelector(`[data-owner-view="${view}"]`).classList.contains('active'));
 }
 document.querySelector('[data-owner-view="pending"]').click();assert.equal(document.getElementById('ownerPharmacyList').hidden,true);assert.equal(document.querySelectorAll('#ownerRegistrationRequests tbody>tr').length,1);
 assert.equal(document.querySelector('#ownerManagementPanel[role="dialog"]'),null);assert(!html.includes('btnCloseOwnerManagement'));
});
test('search combines with KPI across name/code/admin email and preserves query while switching',()=>{
 const {document,window,ctx,input}=fixture();
 const search=value=>{input.value=value;input.dispatchEvent(new window.Event('input'));};
 document.querySelector('[data-owner-view="active"]').click();search('EXAMPLE.INVALID');assert.equal(document.querySelectorAll('#ownerPharmacyList .ownerPharmacyRow').length,1);
 search('BBB002');assert.equal(document.querySelectorAll('#ownerPharmacyList .ownerPharmacyRow').length,0);assert.match(document.getElementById('ownerPharmacyList').textContent,/No pharmacies match/);
 document.querySelector('[data-owner-view="suspended"]').click();assert.equal(input.value,'BBB002');assert.equal(document.querySelectorAll('#ownerPharmacyList .ownerPharmacyRow').length,1);
 search('community');assert.equal(document.querySelectorAll('#ownerPharmacyList .ownerPharmacyRow').length,1);
 document.querySelector('[data-owner-view="pending"]').click();assert.match(document.getElementById('ownerRegistrationRequests').textContent,/No pending requests match/);
 search('request@example');assert.equal(document.querySelectorAll('#ownerRegistrationRequests tbody>tr').length,1);
 ctx.renderOwnerMetrics();assert.equal(document.getElementById('ownerMetricPendingRequests').textContent,'1');
});
test('single-open pharmacy rows preserve actions and show only admin email',()=>{
 const {document,ctx,state,actions}=fixture();state.ownerPharmacies[0].admin_name='TC26 Test Operator';ctx.renderOwnerPharmacies();
 const rows=[...document.querySelectorAll('.ownerPharmacyRow')],first=rows[0],second=rows[1];
 assert(!document.getElementById('ownerPharmacyList').textContent.includes('TC26 Test Operator'));
 first.querySelector('.ownerPharmacySummary').click();assert.equal(first.querySelector('.ownerPharmacyDetails').hidden,false);
 second.querySelector('.ownerPharmacySummary').click();assert.equal(first.querySelector('.ownerPharmacyDetails').hidden,true);assert.equal(second.querySelector('.ownerPharmacyDetails').hidden,false);
 second.querySelector('.ownerPharmacySummary').click();assert.equal(second.querySelector('.ownerPharmacyDetails').hidden,true);
 first.querySelector('.ownerPharmacySummary').click();for(const action of ['identity','admin','reset-password','suspend'])first.querySelector(`[data-owner-action="${action}"]`).click();
 assert.deepEqual(actions.map(a=>a.ownerAction),['identity','admin','reset-password','suspend']);assert(actions.every(a=>a.pharmacyId==='a'));assert.equal(actions[2].adminUserId,'user-a');
 const css=fs.readFileSync('css/settings-workspace.css','utf8');assert.match(css,/#ownerPharmacyList\{[^}]*max-height:[^}]*overflow-y:auto/);
});
test('shared KPI style is reused without changing Receiving declarations',()=>{
 const old=cp.execFileSync('git',['show','ef0077c:css/receiving-approved-visuals.css'],{encoding:'utf8'});
 const current=fs.readFileSync('css/receiving-approved-visuals.css','utf8').replaceAll(':is(#page-receiving,#settingsAccessPanel)','#page-receiving');assert.equal(current,old);
 const base=cp.execFileSync('git',['show','ef0077c:css/receiving-surface.css'],{encoding:'utf8'});assert.equal(fs.readFileSync('css/receiving-surface.css','utf8').replaceAll(':is(#page-receiving,#settingsAccessPanel)','#page-receiving'),base);
 assert.equal(parseHTML(html).document.querySelectorAll('#settingsAccessPanel .pfnIssueCard').length,4);
});
test('Database label changes presentation only; all mapping-service and parser logic remains intact',()=>{
 const ui=fs.readFileSync('ui.js','utf8');const start=ui.indexOf('function renderV2IdentifierAdministration'),end=ui.indexOf('\nsetTimeout(()=>{',start),renderer=ui.slice(start,end);
 assert(renderer.includes('DATABASE · USED FOR RESOLUTION'));assert(!renderer.includes('GLOBAL MASTER ·'));assert(renderer.includes('mappingScope:"GLOBAL"'));assert(renderer.includes('resolutionPriority:shadowed?"FALLBACK":"GLOBAL"'));
 const pairs=[['GLOBAL MASTER · LOWER PRIORITY','DATABASE · LOWER PRIORITY'],['GLOBAL MASTER · USED FOR RESOLUTION','DATABASE · USED FOR RESOLUTION'],['unused Global item','unused Database item'],['Global mappings remain read only.','Database mappings remain read only.'],['"current-pharmacy":"Global"','"current-pharmacy":"Database"'],['No matching Global item found.','No matching Database item found.'],['new Global Master item','new Database item'],['Item already exists in Global Master.','Item already exists in Database.'],['"Unable to check Global Master"','"Unable to check Database"'],['"Item added to Global Master"','"Item added to Database"']];
 let expected=cp.execFileSync('git',['show','ef0077c:ui.js'],{encoding:'utf8'});const a=expected.indexOf('function renderV2IdentifierAdministration'),b=expected.indexOf('\nsetTimeout(()=>{',a);let block=expected.slice(a,b);for(const [old,newLabel]of pairs)block=block.replaceAll(old,newLabel);expected=expected.slice(0,a)+block+expected.slice(b);assert.equal(ui,expected);
});
test('footer retains dynamic code, connectivity and autosave nodes/logic; hiding is Desktop-only',()=>{
 const old=cp.execFileSync('git',['show','ef0077c:index.html'],{encoding:'utf8'});const footer=s=>s.slice(s.indexOf('<div class="sidebarFooter'),s.indexOf('<!-- ==================================================',s.indexOf('<div class="sidebarFooter')));
 assert.equal(footer(html),footer(old));
 const css=fs.readFileSync('css/header-account-shell.css','utf8');assert.match(css,/:root body:not\(\.zebraDevice\) \.headerShellFooter \.sidebarConnection,[\s\S]*?\.autoSaveStatus\{display:none\s*\}/);
 for(const p of ['js/header-account-ui.js','js/pharmflow-next.js','js/state.js','js/handheld-runtime.js','js/session.js','cloud-workspace.js'])assert.equal(fs.readFileSync(p,'utf8'),cp.execFileSync('git',['show','ef0077c:'+p],{encoding:'utf8'}),p);
});

test('inline editing stays singular and cancels on collapse, replacement or filtering',async()=>{
 const {document,window}=fixture();window.HTMLElement.prototype.focus=function(){};window.HTMLElement.prototype.select=function(){};
 const code=fs.readFileSync('js/settings-workspace.js','utf8'),start=code.indexOf('function settingsInlinePrompt('),end=code.indexOf('\nwindow.settingsTextPrompt=',start);
 const context={document,MutationObserver:window.MutationObserver};vm.createContext(context);vm.runInContext(code.slice(start,end),context);
 const row=document.querySelector('.ownerPharmacyRow'),anchor=row.querySelector('[data-owner-action="identity"]');row.querySelector('.ownerPharmacySummary').click();
 const prompt=label=>context.settingsInlinePrompt({title:'Edit Pharmacy',label,value:'Original',anchor});
 let previous=prompt('Pharmacy Name'),result=prompt('Admin email');assert.equal(await previous,null);assert.equal(document.querySelectorAll('.ownerInlineEdit form').length,1);
 let form=document.querySelector('.ownerInlineEdit form');form.querySelector('input').value='Exact Value';form.dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(await result,'Exact Value');
 result=prompt('Pharmacy Code');row.querySelector('.ownerPharmacySummary').click();assert.equal(await result,null);assert.equal(document.querySelectorAll('.ownerInlineEdit').length,0);
 row.querySelector('.ownerPharmacySummary').click();result=prompt('Pharmacy Code');document.querySelectorAll('.ownerPharmacySummary')[1].click();assert.equal(await result,null);
 row.querySelector('.ownerPharmacySummary').click();result=prompt('Pharmacy Code');document.getElementById('ownerPharmacyList').innerHTML='';assert.equal(await result,null);
});

function focusedFixture(){
 const f=fixture(),{document,window,state}=f;
 window.HTMLElement.prototype.focus=function(){};window.HTMLElement.prototype.select=function(){};
 const code=fs.readFileSync('js/settings-workspace.js','utf8'),start=code.indexOf('function settingsInlinePrompt('),end=code.indexOf('\nwindow.settingsTextPrompt=',start);
 const context={document,window,AuthState:state,MutationObserver:window.MutationObserver,renderOwnerManagementPanel:()=>f.ctx.renderOwnerManagementPanel()};vm.createContext(context);
 vm.runInContext(code.slice(start,end),context);vm.runInContext(code.slice(code.indexOf('// Access action navigation owns')),context);
 let confirmation=true,confirmations=0;window.settingsConfirm=async()=>{confirmations++;return confirmation;};
 return {...f,prompt:context.settingsInlinePrompt,actionsUI:window.SettingsAccessActions,setConfirmation:v=>confirmation=v,confirmations:()=>confirmations};
}
test('focused actions keep one target/action and Back restores search, KPI and scroll',async()=>{
 const f=focusedFixture(),{document,state,ctx,input,actionsUI}=f;state.ownerManagementView='total';state.ownerManagementSearch='example.invalid';input.value=state.ownerManagementSearch;ctx.renderOwnerManagementPanel();
 for(const action of ['identity','admin','reset-password','suspend']){
  const list=document.getElementById('ownerPharmacyList');list.scrollTop=93;
  const button=document.querySelector(`[data-owner-action="${action}"]`);let called=0;
  await actionsUI.run(button,async()=>{called++;assert.equal(actionsUI.target(),'a');assert.equal([...list.querySelectorAll('.ownerPharmacyRow')].filter(r=>!r.hidden).length,1);assert.equal([...list.querySelectorAll('[data-owner-action]')].filter(b=>!b.hidden && !b.closest('.ownerPharmacyRow').hidden).length,1);assert(input.disabled);});
  assert.equal(called,1);assert(list.classList.contains('ownerActionFocused'));assert.equal(await actionsUI.back(),true);
  assert.equal(list.scrollTop,93);assert.equal(input.value,'example.invalid');assert.equal(state.ownerManagementView,'total');assert.equal(input.disabled,false);assert.equal(document.querySelectorAll('.ownerPharmacyRow').length,3);assert.equal(actionsUI.target(),null);
 }
});
test('Back protects a draft across sequential fields; refresh and repeated action cannot duplicate or discard it',async()=>{
 const f=focusedFixture(),{document,window,ctx,actionsUI,prompt}=f;const anchor=document.querySelector('[data-owner-action="identity"]');
 const running=actionsUI.run(anchor,async()=>{const name=await prompt({title:'Edit Pharmacy',label:'Pharmacy Name',value:'Original',anchor});if(name===null)return;return prompt({title:'Edit Pharmacy',label:'Pharmacy Code',value:'AAA001',anchor});});
 let form=document.querySelector('.ownerInlineEdit form');form.querySelector('input').value='Unsaved name';form.querySelector('input').dispatchEvent(new window.Event('input',{bubbles:true}));
 ctx.renderOwnerManagementPanel();assert.equal(document.querySelector('.ownerInlineEdit input').value,'Unsaved name');
 await actionsUI.run(anchor,()=>{throw Error('duplicate handler');});assert.equal(document.querySelectorAll('.ownerInlineEdit').length,1);
 f.setConfirmation(false);assert.equal(await actionsUI.back(),false);assert.equal(document.querySelector('.ownerInlineEdit input').value,'Unsaved name');
 form.dispatchEvent(new window.Event('submit',{cancelable:true}));await Promise.resolve();await Promise.resolve();
 assert.equal(document.querySelector('.ownerInlineEdit input').value,'AAA001');assert.equal(await actionsUI.back(),false,'prior field is still unsaved');
 f.setConfirmation(true);assert.equal(await actionsUI.back(),true);await running;assert.equal(document.querySelectorAll('.ownerInlineEdit').length,0);assert.equal(actionsUI.target(),null);assert.equal(f.confirmations(),3);
});
test('refresh after a status action retains the focused target; Back reapplies the saved filter',async()=>{
 const f=focusedFixture(),{document,state,ctx,actionsUI}=f;state.ownerManagementView='active';ctx.renderOwnerManagementPanel();
 let done;const running=actionsUI.run(document.querySelector('[data-owner-action="suspend"]'),()=>new Promise(resolve=>{done=resolve;}));
 state.busy=true;assert.equal(await actionsUI.back(),false);state.ownerPharmacies[0].status='suspended';state.ownerPharmacies[0].active=false;ctx.renderOwnerPharmacies();assert.equal(document.querySelectorAll('.ownerPharmacyRow').length,1);assert.equal(document.querySelector('.ownerPharmacyState').textContent,'SUSPENDED');
 state.busy=false;done();await running;await actionsUI.back();assert.match(document.getElementById('ownerPharmacyList').textContent,/No pharmacies match/);assert.equal(state.ownerManagementView,'active');
 const css=fs.readFileSync('css/settings-workspace.css','utf8');assert(css.includes('grid-auto-rows:max-content'));assert.match(css,/ownerPharmacyList\.ownerActionFocused\{max-height:none;overflow:visible/);assert.match(css,/ownerPharmacySummary\{[^}]*112px 18px/);
});
test('leaving Access by tab uses the same unsaved-change guard',async()=>{
 const f=focusedFixture(),{document,window,actionsUI,prompt}=f;document.getElementById('ownerManagementCard').hidden=false;
 const code=fs.readFileSync('js/settings-workspace.js','utf8');vm.runInNewContext(code.slice(0,code.indexOf('// Shared Settings prompt')), {document,window,MutationObserver:window.MutationObserver});
 document.getElementById('settingsAccessTab').click();
 const anchor=document.querySelector('[data-owner-action="admin"]');const running=actionsUI.run(anchor,()=>prompt({title:'Pharmacy Admin',label:'Admin email',value:'old@example.invalid',anchor}));
 const input=document.querySelector('.ownerInlineEdit input');input.value='new@example.invalid';input.dispatchEvent(new window.Event('input',{bubbles:true}));f.setConfirmation(false);
 document.getElementById('settingsDataTab').click();await Promise.resolve();await Promise.resolve();assert.equal(document.getElementById('settingsAccessTab').getAttribute('aria-selected'),'true');assert.equal(input.value,'new@example.invalid');
 f.setConfirmation(true);document.getElementById('settingsDataTab').click();await running;await Promise.resolve();await Promise.resolve();assert.equal(document.getElementById('settingsDataTab').getAttribute('aria-selected'),'true');assert.equal(actionsUI.target(),null);
});
