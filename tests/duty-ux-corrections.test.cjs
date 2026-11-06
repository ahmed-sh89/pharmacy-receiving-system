const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const tick=()=>new Promise(setImmediate),read=path=>fs.readFileSync(path,'utf8');
function app(){
 const {document}=parseHTML('<html><body><section id="page-duty"></section></body></html>'),listeners={},events={},requests=[];
 const window={document,addEventListener:(n,f)=>listeners[n]=f,PharmFlowPermissions:{allowed:()=>true}};
 const c=vm.createContext({window,document,Intl,Date,FormData,structuredClone,crypto:require('node:crypto').webcrypto,CSS:{escape:x=>x},APP_CONFIG:{environment:'staging'},AuthState:{identityEpoch:1,session:{},user:{id:'user-a'},context:{pharmacy_id:'pharmacy-a',user_id:'user-a'}},AppRouter:{currentRoute:'duty'},AppEvents:{on:(n,f)=>events[n]=f},AUTH_STORAGE_KEY:'auth',setInterval:()=>{},authRpc:(name,args)=>new Promise((resolve,reject)=>requests.push({name,args,resolve,reject}))});
 vm.runInContext(read('js/duty-model.js'),c);c.DutyModel=window.DutyModel;
 vm.runInContext(read('js/duty-controls.js'),c);vm.runInContext(read('js/duty-schedule.js'),c);c.DutySchedule=window.DutySchedule;
 vm.runInContext(read('js/duty.js'),c);
 return {c,window,document,root:document.querySelector('#page-duty'),listeners,events,requests,M:c.DutyModel};
}
function monthData(M){return {pharmacy_id:'pharmacy-a',can_write:true,manual_hours:true,persistent_settings:true,holiday_first:true,positions:M.defaults,employees:[{code:'A',name:'Synthetic Alpha Official Name',position_key:'pharmacist',active:true,sort_order:2},{code:'B',name:'Synthetic Beta Official Name',position_key:'pharmacist',active:true,sort_order:1}],entries:[{code:'A',date:'2026-11-05',revision:1,payload:M.parse('7 PM–4 AM'),identity:{name:'Synthetic Alpha Official Name',position_key:'pharmacist'}}],holidays:[],hour_rules:[]};}
test('November → December → November retains authoritative directory/order, clears month cells and ignores late replies',async()=>{
 const f=app();f.events['route:changed']({routeName:'duty'});const nov=monthData(f.M);f.requests[0].resolve(nov);await tick();
 const names=()=>[...f.root.querySelectorAll('.duty-staff-title')].map(x=>x.title);
 const before=names();assert.match(before[0],/Beta/);
 f.root.querySelector('[data-duty-action="next"]').click();
 assert.equal(f.root.querySelector('#duty-month').value,'2026-12');assert.deepEqual(names(),before);
 assert(f.root.querySelector('[data-s-date="2026-12-31"]'));assert.equal(f.root.querySelectorAll('[data-s-time]').length,0);
 assert(!f.root.textContent.includes('No employees in this view'));assert(!f.root.textContent.includes('pending database approval'));
 const pendingCell=f.root.querySelector('[data-s-code="A"][data-s-date="2026-12-05"]');f.root.querySelector('#duty-schedule-body').ondblclick({target:pendingCell});assert.equal(f.root.querySelector('.duty-cell-editor'),null);
 f.root.querySelector('[data-duty-action="previous"]').click();assert.equal(f.root.querySelector('#duty-month').value,'2026-11');assert.deepEqual(names(),before);assert.equal(f.root.querySelectorAll('[data-s-time]').length,0);
 f.requests[2].resolve(structuredClone(nov));await tick();assert.match(f.root.querySelector('[data-s-code="A"][data-s-date="2026-11-05"]').textContent,/7:00 PM/);
 f.requests[1].resolve({...nov,entries:[]});await tick();assert.match(f.root.querySelector('[data-s-code="A"][data-s-date="2026-11-05"]').textContent,/4:00 AM/);
 assert.equal(nov.entries.length,1);assert.equal(f.requests.length,3);assert(f.requests.every(x=>x.name==='get_pharmflow_duty_schedule_v1'));
});
test('completed empty month shows correct calendar; genuine failure retains read-only roster and scope change clears it',async()=>{
 const f=app();f.events['route:changed']({routeName:'duty'});const nov=monthData(f.M);f.requests[0].resolve(nov);await tick();
 f.root.querySelector('[data-duty-action="next"]').click();f.requests[1].resolve({...nov,entries:[]});await tick();
 assert(f.root.querySelector('[data-s-date="2026-12-31"]'));assert.equal(f.root.querySelectorAll('[data-s-time]').length,0);assert(!f.root.textContent.includes('No employees in this view'));
 f.root.querySelector('[data-duty-action="previous"]').click();f.requests[2].reject(Error('Synthetic read unavailable'));await tick();
 assert.match(f.root.querySelector('[data-duty-sync]').textContent,/Synthetic read unavailable/);assert(!f.root.querySelector('.duty-footnote').textContent.includes('Loading'));
 f.c.AuthState.context={pharmacy_id:'pharmacy-b',user_id:'user-b'};f.c.AuthState.identityEpoch++;f.listeners['auth:context-ready']();
 assert(!f.root.textContent.includes('Synthetic Alpha'));assert(!f.root.querySelector('.duty-staff-title'));
});
function reports(){
 const {document}=parseHTML('<section id="reports"></section>'),writes=[],window={};
 const c=vm.createContext({window,document,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,navigator:{clipboard:{writeText:async text=>writes.push(text)}}});
 for(const path of ['js/vendor/sheetjs-0.20.3/xlsx.full.min.js','js/duty-model.js'])vm.runInContext(read(path),c);
 c.DutyModel=window.DutyModel;vm.runInContext(read('js/duty-controls.js'),c);vm.runInContext(read('js/duty-reports.js'),c);
 return {c,document,host:document.querySelector('#reports'),R:window.DutyReports,M:c.DutyModel,writes};
}
test('ordered Employee Filter selects once, auto-renders and Clear preserves period and saved data',async()=>{
 const f=reports(),d=monthData(f.M);d.employees[0].display_code='000123';f.R.mount(f.host,d,{month:'2026-11',demo:true,pharmacyCode:'SYNTH'});
 const original=JSON.stringify(d),select=f.host.querySelector('[data-report-employee]');assert.equal(select.tagName,'SELECT');assert.deepEqual([...select.querySelectorAll('option')].map(x=>x.value),['','B','A']);assert.match(select.textContent,/000123/);select.onchange({target:{value:'A'}});
 assert.match(f.host.querySelector('.duty-report-identity').textContent,/Synthetic Alpha Official Name/);assert(f.host.querySelector('table'));assert.equal(f.host.querySelector('[data-report-preview]'),null);
 assert.equal(f.host.querySelector('[data-report-status]').textContent,'');assert(f.host.querySelector('.duty-report-help [data-report-destination]'));
 f.host.querySelector('[data-report-period]').onchange({target:{value:'custom'}});
 f.host.querySelector('[data-report-from]').onchange({target:{value:'2026-11-05'}});f.host.querySelector('[data-report-to]').onchange({target:{value:'2026-11-07'}});
 await f.host.querySelector('[data-report-copy]').onclick();const lines=f.writes[0].split('\r\n').map(x=>x.split('\t'));assert.equal(lines.length,3);assert(lines.every(x=>x.length===8));assert.equal(lines[0][0],'7:00 PM');assert.equal(lines[0][1],'4:00 AM');
 assert.match(f.host.querySelector('[data-report-destination]').textContent,/row dated 2026-11-05/);
 f.host.querySelector('[data-report-clear]').onclick();assert.equal(f.host.querySelector('[data-report-from]').value,'2026-11-05');assert.equal(f.host.querySelector('[data-report-to]').value,'2026-11-07');assert.equal(JSON.stringify(d),original);assert(f.host.querySelector('[data-report-copy]').disabled);assert(!f.host.querySelector('[data-report-download]').disabled);
});
// DOM fixture supplies native successful-control semantics for the actual editor event handlers.
function editorFixture(){
 const {document,window}=parseHTML('<html><body><div id="grid"></div></body></html>');
 class Fields{constructor(form){this.values=new Map();for(const e of form.querySelectorAll('input,select,textarea')){if(!e.name||e.disabled||e.closest('fieldset[disabled]'))continue;if(['checkbox','radio'].includes(e.type)&&!e.hasAttribute('checked'))continue;this.values.set(e.name,e.value||'');}}has(k){return this.values.has(k);}get(k){return this.values.get(k)??null;}}
 Object.defineProperty(window.HTMLElement.prototype,'elements',{configurable:true,get(){const form=this;return new Proxy({}, {get:(_,key)=>{const nodes=[...form.querySelectorAll('[name]')].filter(x=>x.name===key);if(nodes.length>1)return {get value(){return nodes.find(x=>x.hasAttribute('checked'))?.value;}};return nodes[0];}});}});
 const c=vm.createContext({window,document,Intl,Date,FormData:Fields,CSS:{escape:x=>x},structuredClone});vm.runInContext(read('js/duty-model.js'),c);c.DutyModel=window.DutyModel;vm.runInContext(read('js/duty-controls.js'),c);vm.runInContext(read('js/duty-schedule.js'),c);
 const M=c.DutyModel,data=monthData(M),host=document.querySelector('#grid'),requests=[];
 window.DutySchedule.mount(host,data,{month:'2026-11',demo:false,save:(changes)=>new Promise((resolve,reject)=>requests.push({changes,resolve,reject})),confirm:async()=>true});
 return {window,document,host,data,requests,M};
}
test('operational modal sections retain AM/PM overnight values, serialize rapid Save and retain conflict draft',async()=>{
 const f=editorFixture(),cell=()=>f.host.querySelector('[data-s-code="A"][data-s-date="2026-11-05"]');
 f.host.ondblclick({target:cell()});let form=f.host.querySelector('form.duty-cell-editor');assert(form);
 assert.deepEqual([...form.querySelectorAll('legend')].map(x=>x.textContent),['Status','Shift Times','Hours Calculation','Manual allocation']);
 assert.equal(form.querySelector('[name="Shift-1-In-2"]').value,'PM');assert.equal(form.querySelector('[name="Shift-1-Out-2"]').value,'AM');assert(form.querySelector('.duty-category-total'));
 const first=form.onsubmit({preventDefault(){}});await form.onsubmit({preventDefault(){}});assert.equal(f.requests.length,1);assert(form.querySelector('[type=submit]').disabled);assert.match(form.querySelector('[role=alert]').textContent,/Saving/);
 const change=f.requests[0].changes[0];assert.equal(change.payload.periods[0].start,1140);assert.equal(change.payload.periods[0].end,1680);assert.equal(change.expected_revision,1);
 f.data.entries[0]={...f.data.entries[0],...change,revision:2};f.requests[0].resolve(f.data);await first;assert.equal(f.host.querySelector('.duty-cell-editor'),null);
 f.host.ondblclick({target:cell()});form=f.host.querySelector('.duty-cell-editor');form.querySelector('[name=note]').value='Retain my synthetic draft';const pending=form.onsubmit({preventDefault(){}});f.requests[1].reject(Error('DUTY_CONFLICT'));await pending;
 assert(form.isConnected);assert.equal(form.querySelector('[name=note]').value,'Retain my synthetic draft');assert.match(form.querySelector('[role=alert]').textContent,/Conflict/);assert(!form.querySelector('[type=submit]').disabled);
});
