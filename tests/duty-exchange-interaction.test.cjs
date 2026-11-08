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
 const c=vm.createContext({window,document,Intl,Date,FormData:Fields,CSS:{escape:x=>x},structuredClone,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});vm.runInContext(read('js/duty-model.js'),c);c.DutyModel=window.DutyModel;vm.runInContext(read('js/duty-controls.js'),c);vm.runInContext(read('js/duty-schedule.js'),c);
 const M=c.DutyModel,data=monthData(M),host=document.querySelector('#grid'),requests=[],panels=[],confirmation={allow:true,messages:[]};
 data.shift_presets=[{id:"split",name:"Split",periods:[{start:540,end:780},{start:1020,end:1320}]}];
 window.DutySchedule.mount(host,data,{month:'2026-11',demo:false,save:(changes)=>new Promise((resolve,reject)=>requests.push({changes,resolve,reject})),panel:(title,body,submit)=>{const f=document.createElement("form");f.innerHTML=body;panels.push({title,submit,form:f});host.append(f);return f;},confirm:async message=>{confirmation.messages.push(message);return confirmation.allow;}});
 return {window,document,host,data,requests,M,panels,confirmation};
}

test('route reset followed by identical server data reactivates visible schedule',async()=>{
 editorFixture();const f=app(),d=monthData(f.M);f.events['route:changed']({routeName:'duty'});f.requests[0].resolve(d);await tick();
 f.c.AppRouter.currentRoute='receiving';f.events['route:changed']({routeName:'receiving'});
 f.c.AppRouter.currentRoute='duty';f.events['route:changed']({routeName:'duty'});f.requests[1].resolve(structuredClone(d));await tick();
 const host=f.root.querySelector('#duty-schedule-body');
 host.onclick({target:host.querySelector('[data-s-code="A"][data-s-date="2026-11-05"]')});
 assert.equal(host.querySelectorAll('[aria-selected=true]').length,1);
 host.ondblclick({target:host.querySelector('[data-s-code="A"][data-s-date="2026-11-05"]')});
 assert(host.querySelector('.duty-cell-editor'),'ready schedule must reopen editor without tab switching');
});
const at=(f,code,date)=>f.host.querySelector(`[data-s-code="${code}"][data-s-date="2026-11-${String(date).padStart(2,'0')}"]`);
const click=(f,code,date,extra={})=>f.host.onclick({target:at(f,code,date),...extra});
const action=(f,id)=>f.host.onclick({target:f.host.querySelector(`[data-s-action="${id}"]`)});
function commit(f,index=0){const req=f.requests[index];for(const c of req.changes){const old=f.data.entries.find(e=>e.code===c.code&&e.date===c.date);if(old)Object.assign(old,c,{revision:old.revision+1});else f.data.entries.push({...c,revision:1});}req.resolve(structuredClone(f.data));}
function pointerRange(f,code,from,to,add=false){
 const a=at(f,code,from),b=at(f,code,to),ev={pointerId:1,pointerType:'mouse',button:0,buttons:1,clientX:100,clientY:100,ctrlKey:add,preventDefault(){}};
 f.host.setPointerCapture=()=>{};f.document.elementFromPoint=()=>b;
 f.host.onpointerdown({...ev,target:a});f.host.onpointermove({...ev,target:b});f.host.onpointerup(ev);
}
test('Ctrl + Drag adds a second rectangle, survives release and exchanges ten cells in one batch; duplicate submissions blocked; Undo/Redo atomic',async()=>{
 const f=editorFixture();pointerRange(f,'A',1,5);pointerRange(f,'B',10,14,true);
 assert.equal(f.host.querySelectorAll('[aria-selected=true]').length,10);assert.equal(f.host.querySelectorAll('.duty-range-b').length,5);
 assert.equal(f.host.querySelector('[data-s-action=exchange]').disabled,false);
 const pending=action(f,'exchange');await action(f,'exchange');assert.equal(f.requests.length,1);assert.equal(f.requests[0].changes.length,10);
 assert.equal(f.requests[0].changes.find(c=>c.code==='B'&&c.date.endsWith('-14')).payload.periods[0].start,1140);
 commit(f);await pending;const undo=action(f,'undo');assert.equal(f.requests.length,2);assert.equal(f.requests[1].changes.length,10);assert(f.requests[1].changes.every(c=>c.expected_revision>=1));commit(f,1);await undo;
 const redo=action(f,'redo');assert.equal(f.requests.length,3);assert.equal(f.requests[2].changes.length,10);commit(f,2);await redo;
 assert.equal(f.data.entries.find(e=>e.code==='B'&&e.date.endsWith('-14')).payload.periods[0].start,1140);
});
test('ordinary drag replaces both ranges; third range remains visible and disables Exchange',async()=>{
 const f=editorFixture();pointerRange(f,'A',1,5);pointerRange(f,'B',10,14,true);pointerRange(f,'A',20,24,true);
 assert.equal(f.host.querySelectorAll('[aria-selected=true]').length,15);assert(f.host.querySelector('[data-s-action=exchange]').disabled);
 assert.match(f.host.textContent,/Select two equal ranges to exchange shifts/);await action(f,'exchange');assert.equal(f.requests.length,0);
 pointerRange(f,'B',2,4);assert.equal(f.host.querySelectorAll('[aria-selected=true]').length,3);assert.equal(f.host.querySelectorAll('.duty-range-b').length,0);
});
test('equal cell counts with incompatible rectangle shapes, mismatched sizes and overlaps never write',async()=>{
 for(const kind of ['shape','size','overlap']){
  const f=editorFixture();pointerRange(f,'A',1,4);
  if(kind==='size')pointerRange(f,'B',10,14,true);
  if(kind==='overlap')pointerRange(f,'A',3,6,true);
  if(kind==='shape'){
   const a=at(f,'A',10),b=at(f,'B',11),ev={pointerId:1,pointerType:'mouse',button:0,buttons:1,ctrlKey:true,preventDefault(){}};f.document.elementFromPoint=()=>b;f.host.setPointerCapture=()=>{};
   f.host.onpointerdown({...ev,target:a});f.host.onpointermove({...ev,target:b});f.host.onpointerup(ev);
  }
  assert(f.host.querySelector('[data-s-action=exchange]').disabled,kind);await action(f,'exchange');assert.equal(f.requests.length,0,kind);
 }
});
test('one-cell exchange moves all payload fields, recalculates Auto at destination and preserves Manual using existing allocation rules',async()=>{
 for(const source of [f=>f.M.parse('9 AM–1 PM / 5 PM–10 PM',{note:'User note',highlight:'mint'}),f=>f.M.parse('7 PM–4 AM'),f=>f.M.normalize({status:'OFF',note:'Off note'}),f=>f.M.normalize({status:'ANNUAL_LEAVE',note:'Leave note'}),f=>f.M.parse('1 PM–10 PM',{manual_minutes:{basic:480}}),f=>f.M.normalize({status:'WORK',manual_minutes:{basic:360,normal_ot:60}})]){
  const f=editorFixture(),p=source(f);f.data.entries=[{code:'A',date:'2026-11-05',revision:7,payload:p}];f.window.DutySchedule.mount(f.host,f.data,{month:'2026-11',demo:false,save:changes=>new Promise((resolve,reject)=>f.requests.push({changes,resolve,reject}))});
  click(f,'A',5);click(f,'B',6,{ctrlKey:true});const pending=action(f,'exchange');const changes=f.requests[0].changes,a=changes.find(c=>c.code==='A'),b=changes.find(c=>c.code==='B');
  assert.equal(a.expected_revision,7);assert.equal(a.payload.status,'EMPTY');assert.equal(b.expected_revision,0);assert.equal(b.payload.note,p.note);assert.equal(b.payload.status,p.status);assert.equal(b.payload.highlight,p.highlight);assert.deepEqual(structuredClone(b.payload.periods),structuredClone(p.periods));
  const n=f.M.effectiveHours(b.date,b.payload,false,f.data.employees[1],[],true);
  if(p.manual_minutes){assert.equal(n.basic,p.manual_minutes.basic);assert.equal(n.friday_ot,0);}else if(p.status==='WORK'){assert.equal(n.basic,0);assert.equal(n.friday_ot,540);assert.equal(f.M.effectiveHours(b.date,b.payload,true,f.data.employees[1],[],true).holiday_ot,540);}
  commit(f);await pending;
 }
});
test('server conflict/failure retains both original cells and does not create Undo history; no stale Undo overwrites newer remote revisions',async()=>{
 const f=editorFixture();click(f,'A',5);click(f,'B',5,{ctrlKey:true});const original=JSON.stringify(f.data.entries);let pending=action(f,'exchange');f.requests[0].reject(Error('DUTY_CONFLICT'));await pending;
 assert.equal(JSON.stringify(f.data.entries),original);assert.match(f.host.textContent,/Conflict/);await action(f,'undo');assert.equal(f.requests.length,1);
 pending=action(f,'exchange');commit(f,1);await pending;
 f.data.entries.find(e=>e.code==='B').revision++;const snapshot=JSON.stringify(f.data.entries);pending=action(f,'undo');assert.equal(f.requests[2].changes.find(c=>c.code==='B').expected_revision,1);f.requests[2].reject(Error('DUTY_CONFLICT'));await pending;assert.equal(JSON.stringify(f.data.entries),snapshot);
});
test('loading, completed month and revoked permission prevent Exchange and editor writes',async()=>{
 for(const config of [{loading:true},{authorized:()=>false},{completed:true}]){
  const f=editorFixture();if(config.completed)f.data.month={status:'Completed'};
  f.window.DutySchedule.mount(f.host,f.data,{month:'2026-11',demo:false,...config,save:()=>{throw Error('must not write');}});
  click(f,'A',5);click(f,'B',5,{ctrlKey:true});assert(f.host.querySelector('[data-s-action=exchange]').disabled);await action(f,'exchange');f.host.ondblclick({target:at(f,'A',5)});assert(!f.host.querySelector('.duty-cell-editor'));
 }
});
test('repeated ready refreshes, Positions/Reports return, module navigation and cold startup retain one working interaction path',async()=>{
 editorFixture();const f=app(),d=monthData(f.M);f.events['route:changed']({routeName:'duty'});f.requests[0].resolve(d);await tick();
 for(let i=0;i<3;i++){
  for(const tab of ['positions','reports']){if(tab==='reports')f.window.DutyReports={mount(){}};f.root.querySelector(`[data-duty-tab="${tab}"]`).click();f.root.querySelector('[data-duty-tab=schedule]').click();}
  f.root.querySelector('[data-duty-action=retry]').click();f.requests.at(-1).resolve(structuredClone(d));await tick();
  const host=f.root.querySelector('#duty-schedule-body');host.ondblclick({target:host.querySelector('[data-s-code=A][data-s-date="2026-11-05"]')});assert(host.querySelector('.duty-cell-editor'));host.querySelector('[data-cancel]').click();
 }
});
test('controller sends one pharmacy-scoped revision-safe exchange RPC and refuses stale identity even before reset event',async()=>{
 editorFixture();const f=app(),d=monthData(f.M);f.events['route:changed']({routeName:'duty'});f.requests[0].resolve(d);await tick();
 const host=f.root.querySelector('#duty-schedule-body'),cell=code=>host.querySelector(`[data-s-code=${code}][data-s-date="2026-11-05"]`);
 host.onclick({target:cell('A')});host.onclick({target:cell('B'),ctrlKey:true});const pending=host.onclick({target:host.querySelector('[data-s-action=exchange]')});
 assert.equal(f.requests.length,2);assert.equal(f.requests[1].name,'save_pharmflow_duty_schedule_v2');assert.equal(f.requests[1].args.p_pharmacy_id,'pharmacy-a');assert.equal(f.requests[1].args.p_changes.length,2);assert.equal(f.requests[1].args.p_reason,'Exchange Duty shifts');
 f.requests[1].resolve(d);await pending;f.c.AuthState.context={pharmacy_id:'pharmacy-b',user_id:'user-a'};f.c.AuthState.identityEpoch++;
 host.ondblclick({target:cell('A')});assert(!host.querySelector('.duty-cell-editor'));await host.onclick({target:host.querySelector('[data-s-action=exchange]')});assert.equal(f.requests.length,2);
});
test('2 by 2 rectangles exchange by date then displayed employee order and preserve the full roster',async()=>{
 const f=editorFixture(),ev={pointerId:1,pointerType:'mouse',button:0,buttons:1,preventDefault(){}};
 const range=(from,to,add)=>{f.document.elementFromPoint=()=>at(f,'B',to);f.host.setPointerCapture=()=>{};f.host.onpointerdown({...ev,target:at(f,'A',from),ctrlKey:add});f.host.onpointermove(ev);f.host.onpointerup(ev);};
 const roster=JSON.stringify(f.data.employees);range(4,5,false);range(10,11,true);assert(!f.host.querySelector('[data-s-action=exchange]').disabled);
 const pending=action(f,'exchange');assert.equal(f.requests[0].changes.length,8);assert.equal(f.requests[0].changes.find(c=>c.code==='A'&&c.date.endsWith('-11')).payload.periods[0].start,1140);commit(f);await pending;assert.equal(JSON.stringify(f.data.employees),roster);
});
