const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const writes=[];const context=vm.createContext({Uint8Array,ArrayBuffer,TextDecoder,TextEncoder,navigator:{clipboard:{writeText:async s=>writes.push(s)}}});
for(const path of ['js/vendor/sheetjs-0.20.3/xlsx.full.min.js','js/duty-model.js','js/duty-reports.js'])vm.runInContext(fs.readFileSync(path,'utf8'),context);
const {DutyModel:M,DutyReports:R,XLSX:X}=context;
const json=x=>JSON.parse(JSON.stringify(x));
function sample(){return {pharmacy_id:'synthetic',can_write:true,employees:[{code:'A',name:'Synthetic A',active:true,sort_order:2},{code:'B',name:'Synthetic B',active:true,sort_order:1}],entries:[{code:'A',date:'2026-11-05',payload:M.parse('7 PM–4 AM')},{code:'A',date:'2026-11-06',payload:M.parse('9 AM–6 PM')},{code:'A',date:'2026-11-07',payload:M.parse('9 AM–1 PM / 5 PM–10 PM',{note:'Actual note'})}],holidays:[{date:'2026-11-07',active:true}],hour_rules:[]};}
test('single employee custom range preserves real start dates, exact E:L and period totals',()=>{
 const report=R.project(sample(),'2026-11',true,'SYNTH');assert.equal(report.staff[0].code,'B');
 const range={from:'2026-11-05',to:'2026-11-07'},part=R.period(report,range),person=part.staff.find(e=>e.code==='A');
 assert.deepEqual(Array.from(person.days,d=>d.date),['2026-11-05','2026-11-06','2026-11-07']);
 assert.equal(person.totals.basic,540);assert.equal(person.totals.friday_ot,540);assert.equal(person.totals.holiday_ot,540);
 const lines=R.copyValues(person).split('\r\n').map(l=>l.split('\t'));assert.equal(lines.length,3);assert(lines.every(l=>l.length===8));assert.equal(lines[0][0],'7:00 PM');assert.equal(lines[2][7],'Actual note');assert.equal(lines[0][7],'');
 assert.throws(()=>R.period(report,{from:'2026-10-31',to:'2026-11-07'}));assert.throws(()=>R.period(report,{from:'2026-11-07',to:'2026-11-01'}));
 assert.equal(R.copyValues(report.staff[1]).split('\r\n').length,30);
 const plan=R.workbookPlan(part,[person],'standard');assert.equal(plan[0].rows[1].values[2],Date.parse('2026-11-05')/86400000+25569);
});
test('report UI announces exact destination date and requires one employee for copy/export',async()=>{
 const {document}=parseHTML('<div id="reports"></div>'),host=document.querySelector('#reports'),data=sample(),config={month:'2026-11',demo:true,pharmacyCode:'SYNTH'};
 R.mount(host,data,config);assert(host.querySelector('[data-report-copy]').disabled);assert(host.querySelector('[data-report-download]').disabled);
 host.querySelector('[data-report-employee]').onchange({target:{value:'A'}});
 host.querySelector('[data-report-period]').onchange({target:{value:'custom'}});
 host.querySelector('[data-report-from]').onchange({target:{value:'2026-11-07'}});
 host.querySelector('[data-report-to]').onchange({target:{value:'2026-11-07'}});
 assert.match(host.querySelector('[data-report-destination]').textContent,/row dated 2026-11-07/);assert.equal(host.querySelector('[data-report-status]').textContent,'');
 await host.querySelector('[data-report-copy]').onclick();assert.equal(writes.at(-1).split('\r\n').length,1);assert.equal(writes.at(-1).split('\t').length,8);
 assert.match(host.querySelector('[data-report-destination]').textContent,/Do not start at day 1/);assert.match(host.querySelector('[data-report-status]').textContent,/Copied 1 days/);
});
test('integer XLSX hours display without a trailing decimal; fractional hours retain precision',()=>{
 const d=sample();d.entries.push({code:'A',date:'2026-11-08',payload:M.normalize({status:'WORK',manual_minutes:{basic:540,normal_ot:90}})});
 const r=R.project(d,'2026-11',true,'SYNTH'),person=r.staff.find(e=>e.code==='A');
 for(const format of ['standard','schedule']){
  const b=R.workbookBytes(X,R.workbookPlan(r,[person],format)),wb=X.read(b,{type:'array',cellNF:true,cellStyles:true});
  const cells=Object.entries(wb.Sheets[wb.SheetNames[0]]).filter(([k])=>!k.startsWith('!')).map(([,c])=>c);
  assert(cells.some(c=>c.t==='n'&&Number.isInteger(c.v)&&c.z==='0'));
  for(const c of cells.filter(c=>c.t==='n'&&c.z==='0'))assert(!X.SSF.format(c.z,c.v).endsWith('.'));
  if(format==='standard'){const c=wb.Sheets[wb.SheetNames[0]].I9;assert.equal(c.v,1.5);assert.equal(X.SSF.format(c.z,c.v),'1.5');}
 }
});
test('actual supervisor template: disposable full-month/range paste changes only intended E:L slots', {skip:!process.env.PHARMFLOW_DUTY_TEMPLATE},()=>{
 const original=fs.readFileSync(process.env.PHARMFLOW_DUTY_TEMPLATE),wb=X.read(original,{type:'buffer',cellNF:true,cellStyles:true}),sheet=wb.Sheets[wb.SheetNames[0]];
 const headers=Object.keys(sheet).filter(a=>/^E\d+$/.test(a)&&sheet[a].v==='Check In 1').map(a=>X.utils.decode_cell(a).r).sort((a,b)=>a-b);assert(headers.length>1);assert.equal(headers[0]+1,1);
 const employee=R.project(sample(),'2026-11',true,'SYNTH').staff.find(e=>e.code==='A');
 for(const block of [0,1])for(const range of [null,{from:'2026-11-07',to:'2026-11-09'}]){
  const copy=structuredClone(sheet),rows=R.copyValues(employee,range).split('\r\n').map(l=>l.split('\t')),offset=range?6:0,start=headers[block]+1+offset;
  for(let r=0;r<rows.length;r++)for(let c=0;c<8;c++){const address=X.utils.encode_cell({r:start+r,c:4+c});copy[address]={...(copy[address]||{}),t:'s',v:rows[r][c]};}
  for(const address of Object.keys(sheet)){if(address.startsWith('!')){assert.deepEqual(json(copy[address]),json(sheet[address]));continue;}const {r,c}=X.utils.decode_cell(address);if(c<4||c>11||r<start||r>=start+rows.length)assert.deepEqual(json(copy[address]),json(sheet[address]),address);else assert.deepEqual(json(copy[address].s),json(sheet[address].s));}
  assert.equal(copy[X.utils.encode_cell({r:start,c:4})].v,range?'9:00 AM':'');
 }
 assert.equal(Buffer.compare(fs.readFileSync(process.env.PHARMFLOW_DUTY_TEMPLATE),original),0);
});

test('schedule labels never replace official names in either export; merged totals align after daily E:L',()=>{
 const data=sample(),official='Synthetic Full Official Employee Name';Object.assign(data.employees[0],{name:official,schedule_display_name:'Schedule Short'});
 assert.equal(M.scheduleLabel(data.employees[0]),'Schedule Short');assert.equal(data.employees[0].name,official);
 assert.equal(M.scheduleLabel({...data.employees[0],schedule_display_name:''}),'Synthetic Name');
 const report=R.project(data,'2026-11',true,'SYNTH'),person=report.staff.find(e=>e.code==='A');assert.equal(person.name,official);
 for(const format of ['standard','schedule']){
  const plan=R.workbookPlan(report,[person],format),wb=X.read(R.workbookBytes(X,plan),{type:'array'}),sheet=wb.Sheets[wb.SheetNames[0]],text=JSON.stringify(sheet);
  assert(text.includes(official));assert(!text.includes('Schedule Short'));
  if(format==='standard'){
   const rows=X.utils.sheet_to_json(sheet,{header:1});assert.deepEqual(json(rows.slice(-3).map(r=>r[0])),['Period Totals','Basic Hours','Total Hours']);
   assert.equal(rows.at(-2)[8],person.totals.basic/60);assert.equal(rows.at(-1)[8],person.totals.total/60);
   assert.equal(sheet['!merges'].length,3);assert(sheet['!merges'].every(m=>m.s.c===0&&m.e.c===7));
  }
 }
});
