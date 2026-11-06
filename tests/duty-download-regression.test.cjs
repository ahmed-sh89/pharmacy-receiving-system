const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),os=require('node:os');
const c=vm.createContext({Uint8Array,ArrayBuffer,TextEncoder,TextDecoder});for(const p of ['js/vendor/sheetjs-0.20.3/xlsx.full.min.js','js/duty-model.js','js/duty-reports.js'])vm.runInContext(fs.readFileSync(p,'utf8'),c);
const M=c.DutyModel,R=c.DutyReports,dir=fs.mkdtempSync(path.join(os.tmpdir(),'duty-blob-'));
test('actual Blob bytes are valid ZIP/XLSX for individual/all, both layouts, month/range; valid dates, job sheet IDs and full identity',async()=>{
 const d=M.demoMonth('2026-11');d.employees=d.employees.slice(0,3);d.employees[0].display_code='00012';d.employees[1].display_code='00013';d.employees[2].display_code='00014';d.entries=d.entries.filter(e=>e.code===d.employees[0].code);
 for(const custom of [false,true])for(const mode of ['single','all'])for(const format of ['standard','schedule']){
  let r=R.project(d,'2026-11',true,'HKP30');if(custom)r=R.period(r,{from:'2026-11-05',to:'2026-11-07'});const staff=mode==='single'?r.staff.slice(0,1):r.staff,plan=R.exportPlan(r,staff,format),bytes=R.workbookBytes(c.XLSX,plan),blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),saved=new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(Array.from(saved.slice(0,4)),[80,75,3,4]);const dv=new DataView(saved.buffer);let end=saved.length-22;assert.equal(dv.getUint32(end,true),0x06054b50);let offset=dv.getUint32(end+16,true);for(let n=0;n<dv.getUint16(end+10,true);n++){assert.equal(dv.getUint16(offset+14,true),33);const local=dv.getUint32(offset+42,true);assert.equal(dv.getUint16(local+12,true),33);offset+=46+dv.getUint16(offset+28,true)+dv.getUint16(offset+30,true)+dv.getUint16(offset+32,true);}const wb=c.XLSX.read(saved,{type:'array'});assert.deepEqual(Array.from(wb.SheetNames),Array.from(staff,e=>e.id));
  for(let i=0;i<plan.length;i++){assert(JSON.stringify(plan[i].rows).includes(staff[i].name));assert(JSON.stringify(plan[i].rows).includes(staff[i].id));if(format==='schedule')assert.equal(wb.Sheets[wb.SheetNames[i]].C6.v,staff[i].totals.total/60);}
  const zip=c.XLSX.CFB.read(saved,{type:'buffer'});for(const part of zip.FileIndex.filter(p=>p.type===2))if(part.mt){assert(part.mt.getMonth()>=0);assert.equal(part.mt.getFullYear(),1980);assert.equal(part.mt.getDate(),1);}
  fs.writeFileSync(path.join(dir,[mode,format,custom?'range':'month'].join('-')+'.xlsx'),saved);fs.writeFileSync(path.join(dir,[mode,format,custom?'range':'month'].join('-')+'.expected.json'),JSON.stringify(plan.map(p=>({name:p.name,rows:p.rows.map(r=>Array.from({length:p.widths.length},(_,i)=>r.values[i]??''))}))));
  assert.equal(R.exportFilename(r),custom?'HKP30_Duty_2026-11-05_to_2026-11-07.xlsx':'HKP30_Duty_November-2026.xlsx');
 }
 console.log('Saved real Blob fixtures:',dir);
});
test('sheet identifiers sanitize invalid/missing/duplicate values deterministically and retain identity',()=>{
 const r=R.project(M.demoMonth('2026-11'),'2026-11',true,'SYNTH');const staff=r.staff.slice(0,4);staff[0].id='A/B';staff[1].id='A:B';staff[2].id='';staff[3].id='x'.repeat(60);const plan=R.exportPlan(r,staff,'schedule');assert.deepEqual(Array.from(plan,p=>p.name),['A_B','A_B_2','Unassigned_3','x'.repeat(31)]);assert(plan.every(p=>p.name.length<=31));
});
