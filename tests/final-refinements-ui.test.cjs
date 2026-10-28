const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),cp=require('child_process'),vm=require('vm'),{parseHTML}=require('linkedom');
const html=fs.readFileSync('index.html','utf8'),old=cp.execFileSync('git',['show','232f7fe:index.html'],{encoding:'utf8'}),document=parseHTML(html).document;
function fn(s,name){const at=s.indexOf('function '+name+'(');return s.slice(at,s.indexOf('\n}',at)+2);}
test('Export Data shares Create action row; dedicated row removed and KPI/table markup preserved',()=>{
 const button=document.getElementById('btnOwnerExportGlobalItems'),create=document.getElementById('btnOpenCreateAccount');assert.equal(button.textContent,'Export Data');assert.equal(button.parentElement,create.parentElement);assert.equal(button.closest('.ownerManagementToolbar').id,'');assert.equal(document.querySelector('.ownerExportToolbar'),null);
 const before=parseHTML(old).document;for(const selector of ['.ownerMetricGrid','#ownerPharmacyList','#ownerManagementSort','#ownerManagementSearchWrap'])assert.equal(document.querySelector(selector).outerHTML,before.querySelector(selector).outerHTML);
 const css=fs.readFileSync('css/settings-workspace.css','utf8');assert(!css.includes('ownerExportToolbar'));assert.match(css,/ownerManagementActions\{display:flex;align-items:center;gap:6px/);
});
test('Normal startup text is only Loading; capsule DOM and stylesheet are unchanged; security error remains visible',()=>{
 const current=document.querySelector('.pfBootCapsule'),prior=parseHTML(old).document.querySelector('.pfBootCapsule');assert.equal(current.outerHTML,prior.outerHTML);assert.equal(document.querySelector('.workspaceBootCard').textContent.trim(),'Loading...');assert.equal(document.getElementById('authBootPanel').textContent.trim(),'Loading...');assert.equal(document.querySelector('.workspaceBootCard small').hidden,true);
 const app=fs.readFileSync('js/app.js','utf8');assert(app.includes('detail.hidden=false;detail.textContent="PharmFlow could not confirm'));assert(app.includes('Receiving data is not ready'));
});
test('Administrator mapping is presentation only and both identity render owners use it',()=>{
 const auth=fs.readFileSync('js/auth.js','utf8'),app=fs.readFileSync('js/app.js','utf8'),c={};vm.createContext(c);vm.runInContext(fn(auth,'formatAuthRoleLabel'),c);
 for(const role of ['owner','system_owner','OWNER'])assert.equal(c.formatAuthRoleLabel(role),'Administrator');assert.equal(c.formatAuthRoleLabel('admin'),'ADMIN');assert.equal(c.formatAuthRoleLabel('staff'),'STAFF');
 assert(app.includes('const role=formatAuthRoleLabel(c.system_role || c.member_role || "user")'));assert(auth.includes('? formatAuthRoleLabel("owner")'));assert.equal(fn(auth,'isSystemOwner'),fn(cp.execFileSync('git',['show','232f7fe:js/auth.js'],{encoding:'utf8'}),'isSystemOwner'));
});
