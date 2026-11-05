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
  ['10',M.normalize({status:'EMPTY',note:'Coverage 2'})],
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
 assert.deepEqual(rows[0],['1:15 PM','10:15 PM','','','1','','','']);
 assert.deepEqual(rows[1],['9:00 AM','1:00 PM','5:00 PM','10:00 PM','1','','','']);
 assert.deepEqual(rows[4],['7:00 PM','4:00 AM','','','1','','','']);
 assert.deepEqual(rows[5].slice(4,7),['','9','']);
 assert.deepEqual(rows[6].slice(4,7),['','','9']);
 assert.deepEqual(rows[7],['','','','','','','','Coverage elsewhere']);
 assert.deepEqual(rows[8],['','','','','','','','']);
 assert.equal(rows[9][7],'Coverage 2');
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
test('actual Notes remain independent of status across clipboard, preview and export',()=>{
 const data=fixture(),note='Coverage Pharmacy 2 · Keep exact "text"';
 data.entries[0].payload.note=note;
 const report=R.project(data,'2026-11',true,'TEST'),employee=report.staff[0];
 assert.equal(employee.days[1].notes,'');
 assert.equal(employee.days[7].notes,'Coverage elsewhere');
 assert.equal(employee.days[8].notes,'');
 assert.equal(employee.days[0].notes,note);
 assert.equal(R.copyValues(employee).split('\r\n')[0].split('	')[7],'"Coverage Pharmacy 2 · Keep exact ""text"""');
 const standard=R.workbookPlan(report,[employee],'standard');
 assert.equal(standard[0].rows[1].values[11],note);
 assert.equal(standard[0].rows[2].values[11],null);
 const schedule=R.workbookPlan(report,[employee],'schedule');
 assert.ok(schedule[0].rows[6].values[2].includes(note));
 assert.ok(!schedule[0].rows[7].values[2].includes('Working'));
});
test('preview is read-only, paginated, and follows employee, format and month',()=>{
 const data=fixture();for(let i=2;i<=8;i++)data.employees.push({...data.employees[0],code:'P'+i});
 const {document}=parseHTML('<div id="reports"></div>'),host=document.querySelector('#reports');
 const original=JSON.stringify(data);
 R.mount(host,data,{month:'2026-11',demo:true,pharmacyCode:'TEST'});
 host.querySelector('[data-report-preview]').onclick();
 assert.equal(host.querySelector('[data-report-preview]').textContent,'Hide Table');
 host.querySelector('[data-report-format]').onchange({target:{value:'schedule'}});
 host.querySelector('[data-report-employee]').onchange({target:{value:''}});
 assert.equal(host.querySelectorAll('thead th').length,8);
 host.querySelector('[data-preview-page="1"]').onclick();
 assert.equal(host.querySelectorAll('thead th').length,4);
 host.querySelector('[data-report-employee]').onchange({target:{value:'P1'}});
 assert.equal(host.querySelectorAll('thead th').length,3);
 assert.match(host.querySelector('.duty-report-preview-heading').textContent,/Test Pharmacist/);
 R.mount(host,data,{month:'2028-02',demo:true,pharmacyCode:'TEST'});
 assert.equal(host.querySelectorAll('tbody tr').length,34);
 assert.match(host.querySelector('.duty-report-preview-heading').textContent,/February 2028/);
 assert.equal(JSON.stringify(data),original);
});
test('XLSX ZIP, XML ordering, style indices, relationships and typed cells validate for every month length',()=>{
 const os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'duty-xlsx-'));
 try{
  for(const month of ['2026-02','2028-02','2026-11','2026-12']){
   const data=fixture(),report=R.project(data,month,true,'TEST');
   for(const format of ['standard','schedule']){
    const bytes=R.workbookBytes(X,R.workbookPlan(report,report.staff,format));
    const file=path.join(dir,month+'-'+format+'.xlsx');fs.writeFileSync(file,bytes);
    const checks=JSON.parse(execFileSync('python3',['tests/duty-xlsx-validation.py',file],{encoding:'utf8'}));
    assert.equal(checks[0].structure,'PASS');
    assert.equal(checks[0].zip_crc,'PASS');
   }
  }
  const report=R.project(fixture(),'2026-11',true,'TEST');
  const bytes=R.workbookBytes(X,R.workbookPlan(report,report.staff,'schedule'));
  const zip=X.CFB.read(bytes,{type:'buffer'});
  const part=zip.FileIndex[zip.FullPaths.findIndex(n=>n.endsWith('/xl/worksheets/sheet1.xml'))];
  let xml=new TextDecoder().decode(new Uint8Array(part.content));
  const properties=xml.match(/<sheetPr>[\s\S]*?<\/sheetPr>/)[0];
  xml=xml.replace(properties,'').replace(/<dimension[^>]*\/>/,tag=>tag+properties);
  part.content=new TextEncoder().encode(xml);part.size=part.content.length;
  const broken=path.join(dir,'invalid-order.xlsx');
  fs.writeFileSync(broken,X.CFB.write(zip,{fileType:'zip',type:'array'}));
  assert.throws(()=>execFileSync('python3',['tests/duty-xlsx-validation.py',broken],{stdio:'pipe'}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
