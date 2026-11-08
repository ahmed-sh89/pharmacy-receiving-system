const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite'),ctx=vm.createContext({});vm.runInContext(fs.readFileSync('js/duty-model.js','utf8'),ctx);const M=ctx.DutyModel;
const pid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('Exchange existing RPC: bidirectional batch, destination projection, manual allocation, CAS rollback, overlap rollback, identity, permissions, durable Undo/Redo',async()=>{
 const db=new PGlite();try{
 const original=fs.readFileSync('tests/duty-presets-database.test.cjs','utf8');const fixture=original.split('await db.exec(`')[1].split('`);')[0].replaceAll('${pid}',pid).replaceAll('${other}',other).replaceAll('${user}',user);await db.exec(fixture);
 const manifest=JSON.parse(fs.readFileSync('docs/duty/RELEASE_MANIFEST.json','utf8'));for(const m of manifest.duty_migration_inventory)await db.exec(fs.readFileSync('supabase/migrations/'+m.file,'utf8'));
 const q=(sql,args=[])=>db.query(sql,args),read=async()=> (await q('select get_pharmflow_duty_schedule_v1($1,$2) d',[pid,'2026-11-01'])).rows[0].d;
 await q("update pharmflow_pharmacy_permissions_v1 set duty='FULL' where pharmacy_id=$1",[pid]);
 for(const code of ['A','B'])await q("select save_pharmflow_duty_employee_v3($1,$2,$2,$2,'pharmacist',true,480,0,'')",[pid,code]);
 const save=async(changes,reason='Exchange Duty shifts',target=pid)=>(await q('select save_pharmflow_duty_schedule_v2($1,$2,$3,$4) d',[target,'2026-11-01',JSON.stringify(changes),reason])).rows[0].d;
 const c=(code,day,payload,rev=0)=>({code,date:'2026-11-'+String(day).padStart(2,'0'),payload,expected_revision:rev});
 const day=M.parse('9 AM–6 PM'),split=M.parse('9 AM–1 PM / 5 PM–10 PM',{note:'Real user note'}),night=M.parse('7 PM–4 AM'),manual=M.parse('1 PM–10 PM',{manual_minutes:{basic:480,normal_ot:60,friday_ot:0,holiday_ot:0}});
 await save([c('A',1,day),c('B',1,split),c('A',5,night),c('B',6,manual),c('A',10,M.normalize({status:'OFF'})),c('B',15,M.normalize({status:'ANNUAL_LEAVE'}))],'Synthetic seed');
 const swap=async(a,b)=>{const d=await read(),row=c=>d.entries.find(e=>e.code===c.code&&e.date===c.date);return save(a.flatMap((v,i)=>[{...v,payload:row(b[i])?.payload||M.normalize(),expected_revision:row(v)?.revision||0},{...b[i],payload:row(v)?.payload||M.normalize(),expected_revision:row(b[i])?.revision||0}]));};
 let d=await swap([c('A',1)],[c('B',1)]);assert.equal(d.entries.find(e=>e.code==='A'&&e.date.endsWith('-01')).payload.note,'Real user note');assert.equal(d.entries.find(e=>e.code==='B'&&e.date.endsWith('-01')).payload.periods.length,1);assert.equal(d.entries.find(e=>e.code==='A').identity.name,'A');
 await q("select set_pharmflow_duty_holiday_v1($1,'2026-11-06',true,0)",[pid]);
 d=await swap([c('A',5)],[c('B',6)]);const holiday=d.entries.find(e=>e.code==='B'&&e.date.endsWith('-06'));assert.equal(holiday.minutes.holiday_ot,540);assert.equal(holiday.minutes.friday_ot,0);assert.deepEqual(d.entries.find(e=>e.code==='A'&&e.date.endsWith('-05')).payload.manual_minutes,JSON.parse(JSON.stringify(manual.manual_minutes)));
 d=await swap([c('A',10)],[c('B',15)]);assert.equal(d.entries.find(e=>e.code==='A'&&e.date.endsWith('-10')).payload.status,'ANNUAL_LEAVE');
 d=await swap([c('A',20)],[c('B',15)]);assert.equal(d.entries.find(e=>e.code==='A'&&e.date.endsWith('-20')).payload.status,'OFF');assert.equal(d.entries.find(e=>e.code==='B'&&e.date.endsWith('-15')).payload.status,'EMPTY');
 // Five cells in each direction persist in a single call; no one-sided state.
 const left=[21,22,23,24,25].map(n=>c('A',n)),right=[21,22,23,24,25].map(n=>c('B',n));
 await save(left.map(v=>({...v,payload:split})),'Synthetic seed');d=await swap(left,right);assert(right.every(v=>d.entries.find(e=>e.code===v.code&&e.date===v.date).payload.periods.length===2));
 const snapshot=async()=>JSON.stringify((await q('select code,date,payload,revision,identity from pharmflow_duty_entries_v1 order by code,date')).rows),audits=async()=>(await q('select count(*)::int n from pharmflow_duty_audit_v1')).rows[0].n;
 let before=await snapshot(),count=await audits();
 // First side is valid; stale second side must roll back first side AND its audit.
 await assert.rejects(save([c('A',21,day,2),c('B',21,day,0)]),/DUTY_CONFLICT/);assert.equal(await snapshot(),before);assert.equal(await audits(),count);
 // Validation at the final batch state rejects overnight collision and rolls everything back.
 await assert.rejects(save([c('A',21,day,2),c('B',21,M.parse('7 PM–10 AM'),1)]),/overlaps/);assert.equal(await snapshot(),before);assert.equal(await audits(),count);
 // Two clients read the same revisions: winner commits, stale loser cannot overwrite either side.
 const winner=[c('A',21,day,2),c('B',21,split,1)],loser=structuredClone(winner);await save(winner);before=await snapshot();await assert.rejects(save(loser),/DUTY_CONFLICT/);assert.equal(await snapshot(),before);
 const undo=[c('A',21,M.normalize(),3),c('B',21,split,2)];await save(undo,'Undo schedule edit');await save(winner.map(v=>({...v,expected_revision:v.expected_revision+2})),'Redo schedule edit');assert.equal((await read()).entries.find(e=>e.code==='A'&&e.date.endsWith('-21')).payload.periods.length,1);
 await assert.rejects(save([c('A',1,day,2)],'Exchange Duty shifts',other),/access required/);
 await db.exec("set test.valid='no'");await assert.rejects(save([c('A',1,day,2)]),/access required/);await db.exec("set test.valid='yes'");
 await q("update pharmacy_members set role='staff' where pharmacy_id=$1",[pid]);await assert.rejects(save([c('A',1,day,2)]),/administrator access/);
 }finally{await db.close();}
});
