const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite'),ctx=vm.createContext({});vm.runInContext(fs.readFileSync('js/duty-model.js','utf8'),ctx);const M=ctx.DutyModel;
const pid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('Exchange through existing atomic RPC: two-sided durability, rules, stale-client conflicts, rollback, permissions and isolation',async()=>{
 const db=new PGlite();try{
 const original=fs.readFileSync('tests/duty-presets-database.test.cjs','utf8');const fixture=original.split('await db.exec(`')[1].split('`);')[0].replaceAll('${pid}',pid).replaceAll('${other}',other).replaceAll('${user}',user);await db.exec(fixture);
 const manifest=JSON.parse(fs.readFileSync('docs/duty/RELEASE_MANIFEST.json','utf8'));
 for(const m of manifest.duty_migration_inventory)await db.exec(fs.readFileSync('supabase/migrations/'+m.file,'utf8'));
 const q=(sql,args=[])=>db.query(sql,args),read=async()=> (await q('select get_pharmflow_duty_schedule_v1($1,$2) d',[pid,'2026-11-01'])).rows[0].d;
 await q("update pharmflow_pharmacy_permissions_v1 set duty='FULL' where pharmacy_id=$1",[pid]);
 for(const code of ['A','B'])await q("select save_pharmflow_duty_employee_v3($1,$2,$2,$2,'pharmacist',true,480,0,'')",[pid,code]);
 const save=(changes,target=pid)=>q('select save_pharmflow_duty_schedule_v2($1,$2,$3,$4) d',[target,'2026-11-01',JSON.stringify(changes),'Exchange Duty shifts']);
 const row=(code,date,payload,revision=0)=>({code,date,payload,expected_revision:revision});
 const working=M.parse('7 PM–5 AM'),split=M.parse('9 AM–1 PM / 5 PM–10 PM'),manual=M.normalize({...split,note:'Explicit manual',manual_minutes:{basic:123,normal_ot:77}});
 await save([row('A','2026-11-05',working),row('B','2026-11-06',M.normalize({status:'OFF'})),row('A','2026-11-12',split),row('B','2026-11-13',manual)]);
 await q("select set_pharmflow_duty_holiday_v1($1,'2026-11-13',true,0)",[pid]);
 let d=await read();const initial=structuredClone(d.entries);
 const exchange=(a,b)=>{const x=d.entries.find(e=>e.code===a[0]&&e.date===a[1]),y=d.entries.find(e=>e.code===b[0]&&e.date===b[1]);return [row(...a,y?.payload||M.normalize(),x?.revision||0),row(...b,x?.payload||M.normalize(),y?.revision||0)];};
 const changes=[...exchange(['A','2026-11-05'],['B','2026-11-06']),...exchange(['A','2026-11-12'],['B','2026-11-13'])];
 d=(await save(changes)).rows[0].d;
 assert.equal(d.entries.find(e=>e.code==='B'&&e.date==='2026-11-06').minutes.friday_ot,600);
 assert.equal(d.entries.find(e=>e.code==='B'&&e.date==='2026-11-13').minutes.holiday_ot,540);
 const moved=d.entries.find(e=>e.code==='A'&&e.date==='2026-11-12');assert.deepEqual(moved.payload.manual_minutes,{basic:123,normal_ot:77});assert.equal(moved.payload.note,'Explicit manual');
 assert.equal(moved.minutes.basic,123);assert.equal(moved.identity.name,'A');
 assert.deepEqual((await read()).entries,d.entries,'fresh read must show the complete exchange');
 const snapshot=async()=>JSON.stringify((await q('select (select jsonb_agg(e order by code,date) from pharmflow_duty_entries_v1 e) entries,(select count(*) from pharmflow_duty_audit_v1) audits,(select count(*) from pharmflow_duty_months_v1) months')).rows);
 const before=await snapshot();
 // First side would write successfully, second side conflicts: all writes and audits roll back.
 await assert.rejects(save([row('A','2026-11-20',working),row('B','2026-11-06',split,0)]),/DUTY_CONFLICT/);assert.equal(await snapshot(),before);
 // Two clients based on the same revisions: only the first succeeds.
 await assert.rejects(save(changes),/DUTY_CONFLICT/);assert.equal(await snapshot(),before);
 // Undo/Redo use current destination revisions and one batch, never overwrite a newer revision.
 const undo=initial.map(e=>row(e.code,e.date,e.payload,d.entries.find(x=>x.code===e.code&&x.date===e.date).revision));d=(await save(undo)).rows[0].d;
 assert.deepEqual(d.entries.map(e=>e.payload),initial.map(e=>e.payload));
 d=(await save(changes.map(c=>({...c,expected_revision:d.entries.find(e=>e.code===c.code&&e.date===c.date).revision})))).rows[0].d;
 await assert.rejects(save(undo),/DUTY_CONFLICT/);
 const preOverlap=await snapshot();await assert.rejects(save([row('A','2026-11-20',working),row('A','2026-11-21',M.parse('4 AM–9 AM'))]),/overlap/);assert.equal(await snapshot(),preOverlap);
 await assert.rejects(save([row('A','2026-11-20',working)],other),/access required/);
 await q("update pharmflow_pharmacy_permissions_v1 set duty='DISABLED' where pharmacy_id=$1",[pid]);await assert.rejects(save([row('A','2026-11-20',working)]),/access required/);
 await q("update pharmflow_pharmacy_permissions_v1 set duty='FULL' where pharmacy_id=$1",[pid]);await db.exec("set test.valid='no'");await assert.rejects(save([row('A','2026-11-20',working)]),/access required/);await db.exec("set test.valid='yes'");
 // Working/leave/empty content is validated by the same server contract.
 d=(await save([row('A','2026-11-25',M.normalize({status:'ANNUAL_LEAVE',note:'Leave note'})),row('B','2026-11-25',M.normalize())])).rows[0].d;
 d=(await save(exchange(['A','2026-11-25'],['B','2026-11-25']))).rows[0].d;assert.equal(d.entries.find(e=>e.code==='B'&&e.date==='2026-11-25').payload.status,'ANNUAL_LEAVE');
 }finally{await db.close();}
});
