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
function editorFixture(){
 const {document,window}=parseHTML('<html><body><div id="grid"></div></body></html>');
 class Fields{constructor(form){this.values=new Map();for(const e of form.querySelectorAll('input,select,textarea')){if(!e.name||e.disabled||e.closest('fieldset[disabled]'))continue;if(['checkbox','radio'].includes(e.type)&&!e.hasAttribute('checked'))continue;this.values.set(e.name,e.value||'');}}has(k){return this.values.has(k);}get(k){return this.values.get(k)??null;}}
 Object.defineProperty(window.HTMLElement.prototype,'elements',{configurable:true,get(){const form=this;return new Proxy({}, {get:(_,key)=>{const nodes=[...form.querySelectorAll('[name]')].filter(x=>x.name===key);if(nodes.length>1)return {get value(){return nodes.find(x=>x.hasAttribute('checked'))?.value;}};return nodes[0];}});}});
 const c=vm.createContext({window,document,Intl,Date,FormData:Fields,CSS:{escape:x=>x},structuredClone});vm.runInContext(read('js/duty-model.js'),c);c.DutyModel=window.DutyModel;vm.runInContext(read('js/duty-controls.js'),c);vm.runInContext(read('js/duty-schedule.js'),c);
 const M=c.DutyModel,data=monthData(M),host=document.querySelector('#grid'),requests=[],panels=[],confirmation={allow:true,messages:[]};
 data.shift_presets=[{id:"split",name:"Split",periods:[{start:540,end:780},{start:1020,end:1320}]}];
 window.DutySchedule.mount(host,data,{month:'2026-11',demo:false,save:(changes)=>new Promise((resolve,reject)=>requests.push({changes,resolve,reject})),panel:(title,body,submit)=>{const f=document.createElement("form");f.innerHTML=body;panels.push({title,submit,form:f});host.append(f);return f;},confirm:async message=>{confirmation.messages.push(message);return confirmation.allow;}});
 return {window,document,host,data,requests,M,panels,confirmation};
}

test('Quick Shift fills split fields without saving; manual adjustment and single Save reuse revision-safe path',async()=>{
 const f=editorFixture();f.host.ondblclick({target:f.host.querySelector('[data-s-code="A"][data-s-date="2026-11-05"]')});
 const form=f.host.querySelector('.duty-cell-editor'),select=form.querySelector('[data-preset-select]');Object.defineProperty(select,'value',{value:'split',writable:true});select.onchange();
 assert.equal(f.requests.length,0);assert.equal(form.querySelector('[name="Shift-1-In-0"]').value,'9');assert.equal(form.querySelector('[name="Shift-2-Out-0"]').value,'10');
 form.querySelector('[name="Shift-2-Out-1"]').value='30';
 const pending=form.onsubmit({preventDefault(){}});assert.equal(f.requests.length,1);const c=f.requests[0].changes[0];assert.equal(c.expected_revision,1);assert.equal(c.payload.periods.length,2);assert.equal(c.payload.periods[1].end,1350);
 f.requests[0].reject(Error('DUTY_CONFLICT'));await pending;assert(form.isConnected);assert.match(form.textContent,/Conflict/);
});

test('Apply Shift preview, overwrite cancellation, revision-safe batch, conflict and Undo reuse existing service',async()=>{
 const f=editorFixture(),cell=f.host.querySelector('[data-s-code="A"][data-s-date="2026-11-05"]');
 f.host.onclick({target:cell,shiftKey:false});
 f.host.onclick({target:f.host.querySelector('[data-s-code="A"][data-s-date="2026-11-06"]'),shiftKey:true});
 await f.host.onclick({target:f.host.querySelector('[data-s-action="apply-shift"]')});
 assert.match(f.panels[0].form.textContent,/2 cells.*1 existing entries/);
 f.confirmation.allow=false;await assert.rejects(f.panels[0].submit(new Map([['preset','split']])));assert.equal(f.requests.length,0);assert.equal(f.confirmation.messages.length,1);
 f.confirmation.allow=true;const pending=f.panels[0].submit(new Map([['preset','split']]));await tick();assert.equal(f.requests.length,1);
 assert.equal(f.requests[0].changes.length,2);const c=f.requests[0].changes[0];assert.equal(c.expected_revision,1);assert.equal(c.payload.periods.length,2);assert.equal(c.payload.manual_minutes,undefined);assert.equal(f.M.effectiveHours('2026-11-06',c.payload,false,f.data.employees[0],[],true).friday_ot,540);
 f.data.entries[0]={...f.data.entries[0],...c,revision:2};f.requests[0].resolve(f.data);await pending;
 const undo=f.host.onclick({target:f.host.querySelector('[data-s-action="undo"]')});await tick();assert.equal(f.requests.length,2);assert.equal(f.requests[1].changes[0].expected_revision,2);assert.equal(f.requests[1].changes[0].payload.periods[0].start,1140);
 f.requests[1].reject(Error('DUTY_CONFLICT'));await undo;assert.match(f.host.textContent,/Conflict/);
});
