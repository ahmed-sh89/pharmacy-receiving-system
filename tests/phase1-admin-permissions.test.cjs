const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
function fixture(){
 const {document,window:domWindow}=parseHTML('<html><body class="authLocked"><main class="mainContent"></main><button data-page="receiving"></button><button data-page="expiry"></button><input id="barcodeInput"><button id="btnSaveExpiryCapture"></button><button data-quick-receive></button><button data-link-receive></button><button id="btnResolveExpiryNow"></button><button id="btnZebraReceivingMode"></button><button id="btnZebraExpiryMode"></button></body></html>');
 const window={addEventListener(){}};
 const state={context:{pharmacy_id:'pharmacy-a',member_role:'admin',system_role:''},mustChangePassword:false};
 let row={pharmacy_id:'pharmacy-a',receiving:'FULL',expiry:'FULL',data_access:'PHARMACY_ONLY',system_administrator:false};
 const ctx={window,document,AuthState:state,queueMicrotask,MutationObserver:domWindow.MutationObserver,authRpc:async()=>({...row})};
 document.readyState='loading';vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/permissions.js','utf8'),ctx);
 return {document,state,ctx,p:window.PharmFlowPermissions,set:changes=>{row={...row,...changes};}};
}
test('independent module levels and mixed data permission are fail closed before load',async()=>{
 const f=fixture();assert(!f.p.allowed('RECEIVING'));await f.p.load();assert(f.p.allowed('RECEIVING',true));
 f.set({receiving:'READ_ONLY',expiry:'DISABLED',data_access:'READ_ONLY'});await f.p.load();
 assert(f.p.allowed('RECEIVING'));assert(!f.p.allowed('RECEIVING',true));assert(!f.p.allowed('EXPIRY'));assert(f.p.allowed('DATA'));assert(!f.p.allowed('DATA',true));
 assert(f.document.getElementById('barcodeInput').disabled);assert(f.document.getElementById('btnSaveExpiryCapture').disabled);
 assert(f.document.querySelector('[data-page="expiry"]').classList.contains('permissionHidden'));
 assert.throws(()=>f.p.checkRpc('register_pharmflow_order_upload',{}),/not permitted/);
 assert.doesNotThrow(()=>f.p.checkRpc('list_pharmflow_orders',{}));assert.throws(()=>f.p.checkRpc('list_pharmacy_expiry_current_state_v1',{}),/not permitted/);
 f.set({receiving:'FULL',expiry:'FULL'});await f.p.load();assert(f.document.querySelector('[data-quick-receive]').disabled);assert(f.document.querySelector('[data-link-receive]').disabled);
 f.set({receiving:'DISABLED',expiry:'FULL'});await f.p.load();assert(!f.p.allowed('RECEIVING'));assert(f.p.allowed('EXPIRY',true));assert(!f.p.allowed('DATA',true));
 assert(f.document.getElementById('btnResolveExpiryNow').disabled);assert(!f.document.getElementById('btnSaveExpiryCapture').disabled);
});
test('UUID policy controls Global rights; role, code, tenant and password flag cannot manufacture them',async()=>{
 const f=fixture();f.state.context.pharmacy_code='HHP084';await f.p.load();assert(!f.p.allowed('GLOBAL',true));
 f.set({data_access:'PHARMACY_GLOBAL'});await f.p.load();assert(f.p.allowed('GLOBAL',true));
 f.state.context.member_role='staff';assert(!f.p.allowed('GLOBAL',true));f.state.context.member_role='admin';
 f.state.context.pharmacy_id='pharmacy-b';assert(!f.p.allowed('GLOBAL',true));f.state.context.pharmacy_id='pharmacy-a';
 f.state.mustChangePassword=true;assert(!f.p.allowed('GLOBAL',true));assert(!f.p.allowed('EXPIRY'));assert.throws(()=>f.p.checkRpc('list_pharmflow_orders'),/not permitted/);
});
test('temporary permission fetch failures clear the effective projection',async()=>{
 const f=fixture();await f.p.load();f.ctx.authRpc=async()=>{throw Error('offline');};await assert.rejects(f.p.load(),/offline/);assert(!f.p.allowed('RECEIVING'));assert(f.document.getElementById('barcodeInput').disabled);
});
test('Receiving scan and local mutation entry points reject before changing state',()=>{
 const src=fs.readFileSync('js/receiving.js','utf8');const name='addItemReceivedQuantity',start=src.indexOf('function '+name+'('),end=src.indexOf('\n}',start);
 const ctx={window:{PharmFlowPermissions:{require(){throw Error('denied');}}}};vm.createContext(ctx);vm.runInContext(src.slice(start,end+2),ctx);assert.throws(()=>ctx[name]({},1),/denied/);
});

test('focused permission editor reads saved values, persists revision and keeps errors visible',async()=>{
 const {document,window:dom}=parseHTML('<html><body><article class="ownerPharmacyRow"><button data-pharmacy-id="a"></button><div class="ownerPharmacyEditor"></div></article></body></html>');
 // linkedom does not implement the browser select.value setter.
 Object.defineProperty(dom.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.firstElementChild?.value||'';},set(value){for(const option of this.children)option.toggleAttribute('selected',option.value===value);}});
 const window={settingsConfirm:async()=>true};const calls=[];let busy=false,fail=false;
 const state={context:{pharmacy_id:'different'},get busy(){return busy;}};
 const ctx={document,window,AuthState:state,isSystemOwner:()=>true,setAuthBusy:v=>{busy=v;},setOwnerManagementMessage:()=>{},authRpc:async(name,args)=>{calls.push([name,args]);if(fail)throw Error('Permission policy changed; reload');return {pharmacy_id:'a',receiving:'READ_ONLY',expiry:'DISABLED',data_access:'PHARMACY_ONLY',revision:7};}};
 vm.createContext(ctx);require('./helpers/settings-modal-dom.cjs').installModalDOM(document,dom);require('./helpers/settings-modal-dom.cjs').loadModalRuntime(ctx);const src=fs.readFileSync('js/settings-workspace.js','utf8'),start=src.indexOf('window.editPharmacyPermissions=async'),end=src.indexOf('\n(function bindDirectAccountCreation',start);vm.runInContext(src.slice(start,end),ctx);
 dom.HTMLElement.prototype.focus=function(){};
 const done=window.editPharmacyPermissions(document.querySelector('button'));await new Promise(setImmediate);
 const form=document.querySelector('form');assert.equal(form.querySelector('[name="receiving"]').value,'READ_ONLY');assert.equal(form.querySelector('[name="expiry"]').value,'DISABLED');
 form.querySelector('[name="expiry"]').value='FULL';form.dataset.dirty='true';await form.onsubmit({preventDefault(){}});
 assert.equal(calls[1][0],'owner_set_pharmflow_permissions_v1');assert.equal(calls[1][1].p_expected_revision,7);assert.equal(calls[1][1].p_expiry,'FULL');assert.equal(form.dataset.dirty,'false');assert.match(form.textContent,/Permissions saved/);
 fail=true;form.dataset.dirty='true';await form.onsubmit({preventDefault(){}});assert.equal(form.dataset.dirty,'true');assert.match(form.textContent,/changed; reload/);
 window.editPharmacyPermissions.cancel();await done;assert.equal(document.querySelector('form'),null);
});

test('all nine independent module combinations project Desktop and Handheld controls',async()=>{
 const f=fixture();
 for(const receiving of ['DISABLED','READ_ONLY','FULL'])for(const expiry of ['DISABLED','READ_ONLY','FULL']){
  f.set({receiving,expiry});await f.p.load();
  assert.equal(f.p.allowed('RECEIVING'),receiving!=='DISABLED');assert.equal(f.p.allowed('EXPIRY'),expiry!=='DISABLED');
  assert.equal(!!f.document.getElementById('barcodeInput').disabled,receiving!=='FULL');assert.equal(!!f.document.getElementById('btnSaveExpiryCapture').disabled,expiry!=='FULL');
  assert.equal(f.document.getElementById('btnZebraReceivingMode').classList.contains('permissionHidden'),receiving==='DISABLED');
  assert.equal(f.document.getElementById('btnZebraExpiryMode').classList.contains('permissionHidden'),expiry==='DISABLED');
 }
});
