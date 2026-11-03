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
function fixture(){
 const {document}=parseHTML('<html><body><section id="page-duty"></section></body></html>');
 const window={document,DutyModel:M,addEventListener:()=>{}};
 const events={},calls=[];
 const data={...M.demo(),pharmacy_id:'pharmacy-a'};data.employees=[];
 const c={window,document:window.document,APP_CONFIG:{environment:'staging'},CLOUD_CONFIG:{url:'https://tovkcakucyagvbzvlnks.supabase.co'},AuthState:{session:{},user:{id:'user-a'},context:{pharmacy_id:'pharmacy-a',user_id:'user-a',pharmacy_code:'TEST'},mustChangePassword:false},AppRouter:{currentRoute:'duty'},AppEvents:{on:(key,fn)=>events[key]=fn},AUTH_STORAGE_KEY:'auth',authRpc:async(name,args)=>{calls.push({name,args});return data;},Intl,Date,crypto:require('node:crypto').webcrypto,FormData};
 c.setInterval=()=>{};vm.createContext(c);vm.runInContext(fs.readFileSync('js/duty.js','utf8'),c);
 return {c,root:window.document.getElementById('page-duty'),events,calls,window,data};
}
test('month navigation is read only; demo never writes and highlights entire Fridays',async()=>{
 const f=fixture();f.events['route:changed']({routeName:'duty'});await new Promise(setImmediate);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'get_pharmflow_duty_foundation_v1');
 f.root.querySelector('[data-duty-action="demo"]').click();
 assert.equal(f.root.querySelectorAll('.duty-employee-row').length,10);
 assert.equal(f.root.querySelectorAll('td.duty-friday').length,f.root.querySelectorAll('th.duty-friday').length*10);
 assert.ok(f.root.textContent.includes('Nothing in this view is saved'));
 f.root.querySelector('[data-duty-action="next"]').click();await new Promise(setImmediate);
 assert.ok(f.calls.every(c=>c.name==='get_pharmflow_duty_foundation_v1'));
 assert.equal(f.root.querySelectorAll('td.duty-total-col').length,10);
});
test('untrusted employee content is escaped, never executed as HTML',async()=>{
 const f=fixture();f.data.employees=[{code:'TEST-1',name:'<img src=x onerror=alert(1)>',position_key:'labor',active:true}];
 f.events['route:changed']({routeName:'duty'});await new Promise(setImmediate);
 assert.equal(f.root.querySelectorAll('img').length,0);assert.ok(f.root.textContent.includes('<img'));
});
test('build output points exclusively to Staging and Duty sits after Expiry',()=>{
 const html=fs.readFileSync('dist/index.html','utf8'),cloud=fs.readFileSync('dist/js/supabase.js','utf8'),config=fs.readFileSync('dist/js/config.js','utf8'),version=JSON.parse(fs.readFileSync('dist/version.json'));
 assert.ok(html.indexOf('data-page="duty"')>html.indexOf('data-page="expiry"'));
 assert.ok(!html.includes('zznoshzcyxmtwfbznjyr'));assert.ok(!cloud.includes('zznoshzcyxmtwfbznjyr'));
 assert.ok(cloud.includes('tovkcakucyagvbzvlnks'));assert.match(config,/"staging"/);assert.match(config,/duty:\{id:"duty"/);
 assert.equal(version.environment,'staging');assert.equal(version.stage,'A');
});
