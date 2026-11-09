const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
function fixture(at='2026-11-08T20:59:59.000Z',month='2026-11'){
 let clock=Date.parse(at),timerId=0;const timers=new Map(),listeners={};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const {document}=parseHTML('<html><body><section id="page-duty"><div id="grid"></div></section></body></html>');
 const window={document,addEventListener:(type,fn)=>listeners[type]=fn,setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id)};
 const c=vm.createContext({window,document,Date:Clock,Intl,CSS:{escape:v=>v},structuredClone});
 for(const p of ['duty-model','duty-controls','duty-schedule','duty-reports']){vm.runInContext(fs.readFileSync('js/'+p+'.js','utf8'),c);if(p==='duty-model')c.DutyModel=window.DutyModel;}
 const data=window.DutyModel.demoMonth(month),host=document.querySelector('#grid'),before=JSON.stringify(data);data.pharmacy_id='synthetic-ui';
 const config={month,demo:true,pharmacyCode:'SYNTHETIC',save:()=>{throw Error('Unexpected UI write');}};
 window.DutySchedule.mount(host,data,config);
 return {window,document,host,data,config,listeners,timers,setClock:at=>clock=Date.parse(at),before};
}
test('Saudi date rolls at midnight with one display-only timer; focus recovery preserves live cell selection and records',()=>{
 const f=fixture(),name=f.data.employees[0].code,cell=()=>f.host.querySelector(`[data-s-code="${name}"][data-s-date="2026-11-09"]`),before=JSON.stringify(f.data);
 assert.equal(f.host.querySelector('[aria-current=date]').dataset.sColumn,'2026-11-08');assert.match(f.host.querySelector('[data-duty-today]').textContent,/^Today · 8 Nov$/);
 f.host.onclick({target:cell()});const td=cell();assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].delay,1000);
 f.setClock('2026-11-08T21:00:00.000Z');[...f.timers.values()][0].fn();assert.equal(f.host.querySelector('[aria-current=date]').dataset.sColumn,'2026-11-09');assert.equal(cell(),td);assert.equal(td.getAttribute('aria-selected'),'true');assert.equal(JSON.stringify(f.data),before);assert.equal(f.timers.size,1);
 f.setClock('2026-11-09T21:01:00Z');f.listeners.focus();assert.equal(f.host.querySelector('[aria-current=date]').dataset.sColumn,'2026-11-10');f.window.DutySchedule.clear();assert.equal(f.timers.size,0);
});
test('today is absent outside month/range and coexists with Friday and Holiday markers',()=>{
 const f=fixture('2026-11-12T22:00:00Z');f.data.holidays=[{date:'2026-11-13',active:true,name:'Public Holiday'}];f.window.DutySchedule.mount(f.host,f.data,f.config);
 const current=f.host.querySelector('[aria-current=date]');assert.equal(current.dataset.sColumn,'2026-11-13');assert(current.closest('tr').classList.contains('duty-holiday-row'));assert.match(current.textContent,/Friday.*Public Holiday/);assert(current.closest('th').classList.contains('duty-today'));
 f.window.DutySchedule.mount(f.host,f.data,{...f.config,month:'2026-12'});assert.equal(f.host.querySelector('[aria-current=date]'),null);assert.equal(f.host.querySelector('[data-duty-today] time').dateTime,'2026-11-13');
});
test('adjacent single-cell ranges keep their own touching edges without changing selection or data',()=>{
 const f=fixture(),[a,b]=f.data.employees.filter(e=>e.position_key==='pharmacist'),date='2026-11-09',get=code=>f.host.querySelector(`[data-s-code="${code}"][data-s-date="${date}"]`),before=JSON.stringify(f.data);
 f.host.onclick({target:get(a.code)});f.host.onclick({target:get(b.code),ctrlKey:true});assert.equal(f.host.querySelectorAll('.duty-selected').length,2);assert(get(a.code).classList.contains('duty-edge-right'));assert(get(b.code).classList.contains('duty-edge-left'));assert(get(b.code).classList.contains('duty-range-b'));assert.equal(JSON.stringify(f.data),before);
});
test('styled Reports options retain saved order, badges, native change adapter, All/Clear and scoped data',()=>{
 const f=fixture(),before=JSON.stringify(f.data);f.window.DutyReports.mount(f.host,f.data,f.config);
 const native=f.host.querySelector('[data-report-employee]'),trigger=f.host.querySelector('[data-report-employee-trigger]'),list=f.host.querySelector('[role=listbox]');assert(native.hidden);assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(list.getAttribute('popover'),'auto');
 const codes=[...list.querySelectorAll('[data-employee-option]')].map(e=>e.dataset.employeeOption);assert.deepEqual(codes,['',...f.window.DutyModel.ordered(f.data.employees).map(e=>e.code)]);assert.equal(list.querySelectorAll('.duty-employee-code').length,f.data.employees.length);
 const code=codes[1];list.onclick({target:list.querySelector(`[data-employee-option="${code}"]`)});assert.equal(f.host.querySelector('[data-report-employee-trigger] .duty-employee-code').textContent,code);assert(!f.host.querySelector('[data-report-copy]').disabled);
 f.host.querySelector('[data-report-clear]').onclick();assert.equal(f.host.querySelector('[data-report-copy]').disabled,true);assert.equal(f.host.querySelector('[aria-selected=true]').dataset.employeeOption,'');assert.equal(JSON.stringify(f.data),before);
});
