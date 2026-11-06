const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom'),plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const {document}=parseHTML('<div id="reports"></div>'),writes=[],downloads=[];let bytes;
 const c=vm.createContext({document,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,navigator:{clipboard:{writeText:async t=>writes.push(t)}},Blob:class{constructor(parts){bytes=parts[0];}},URL:{createObjectURL:()=>{downloads.push(bytes);return '/synthetic.xlsx';},revokeObjectURL:()=>{}},setTimeout:()=>0,clearTimeout:()=>{}});
 for(const path of ['js/vendor/sheetjs-0.20.3/xlsx.full.min.js','js/duty-model.js','js/duty-controls.js','js/duty-reports.js'])vm.runInContext(fs.readFileSync(path,'utf8'),c);
 const M=c.DutyModel,employees=Array.from({length:8},(_,i)=>({code:'E'+(i+1),display_code:'00'+(i+1),name:'Synthetic Official Employee '+(i+1),position_key:i<5?'pharmacist':'labor',active:true,sort_order:i===7?0:i+1}));
 employees.push({code:'H',display_code:'HIST',name:'Historical Employee',active:false,sort_order:9},{code:'OLD',name:'Inactive Unused',active:false});
 const entries=[['E1','05','7 PM–4 AM'],['E2','06','9 AM–6 PM'],['E1','07','9 AM–1 PM / 5 PM–10 PM'],['H','09','1 PM–10 PM']].map(([code,day,time])=>({code,date:'2026-11-'+day,payload:M.parse(time)}));
 entries.push({code:'E3',date:'2026-11-08',payload:M.normalize({status:'WORK',manual_minutes:{basic:480,normal_ot:60}})});
 const data={pharmacy_id:'synthetic',employees,positions:M.defaults,entries,holidays:[{date:'2026-11-07',active:true}],hour_rules:[]},host=document.querySelector('#reports'),config={month:'2026-11',demo:true,pharmacyCode:'SYNTH'};
 c.DutyReports.mount(host,data,config);
 return {c,M,R:c.DutyReports,X:c.XLSX,data,host,config,writes,downloads,export:()=>{host.querySelector('[data-report-download]').onclick();return c.XLSX.read(downloads.at(-1),{type:'array'});}};
}
const rows=(f,wb)=>plain(wb.SheetNames.map(n=>f.X.utils.sheet_to_json(wb.Sheets[n],{header:1})));
test('All Employees defaults to enabled one-workbook export; Schedule Layout preserves every applicable employee/order/totals and blank staff',async()=>{
 const f=fixture(),before=JSON.stringify(f.data);assert.equal(f.host.querySelector('[data-report-employee]').value,'');assert.equal(f.host.querySelector('option').textContent,'All Employees');assert(!f.host.querySelector('[data-report-download]').disabled);assert(f.host.querySelector('[data-report-copy]').disabled);
 await f.host.querySelector('[data-report-copy]').onclick();assert.equal(f.writes.length,0);
 f.host.querySelector('[data-report-format]').onchange({target:{value:'schedule'}});const wb=f.export(),sheets=rows(f,wb);assert.equal(f.downloads.length,1);assert.equal(sheets.length,9);
 const headers=sheets.flatMap(r=>r[0].slice(2)),report=f.R.project(f.data,'2026-11',true,'SYNTH');assert.deepEqual(headers,Array.from(report.staff,e=>e.name+'\n'+e.id));assert.equal(headers.length,9);assert.equal(new Set(headers).size,9);assert.match(headers[0],/Employee 8/);assert(!headers.some(x=>x.includes('Inactive Unused')));
 for(const sheet of sheets){assert.equal(sheet.length,36);assert.equal(new Set(sheet.slice(6).map(r=>r[0])).size,30);assert.equal(sheet[6][0],Date.parse('2026-11-01')/86400000+25569);for(let col=2;col<sheet[0].length;col++){const person=report.staff.find(e=>sheet[0][col]===e.name+'\n'+e.id);assert.equal(sheet[5][col],person.totals.total/60);}}
 assert.equal(sheets[0][5][2],0);assert(sheets[0].slice(6).every(r=>!r[2])); // active employee with no shifts
 const expected={E1:18,E2:9,E3:9,H:9};for(const person of report.staff)assert.equal(person.totals.total/60,expected[person.code]||0);
 f.host.querySelector('[data-report-format]').onchange({target:{value:'standard'}});const standard=f.export();assert.equal(standard.SheetNames.length,9);assert.match(standard.Sheets[standard.SheetNames[0]].B11.v,/Employee 8/);for(const sheet of rows(f,standard)){assert.equal(sheet.length,34);assert.equal(new Set(sheet.slice(1,31).map(r=>r[2])).size,30);}assert.equal(f.downloads.length,2);
 assert.equal(JSON.stringify(f.data),before);
});
test('All Employees custom range exports one workbook in both formats with exact dates, no duplicate days, blank employees and selected-period totals',()=>{
 const f=fixture(),before=JSON.stringify(f.data);f.host.querySelector('[data-report-period]').onchange({target:{value:'custom'}});f.host.querySelector('[data-report-from]').onchange({target:{value:'2026-11-05'}});f.host.querySelector('[data-report-to]').onchange({target:{value:'2026-11-07'}});
 for(const format of ['schedule','standard']){f.host.querySelector('[data-report-format]').onchange({target:{value:format}});const wb=f.export(),sheets=rows(f,wb);assert.equal(wb.SheetNames.length,9);for(const sheet of sheets){const dates=format==='schedule'?sheet.slice(6).map(r=>r[0]):sheet.slice(1,4).map(r=>r[2]);assert.deepEqual(dates,['05','06','07'].map(day=>Date.parse('2026-11-'+day)/86400000+25569));assert.equal(new Set(dates).size,3);}}
 assert.equal(f.downloads.length,2);assert.equal(JSON.stringify(f.data),before);
});
test('Individual export and Copy remain individual; Clear returns to All without losing the period; no-employee export stays disabled',async()=>{
 const f=fixture();f.host.querySelector('[data-report-period]').onchange({target:{value:'custom'}});f.host.querySelector('[data-report-from]').onchange({target:{value:'2026-11-05'}});f.host.querySelector('[data-report-to]').onchange({target:{value:'2026-11-07'}});f.host.querySelector('[data-report-employee]').onchange({target:{value:'E1'}});f.host.querySelector('[data-report-format]').onchange({target:{value:'schedule'}});
 const sheets=rows(f,f.export());assert.equal(sheets.length,1);assert.equal(sheets[0][0].length,3);assert.match(sheets[0][0][2],/Employee 1/);assert.equal(sheets[0][5][2],18);
 await f.host.querySelector('[data-report-copy]').onclick();assert.equal(f.writes[0].split('\r\n').length,3);assert(f.writes[0].split('\r\n').every(r=>r.split('\t').length===8));
 f.host.querySelector('[data-report-clear]').onclick();assert.equal(f.host.querySelector('[data-report-from]').value,'2026-11-05');assert.equal(f.host.querySelector('[data-report-to]').value,'2026-11-07');assert(!f.host.querySelector('[data-report-download]').disabled);assert(f.host.querySelector('[data-report-copy]').disabled);
 f.R.mount(f.host,{...f.data,employees:[],entries:[]},{...f.config,pharmacyCode:'EMPTY'});assert(f.host.querySelector('[data-report-download]').disabled);
});
test('shared viewport fit subtracts actual header/content position and padding, follows resize and supports scaled previews',()=>{
 const handlers={},values={},page={getBoundingClientRect:()=>({top:90,width:1000}),parentElement:{},style:{setProperty:(k,v)=>values[k]=v}},host={isConnected:true,closest:()=>page,ownerDocument:{querySelector:()=>null}};
 const window={innerHeight:900,requestAnimationFrame:fn=>fn(),scrollTo:()=>{},addEventListener:(n,fn)=>handlers[n]=fn,getComputedStyle:()=>({paddingBottom:'16',getPropertyValue:()=> '1'})};const c=vm.createContext({window});vm.runInContext(fs.readFileSync('js/duty-controls.js','utf8'),c);window.DutyControls.fitViewport(host);assert.equal(values['--duty-viewport-height'],'790px');window.innerHeight=700;handlers.resize();assert.equal(values['--duty-viewport-height'],'590px');
 page.getBoundingClientRect=()=>({top:72,width:800});window.innerHeight=900;window.getComputedStyle=()=>({paddingBottom:'16',getPropertyValue:()=>'.8'});handlers.resize();assert.equal(values['--duty-viewport-height'],'1014px');
});
