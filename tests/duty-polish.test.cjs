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
 const M=c.DutyModel,data=monthData(M),host=document.querySelector('#grid'),requests=[],panels=[],holidayCalls=[],confirmation={allow:true,messages:[]};
 data.shift_presets=[{id:"split",name:"Split",periods:[{start:540,end:780},{start:1020,end:1320}]}];
 window.DutySchedule.mount(host,data,{month:'2026-11',demo:false,save:(changes)=>new Promise((resolve,reject)=>requests.push({changes,resolve,reject})),holiday:async(...args)=>{holidayCalls.push(args);return data;},panel:(title,body,submit)=>{const f=document.createElement("form");f.innerHTML=body;for(const select of f.querySelectorAll("select"))Object.defineProperty(select,"value",{configurable:true,get(){return [...this.querySelectorAll("option")].find(o=>o.hasAttribute("selected"))?.getAttribute("value")||this.querySelector("option")?.getAttribute("value");},set(v){for(const o of this.querySelectorAll("option"))o.toggleAttribute("selected",o.getAttribute("value")===v);}});panels.push({title,submit,form:f});host.append(f);return f;},confirm:async message=>{confirmation.messages.push(message);return confirmation.allow;}});
 return {window,document,host,data,requests,M,panels,confirmation,holidayCalls};
}


for(const label of ['direct navigation','fresh document / hard-refresh initialization'])test(label+' updates shell write controls only after authoritative readiness',async()=>{
 const f=app();f.events['route:changed']({routeName:'duty'});const calendar=()=>f.root.querySelector('[data-duty-action="calendar"]'),employee=()=>f.root.querySelector('[data-duty-action="add-employee"]');assert(calendar().disabled);assert(employee().disabled);
 f.requests[0].resolve(monthData(f.M));await tick();assert(!calendar().disabled);assert(!employee().disabled);
 f.root.querySelector('[data-duty-tab="employees"]').click();f.root.querySelector('[data-duty-tab="schedule"]').click();assert(!calendar().disabled);
});
test('read-only and initialization errors never enable writes',async()=>{
 const f=app();f.events['route:changed']({routeName:'duty'});f.requests[0].resolve({...monthData(f.M),can_write:false});await tick();assert(f.root.querySelector('[data-duty-action="calendar"]').disabled);assert(f.root.querySelector('[data-duty-action="add-employee"]').disabled);
 const g=app();g.events['route:changed']({routeName:'duty'});g.requests[0].reject(Error('Synthetic load failure'));await tick();assert(g.root.querySelector('[data-duty-action="calendar"]').disabled);assert.match(g.root.textContent,/Synthetic load failure/);
});
test('Calendar independent of selection: inactive names cleared, saved Holiday restored, normal submission strips unrelated values',async()=>{
 const f=editorFixture();f.data.holidays.push({date:'2026-11-01',active:false,name:'afternoon',note:'old preset-like text'},{date:'2026-11-02',active:true,name:'Saved Holiday',note:'Saved note'});
 f.window.DutySchedule.calendar();let panel=f.panels.at(-1),form=panel.form;assert.equal(form.elements.holiday_name.value,'');assert(form.elements.holiday_name.disabled);assert(form.querySelector('.duty-settings-action [data-manage-presets]'));
 form.elements.from.value='2026-11-02';form.elements.from.onchange();assert.equal(form.elements.holiday_name.value,'Saved Holiday');assert(!form.elements.holiday_name.disabled);
 Object.defineProperty(form.elements.type,'value',{value:'normal',writable:true});form.elements.type.onchange();assert.equal(form.elements.holiday_name.value,'');
 await panel.submit(new Map([['from','2026-11-02'],['to','2026-11-02'],['type','normal'],['holiday_name','unrelated'],['holiday_note','unrelated']]));assert.equal(f.holidayCalls[0][2],'');assert.equal(f.holidayCalls[0][3],'');
 f.window.DutySchedule.calendar();form=f.panels.at(-1).form;form.elements.holiday_name.value='unsaved';f.window.DutySchedule.calendar();assert.equal(f.panels.at(-1).form.elements.holiday_name.value,'');
});
test('date-range drafts do not apply until confirmation; invalid input preserves view; reopening restores applied range',()=>{
 const f=editorFixture();f.window.DutyControls.openPopover=()=>{};
 const range=()=>f.host.querySelector('[data-date-range]'),trigger=()=>f.host.querySelector('[data-range-trigger]'),count=()=>f.host.querySelectorAll('tbody tr').length;
 const full=count();trigger().onclick();range().querySelector('[name=from]').value='2026-11-05';range().querySelector('[name=to]').value='2026-11-07';assert.equal(count(),full);
 range().querySelector('[data-range-cancel]').onclick();trigger().onclick();assert.equal(range().querySelector('[name=from]').value,'2026-11-01');
 range().querySelector('[name=from]').value='2026-11-07';range().querySelector('[name=to]').value='2026-11-05';f.host.onsubmit({target:range(),preventDefault(){}});assert.equal(count(),full);assert.match(range().textContent,/Choose valid dates/);
 range().querySelector('[name=from]').value='2026-11-05';range().querySelector('[name=to]').value='2026-11-07';f.host.onsubmit({target:range(),preventDefault(){}});assert.equal(count(),3);trigger().onclick();assert.equal(range().querySelector('[name=from]').value,'2026-11-05');assert.equal(range().querySelector('[name=to]').value,'2026-11-07');
});

test('Apply Shift dropdown writes the real successful form control and updates selected label',async()=>{
 const f=editorFixture();f.host.onclick({target:f.host.querySelector('[data-s-code="A"][data-s-date="2026-11-05"]')});await f.host.onclick({target:f.host.querySelector('[data-s-action="apply-shift"]')});
 const form=f.panels.at(-1).form,popup=form.querySelector('.duty-dropdown-popup');popup.hidePopover=()=>{};
 await popup.onclick({target:popup.querySelector('[data-dropdown-value="split"]')});
 assert.equal(form.elements.preset.value,'split');assert.equal(form.querySelector('[data-dropdown-trigger=preset]').textContent,'Split');assert.equal(popup.querySelectorAll('[data-dropdown-value=split] small').length,2);
});
