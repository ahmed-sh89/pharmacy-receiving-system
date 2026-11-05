const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const writes=[];
const ctx=vm.createContext({Uint8Array,ArrayBuffer,TextDecoder,TextEncoder,navigator:{clipboard:{writeText:async text=>writes.push(text)}}});
for(const path of ['js/vendor/sheetjs-0.20.3/xlsx.full.min.js','js/duty-model.js','js/duty-reports.js']){
 vm.runInContext(fs.readFileSync(path,'utf8'),ctx);
}
const {DutyModel:M,DutyReports:R,XLSX:X}=ctx;
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const employee={code:'P1',display_code:'00042',name:'Test Pharmacist',active:true,basic_minutes:480};
 const entries=[
  ['01',M.parse('1 PM–10 PM')],
  ['02',M.parse('9 AM–1 PM / 5 PM–10 PM')],
  ['05',M.parse('7 PM–4 AM')],
  ['06',M.parse('9 AM–6 PM')],
  ['07',M.parse('9 AM–6 PM')],
  ['08',M.normalize({status:'OFF',note:'Coverage elsewhere'})],
  ['09',M.normalize({status:'ANNUAL_LEAVE'})],
  ['10',M.normalize({status:'EMPTY',note:'=SUM(1,2)\t\nkeep literal'})],
  ['11',M.parse('9 AM–6 PM',{manual_minutes:{basic:420,normal_ot:120,friday_ot:0,holiday_ot:0}})],
  ['13',M.parse('9 AM–6 PM')]
 ].map(([day,payload])=>({code:employee.code,date:'2026-11-'+day,payload}));
 entries.push({...entries[0],date:'2026-12-01'});
 return {employees:[employee],entries,holidays:[{date:'2026-11-07',active:true},{date:'2026-11-13',active:true}]};
}
test('report period and day names derive from the selected month',()=>{
 for(const [month,last] of [['2026-02',28],['2028-02',29],['2026-11',30],['2026-12',31]]){
  const p=R.project(fixture(),month,true,'TEST'),days=p.staff[0].days;
  assert.equal(days.length,last);
  const rows=R.copyValues(p.staff[0]).split('\r\n');
  assert.equal(rows.length,last);
  assert.ok(rows.every(row=>row.split('\t').length===8));
  assert.equal(days[0].date,month+'-01');
  assert.equal(days.at(-1).date,month+'-'+last);
 }
 const p=R.project(fixture(),'2026-11',true,'TEST');
 assert.equal(p.dates[0].name,'Sunday');
 assert.equal(p.staff[0].id,'00042');
});
test('one-click E:L clipboard includes only daily inputs and matches Schedule overtime',async()=>{
 const data=fixture();
 data.entries[0].payload=M.parse('1:15 PM–10:15 PM');
 const employee=R.project(data,'2026-11',true,'TEST').staff[0];
 const {document}=parseHTML('<div id="reports"></div>'),host=document.querySelector('#reports');
 R.mount(host,data,{month:'2026-11',demo:true,pharmacyCode:'TEST'});
 assert.equal(host.querySelector('[data-report-copy]').disabled,true);
 host.querySelector('[data-report-employee]').onchange({target:{value:employee.code}});
 assert.equal(host.querySelector('[data-report-copy]').disabled,false);
 assert.equal(host.querySelectorAll('table,input[type="checkbox"]').length,0);
 await host.querySelector('[data-report-copy]').onclick();
 assert.deepEqual(writes,[R.copyValues(employee)]);
 const rows=writes[0].split('\r\n').map(row=>row.split('\t'));
 assert.equal(rows.length,30);
 assert.ok(rows.every(row=>row.length===8));
 assert.deepEqual(rows[0],['1:15 PM','10:15 PM','','','1','','','Working']);
 assert.deepEqual(rows[1],['9:00 AM','1:00 PM','5:00 PM','10:00 PM','1','','','Working']);
 assert.deepEqual(rows[4],['7:00 PM','4:00 AM','','','1','','','Working']);
 assert.deepEqual(rows[5].slice(4,7),['','9','']);
 assert.deepEqual(rows[6].slice(4,7),['','','9']);
 assert.deepEqual(rows[7],['','','','','','','','OFF · Coverage elsewhere']);
 assert.deepEqual(rows[8],['','','','','','','','Annual Leave']);
 assert.equal(rows[9][7],"'=SUM(1,2) keep literal");
 assert.deepEqual(rows[10].slice(4,7),['2','0','0']);
 assert.deepEqual(rows[12].slice(4,7),['','','9']);
 assert.deepEqual(rows.at(-1),Array(8).fill(''));
 assert.deepEqual(plain(employee.totals),plain(M.totals(data.entries.slice(0,-1),data.holidays,data.employees,[],true).P1));
 assert.deepEqual([4,5,6].map(i=>rows.reduce((sum,row)=>sum+Number(row[i]),0)),
  ['normal_ot','friday_ot','holiday_ot'].map(k=>employee.totals[k]/60));
});
test('E:L paste fixture preserves adjacent formulas and replaces a formula inside the target',()=>{
 const employee=R.project(fixture(),'2026-11',true,'TEST').staff[0];
 const rows=R.copyValues(employee).split('\r\n').map(row=>row.split('\t'));
 const grid=X.utils.aoa_to_sheet([]);
 for(const [address,formula] of [['D2','DAY(DATE(2026,11,1))'],['M2','9'],['I2','42']]){
  X.utils.sheet_add_aoa(grid,[[0]],{origin:address});grid[address].f=formula;
 }
 X.utils.sheet_add_aoa(grid,rows,{origin:'E2'});
 assert.equal(grid.D2.f,'DAY(DATE(2026,11,1))');
 assert.equal(grid.M2.f,'9');
 assert.equal(grid.I2.f,undefined);
 rows.forEach((row,r)=>row.forEach((value,c)=>assert.equal(grid[X.utils.encode_cell({r:r+1,c:c+4})].v,value)));
});
test('both XLSX formats reopen with typed values, sheet layout, colors and totals',()=>{
 const data=fixture();
 for(let i=2;i<=8;i++)data.employees.push({...data.employees[0],code:'P'+i,display_code:'00'+i});
 const report=R.project(data,'2026-11',true,'TEST');
 for(const format of ['standard','schedule']){
  const bytes=R.workbookBytes(X,R.workbookPlan(report,report.staff,format));
  const workbook=X.read(bytes,{type:'array',cellNF:true,cellStyles:true});
  assert.equal(workbook.SheetNames.length,format==='standard'?8:2);
  const s=workbook.Sheets[workbook.SheetNames[0]];
  if(format==='standard'){
   assert.equal(s.B10.t,'s');assert.equal(s.B10.v,'00042');
   assert.equal(s.C2.t,'n');assert.equal(s.C2.z,'yyyy-mm-dd');
   assert.equal(s.E2.t,'n');assert.equal(s.E2.z,'h:mm AM/PM');
   assert.equal(s.I2.v,1);assert.equal(s.K14.v,9);
   assert.equal(s.O1.v,'Group Number');assert.equal(s.O2.v,'');
   assert.equal(s.L11.f,undefined);
   assert.equal(s.J32.v,report.staff[0].totals.friday_ot/60);
  }else{
   assert.equal(s.A7.z,'yyyy-mm-dd');assert.equal(s.C6.v,report.staff[0].totals.total/60);
   assert.match(s.C8.v,/9:00 AM – 1:00 PM\n5:00 PM – 10:00 PM/);
   assert.equal(s.C12.s.fgColor.rgb,'D8E8FA');
   assert.equal(s.C19.s.fgColor.rgb,'FFF2D9');
  }
 }
});
