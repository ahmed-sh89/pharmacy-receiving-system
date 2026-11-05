const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const modelContext={};vm.createContext(modelContext);vm.runInContext(fs.readFileSync('js/duty-model.js','utf8'),modelContext);const M=modelContext.DutyModel;
test('calendar lengths, leap year and Friday columns use UTC dates',()=>{
 assert.equal(M.days('2026-11').length,30);assert.equal(M.days('2028-02').length,29);assert.equal(M.days('2027-02').length,28);
 assert.deepEqual(Array.from(M.days('2026-11').filter(x=>x.friday),x=>x.day),[6,13,20,27]);
 assert.equal(M.shiftMonth('2026-12',1),'2027-01');assert.equal(M.shiftMonth('2027-01',-1),'2026-12');
 assert.deepEqual(Array.from(M.calendarRange('2026-11',{from:'2026-10-31',to:'2026-11-03'}),d=>d.day),[1,2,3]);
 assert.deepEqual(Array.from(M.calendarRange('2026-11',{from:'2026-11-29',to:'2026-12-02'}),d=>d.day),[29,30]);
 assert.deepEqual(Array.from(M.dateRange('2026-11-29','2026-12-02')),['2026-11-29','2026-11-30','2026-12-01','2026-12-02']);
 assert.throws(()=>M.dateRange('2026-11-31','2026-12-02'));
 assert.throws(()=>M.days('2026-13'));assert.throws(()=>M.days('2026-1'));
});
test('synthetic employee demo is detached and has all positions',()=>{
 const a=M.demo(),b=M.demo();a.employees[0].name='Changed';assert.notEqual(a.employees[0].name,b.employees[0].name);
 assert.equal(b.employees.length,10);assert.deepEqual(Array.from(b.positions,x=>x.label),['Pharmacist','Labor','Beauty Advisor']);
 assert.ok(b.employees.every(e=>e.code.startsWith('DEMO-')));
});
test('employee validation preserves codes and rejects empty names',()=>{
 assert.equal(M.validateEmployee({code:'000123',name:'Synthetic',position_key:'labor'}).code,'000123');
 assert.throws(()=>M.validateEmployee({code:'=1+1',name:'Test',position_key:'labor'}));
 assert.throws(()=>M.validateEmployee({code:'A',name:' ',position_key:'labor'}));
});
function fixture(environment='staging'){
 const {document}=parseHTML('<html><body><section id="page-duty"></section></body></html>');
 const lifecycle={};const window={document,DutyModel:M,addEventListener:(name,fn)=>lifecycle[name]=fn,PharmFlowPermissions:{allowed:()=>true}};
 const events={},calls=[];
 const data={...M.demo(),pharmacy_id:'pharmacy-a'};data.employees=[];
 const c={window,document:window.document,APP_CONFIG:{environment},CLOUD_CONFIG:{url:'https://tovkcakucyagvbzvlnks.supabase.co'},AuthState:{session:{},user:{id:'user-a'},context:{pharmacy_id:'pharmacy-a',user_id:'user-a',pharmacy_code:'TEST'},mustChangePassword:false},AppRouter:{currentRoute:'duty'},AppEvents:{on:(key,fn)=>events[key]=fn},AUTH_STORAGE_KEY:'auth',authRpc:async(name,args)=>{calls.push({name,args});return data;},Intl,Date,crypto:require('node:crypto').webcrypto,FormData,structuredClone,CSS:{escape:s=>s}};
 c.setInterval=()=>{};vm.createContext(c);vm.runInContext(fs.readFileSync('js/duty-schedule.js','utf8'),c);c.DutySchedule=window.DutySchedule;vm.runInContext(fs.readFileSync('js/duty.js','utf8'),c);
 return {c,root:window.document.getElementById('page-duty'),events,calls,window,data,lifecycle};
}
test('month navigation is read only; demo never writes and highlights entire Fridays',async()=>{
 const f=fixture();f.events['route:changed']({routeName:'duty'});await new Promise(setImmediate);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'get_pharmflow_duty_schedule_v1');
 f.root.querySelector('[data-duty-action="demo"]').click();
 assert.equal(f.root.querySelectorAll('thead .duty-mini-kpis').length,6);
 const fridays=M.days(f.root.querySelector('#duty-month').value).filter(d=>d.friday).length;
 assert.equal(f.root.querySelectorAll('.duty-friday-row').length,fridays);
 assert.equal(f.root.querySelectorAll('.duty-friday-row td').length,6*fridays);
 assert.ok(f.root.textContent.includes('Synthetic demo'));
 f.root.querySelector('[data-duty-action="next"]').click();await new Promise(setImmediate);
 assert.ok(f.calls.every(c=>c.name==='get_pharmflow_duty_schedule_v1'));
 assert.equal(f.root.querySelectorAll('thead .duty-category-total').length,6);
});
test('Duty keyboard and clipboard events act on the selected cell',async()=>{
 const f=fixture();
 f.root.querySelector('[data-duty-action="demo"]').click();
 await new Promise(setImmediate);
 const host=f.root.querySelector('#duty-schedule-body'),cell=()=>host.querySelector('[data-s-code="DEMO-001"][data-s-date="2026-11-01"]')||host.querySelector('[data-s-code="DEMO-001"]');
 cell().click();
 let consumed=false;
 await host.onkeydown({target:cell(),key:'c',code:'KeyC',ctrlKey:true,preventDefault(){consumed=true;}});
 assert.ok(consumed);
 assert.match(host.textContent,/Copied 1 cell/);
 consumed=false;
 host.oncopy({target:cell(),preventDefault(){consumed=true;}});
 assert.ok(consumed);
 assert.ok(!host.querySelector('[data-s-action="paste"]').disabled);
});
test('range deletion is atomic, undoable and revision checked',async()=>{
 const f=fixture(),host=f.root.querySelector('#duty-schedule-body'),data=M.demoMonth('2026-11');
 const row=(code,date)=>data.entries.find(e=>e.code===code&&e.date===date);
 const cell=(code,date)=>host.querySelector(`[data-s-code="${code}"][data-s-date="${date}"]`);
 const confirms=[];
 let allow=false;
 f.window.DutySchedule.mount(host,data,{month:'2026-11',demo:true,readMonth:async()=>({...data,entries:[]}),
  confirm:async(message,action)=>{confirms.push({message,action});return allow;},
  save:async(changes)=>{
   if(changes.some(c=>row(c.code,c.date)?.revision!==c.expected_revision))throw Error('DUTY_CONFLICT');
   changes.forEach(c=>Object.assign(row(c.code,c.date),{payload:c.payload,revision:c.expected_revision+1}));
   return data;
  }
 });
 await new Promise(setImmediate);
 const a='DEMO-001',b='DEMO-002',d1='2026-11-01',d2='2026-11-02';
 const press=(code,date,key,modifiers={})=>host.onkeydown({target:cell(code,date),key,preventDefault(){},...modifiers});
 cell(a,d1).click();assert.equal(host.querySelectorAll('.duty-cell-editor').length,0);
 assert.equal(host.querySelectorAll('td[data-s-code] button').length,0);
 assert.equal(host.querySelector('.duty-selection-tools').parentElement.nextElementSibling,host.querySelector('.duty-vertical'));
 await press(a,d1,'ArrowRight',{shiftKey:true});
 await press(b,d1,'ArrowDown',{shiftKey:true});
 assert.equal(host.querySelectorAll('.duty-selected').length,4);
 await press(b,d2,'Delete');
 assert.equal(confirms[0].action,'Delete');assert.equal(row(a,d1).payload.status,'WORK');
 allow=true;await press(b,d2,'Delete');
 assert.equal(row(a,d1).payload.status,'EMPTY');assert.equal(row(b,d2).payload.status,'EMPTY');
 assert.notEqual(row(a,'2026-11-03').payload.status,'EMPTY');
 await press(b,d2,'z',{ctrlKey:true});assert.equal(row(a,d1).payload.status,'WORK');
 await press(b,d2,'y',{ctrlKey:true});assert.equal(row(a,d1).payload.status,'EMPTY');
 row(b,d2).revision++;
 await press(b,d2,'z',{ctrlKey:true});
 assert.equal(row(a,d1).payload.status,'EMPTY');assert.match(host.textContent,/Another session changed/);
});
test('untrusted employee content is escaped, never executed as HTML',async()=>{
 const f=fixture();f.data.employees=[{code:'TEST-1',name:'<img src=x onerror=alert(1)>',position_key:'pharmacist',active:true}];
 f.events['route:changed']({routeName:'duty'});await new Promise(setImmediate);
 assert.equal(f.root.querySelectorAll('img').length,0);assert.ok(f.root.textContent.includes('<img'));
});
test('build output uses exactly the intended environment and registers Duty after Expiry',()=>{
 const html=fs.readFileSync('dist/index.html','utf8'),cloud=fs.readFileSync('dist/js/supabase.js','utf8'),config=fs.readFileSync('dist/js/config.js','utf8'),version=JSON.parse(fs.readFileSync('dist/version.json'));
 assert.ok(html.indexOf('data-page="duty"')>html.indexOf('data-page="expiry"'));
 assert.match(config,/duty:\{id:"duty"/);
 if(version.environment==='staging'){
  assert.equal(version.supabaseRef,'tovkcakucyagvbzvlnks');
  assert.ok(!html.includes('zznoshzcyxmtwfbznjyr'));assert.ok(!cloud.includes('zznoshzcyxmtwfbznjyr'));
  assert.ok(cloud.includes('tovkcakucyagvbzvlnks'));assert.match(config,/"staging"/);
  assert.equal(version.branch,'feature/duty-staging-20261104');
 }else{
  assert.equal(version.environment,'production');assert.equal(version.supabaseRef,'zznoshzcyxmtwfbznjyr');
  assert.ok(cloud.includes('zznoshzcyxmtwfbznjyr'));assert.ok(!cloud.includes('tovkcakucyagvbzvlnks'));
  assert.match(config,/"production"/);assert.ok(!html.includes('data-duty-synthetic'));
  assert.equal(fs.existsSync('dist/duty-demo.html'),false);
 }
});


test('Duty renders compact shift lines and independently labels consecutive leave cells',()=>{
 const f=fixture(),month='2026-11',data=M.demoMonth(month),host=f.root;
 const employee=data.employees[0];
 for(const entry of data.entries.filter(e=>e.code===employee.code&&e.date<='2026-11-20')){
  entry.payload=M.normalize({status:'ANNUAL_LEAVE'});
 }
 f.window.DutySchedule.mount(host,data,{month,demo:true});
 const leave=[...host.querySelectorAll('td.duty-leave')];
 assert.equal(leave.length,20);
 assert.equal(new Set(leave.map(cell=>cell.dataset.sDate)).size,20);
 assert.ok(leave.every(cell=>cell.querySelector('.duty-cell-status').textContent==='Annual Leave'));
 const split=host.querySelector('[data-s-code="DEMO-001"][data-s-date="2026-11-22"] [data-s-time]');
 assert.deepEqual([...split.children].map(line=>line.textContent),['9:00 AM – 1:00 PM','5:00 PM – 10:00 PM']);
 assert.ok(host.querySelector('button[popovertarget="duty-dropdown-staff"]'));
 assert.ok(host.querySelector('#duty-dropdown-status [data-dropdown-value="ANNUAL_LEAVE"]'));
});

test('Calendar Settings range deduplicates staff dates and requires explicit input for gaps',()=>{
 const select=dates=>structuredClone(M.selectedDateRange(dates.map(date=>({date})),'2026-11'));
 assert.deepEqual(select([]),{from:'2026-11-01',to:'2026-11-01'});
 assert.deepEqual(select(['2026-11-03','2026-11-01','2026-11-01','2026-11-02']),{from:'2026-11-01',to:'2026-11-03'});
 assert.deepEqual(select(['2026-11-01','2026-11-03']),{from:'',to:''});
});


test('Production runtime loads only authorized Duty and clears cached staff on revocation',async()=>{
 const f=fixture('production');let allowed=false;
 f.window.PharmFlowPermissions.allowed=()=>allowed;
 f.data.employees=[{code:'SYNTH-1',name:'Synthetic persisted employee',position_key:'pharmacist',active:true}];
 f.data.entries=[];f.data.holidays=[];
 f.events['route:changed']({routeName:'duty'});await new Promise(setImmediate);
 assert.equal(f.calls.length,0);
 allowed=true;f.lifecycle['pharmflow:permissions-ready']();await new Promise(setImmediate);
 assert.equal(f.calls.length,1);assert.ok(f.root.textContent.includes('Synthetic persisted employee'));
 assert.equal(f.root.querySelector('[data-duty-action="demo"]'),null);
 allowed=false;f.lifecycle['pharmflow:permission-state']();
 assert.ok(!f.root.textContent.includes('Synthetic persisted employee'));
 assert.equal(f.root.querySelectorAll('[data-s-code]').length,0);
});
