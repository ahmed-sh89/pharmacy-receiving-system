const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ctx=vm.createContext({Uint8Array,ArrayBuffer,TextDecoder,TextEncoder});
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
  assert.equal(days[0].date,month+'-01');
  assert.equal(days.at(-1).date,month+'-'+last);
 }
 const p=R.project(fixture(),'2026-11',true,'TEST');
 assert.equal(p.dates[0].name,'Sunday');
 assert.equal(p.staff[0].id,'00042');
});
test('Copy Values uses three narrow blocks, preserves empty shifts and matches Schedule totals',()=>{
 const d=fixture(),e=R.project(d,'2026-11',true,'TEST').staff[0];
 const shifts=R.copyRows(e,'shifts'),ot=R.copyRows(e,'overtime'),notes=R.copyRows(e,'notes');
 assert.deepEqual(plain(shifts.slice(0,2)),[['1:00 PM','10:00 PM','',''],['9:00 AM','1:00 PM','5:00 PM','10:00 PM']]);
 assert.deepEqual(plain(shifts[4]),['7:00 PM','4:00 AM','','']);
 assert.deepEqual(plain(ot[5]),['','9','']);
 assert.deepEqual(plain(ot[6]),['','','9']);
 assert.deepEqual(plain(ot[12]),['','','9']);
 assert.deepEqual(plain(shifts[7]),['','','','']);
 assert.deepEqual(plain(notes.slice(7,10)),[['OFF · Coverage elsewhere'],['Annual Leave'],["'=SUM(1,2) keep literal"]]);
 assert.deepEqual(plain(e.totals),plain(M.totals(d.entries.slice(0,-1),d.holidays,d.employees,[],true).P1));
 assert.deepEqual([0,1,2].map(i=>ot.reduce((sum,row)=>sum+Number(row[i]),0)),
  ['normal_ot','friday_ot','holiday_ot'].map(k=>e.totals[k]/60));
});
test('disposable spreadsheet preserves adjacent formulas when pasting into verified inputs; pasting over formulas replaces them',()=>{
 const e=R.project(fixture(),'2026-11',true,'TEST').staff[0],values=R.copyRows(e,'shifts');
 const grid=X.utils.aoa_to_sheet([[],[null,null,1,'Sunday',null,null,null,null,9]]);
 grid.C2.f='DAY(DATE(2026,11,1))';grid.I2.f='9';
 const clipboard=values.map(row=>row.join('\t')).join('\r\n');
 const paste=origin=>X.utils.sheet_add_aoa(grid,clipboard.split('\r\n').map(row=>row.split('\t')),{origin});
 paste('E2');
 assert.equal(grid.C2.f,'DAY(DATE(2026,11,1))');
 assert.equal(grid.I2.f,'9');
 assert.equal(grid.E2.v,'1:00 PM');
 assert.equal(grid.H3.v,'10:00 PM');
 paste('C2');
 assert.equal(grid.C2.f,undefined);
 assert.equal(grid.C2.v,'1:00 PM');
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
