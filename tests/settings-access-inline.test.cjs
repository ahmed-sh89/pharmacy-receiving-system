const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),cp=require('child_process');
const {parseHTML}=require('linkedom');const html=fs.readFileSync('index.html','utf8'),auth=fs.readFileSync('js/auth.js','utf8');
function fn(name){const start=auth.search(new RegExp('(?:async )?function '+name+'\\('));return auth.slice(start,auth.indexOf('\n}',start)+2);}
function fixture(){
 const {document,window}=parseHTML(html);let active=document.body;Object.defineProperty(document,'activeElement',{get:()=>active});
 document.querySelectorAll('*').forEach(el=>{el.focus=()=>{active=el;};el.select=()=>{};});
 const state={ownerPharmacies:[{pharmacy_id:'a',pharmacy_code:'AAA001',pharmacy_name:'Harbor Test',admin_email:'owner@example.invalid',admin_user_id:'user-a',status:'active'},{pharmacy_id:'b',pharmacy_code:'BBB002',pharmacy_name:'Community Test',pending_admin_email:'pending@example.invalid',status:'suspended'},{pharmacy_id:'c',pharmacy_code:'CCC003',pharmacy_name:'Another Test',admin_email:'other@example.invalid',status:'active',active:false}],ownerRegistrations:[{request_id:'p',request_status:'pending',pharmacy_code:'REQ001',applicant_email:'request@example.invalid'},{request_id:'old',request_status:'approved'}]};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const actions=[],ctx={document,window,AuthState:state,setText:(id,v)=>{document.getElementById(id).textContent=v;},escapeAuthHtml:esc,formatAuthDate:()=>'',handleOwnerPharmacyAction:b=>actions.push(b.dataset),reviewRegistration:(...v)=>actions.push(v),setOwnerManagementMessage:()=>{}};
 vm.createContext(ctx);for(const name of ['renderOwnerMetrics','ownerPharmacyMatchesSearch','getOwnerPharmacyRowsForView','renderOwnerPharmacies','openOwnerManagementPanel','renderOwnerManagementPanel','renderOwnerRegistrationRequests'])vm.runInContext(fn(name),ctx);
 document.querySelectorAll('[data-owner-view]').forEach(b=>b.addEventListener('click',()=>ctx.openOwnerManagementPanel(b.dataset.ownerView)));
 const input=document.getElementById('ownerManagementSearch');input.addEventListener('input',()=>{state.ownerManagementSearch=input.value;ctx.renderOwnerManagementPanel();});
 ctx.renderOwnerManagementPanel();return {document,window,state,ctx,actions,input};
}
test('KPI counts keep canonical definitions; each click selects and filters inline',()=>{
 const {document,ctx}=fixture();ctx.renderOwnerMetrics();assert.deepEqual(['ownerMetricTotalPharmacies','ownerMetricActivePharmacies','ownerMetricPendingRequests','ownerMetricSuspendedPharmacies'].map(id=>document.getElementById(id).textContent),['3','1','1','2']);
 for(const [view,count] of [['total',3],['active',1],['suspended',2]]){
  document.querySelector(`[data-owner-view="${view}"]`).click();assert.equal(document.querySelectorAll('#ownerPharmacyList tbody>tr').length,count);
  assert.equal(document.querySelectorAll('[data-owner-view][aria-pressed="true"]').length,1);assert(document.querySelector(`[data-owner-view="${view}"]`).classList.contains('active'));
 }
 document.querySelector('[data-owner-view="pending"]').click();assert.equal(document.getElementById('ownerPharmacyList').hidden,true);assert.equal(document.querySelectorAll('#ownerRegistrationRequests tbody>tr').length,1);
 assert.equal(document.querySelector('#ownerManagementPanel[role="dialog"]'),null);assert(!html.includes('btnCloseOwnerManagement'));
});
test('search combines with KPI across name/code/admin email and preserves query while switching',()=>{
 const {document,window,ctx,input}=fixture();
 const search=value=>{input.value=value;input.dispatchEvent(new window.Event('input'));};
 document.querySelector('[data-owner-view="active"]').click();search('EXAMPLE.INVALID');assert.equal(document.querySelectorAll('#ownerPharmacyList tbody>tr').length,1);
 search('BBB002');assert.equal(document.querySelectorAll('#ownerPharmacyList tbody>tr').length,0);assert.match(document.getElementById('ownerPharmacyList').textContent,/No pharmacies match/);
 document.querySelector('[data-owner-view="suspended"]').click();assert.equal(input.value,'BBB002');assert.equal(document.querySelectorAll('#ownerPharmacyList tbody>tr').length,1);
 search('community');assert.equal(document.querySelectorAll('#ownerPharmacyList tbody>tr').length,1);
 document.querySelector('[data-owner-view="pending"]').click();assert.match(document.getElementById('ownerRegistrationRequests').textContent,/No pending requests match/);
 search('request@example');assert.equal(document.querySelectorAll('#ownerRegistrationRequests tbody>tr').length,1);
 ctx.renderOwnerMetrics();assert.equal(document.getElementById('ownerMetricPendingRequests').textContent,'1');
});
test('table actions keep their target identities and no account role is invented',()=>{
 const {document,ctx,state,actions}=fixture();const headers=()=>[...document.querySelectorAll('#ownerPharmacyList th')].map(e=>e.textContent);
 assert.deepEqual(headers(),['Pharmacy Code','Pharmacy Name','Admin Email','Status','Actions']);
 const first=document.querySelector('#ownerPharmacyList tbody>tr');for(const action of ['identity','admin','reset-password','suspend'])first.querySelector(`[data-owner-action="${action}"]`).click();
 assert.deepEqual(actions.map(a=>a.ownerAction),['identity','admin','reset-password','suspend']);assert(actions.every(a=>a.pharmacyId==='a'));assert.equal(actions[2].adminUserId,'user-a');
 state.ownerPharmacies[0].admin_role='admin';ctx.renderOwnerPharmacies();assert(headers().includes('Role'));assert.equal(document.querySelector('#ownerPharmacyList tbody>tr').children[4].textContent,'admin');
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

test('inline editing submits exact values, cancels, and aborts when filtering removes its row',async()=>{
 const {document,window}=fixture();
 window.HTMLElement.prototype.focus=function(){};window.HTMLElement.prototype.select=function(){};
 const code=fs.readFileSync('js/settings-workspace.js','utf8');const start=code.indexOf('function settingsInlinePrompt('),end=code.indexOf('\nwindow.settingsTextPrompt=',start);
 const context={document,MutationObserver:window.MutationObserver};vm.createContext(context);vm.runInContext(code.slice(start,end),context);
 const anchor=document.querySelector('[data-owner-action="identity"]');
 let result=context.settingsInlinePrompt({title:'Edit Pharmacy',label:'Pharmacy Name',value:'Original',anchor});
 let form=document.querySelector('.ownerInlineEdit form');form.querySelector('input').value='Exact New Name';form.dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(await result,'Exact New Name');assert.equal(document.querySelector('.ownerInlineEdit'),null);
 result=context.settingsInlinePrompt({title:'Edit Pharmacy',label:'Pharmacy Code',value:'001ABC',anchor});document.querySelector('.ownerInlineEdit .secondaryButton').click();assert.equal(await result,null);
 result=context.settingsInlinePrompt({title:'Edit Pharmacy',label:'Pharmacy Code',value:'001ABC',anchor});document.getElementById('ownerPharmacyList').innerHTML='';assert.equal(await result,null);
});
