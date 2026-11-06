const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite'),ctx=vm.createContext({});vm.runInContext(fs.readFileSync('js/duty-model.js','utf8'),ctx);const M=ctx.DutyModel;
const pid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const manifest=JSON.parse(fs.readFileSync('docs/duty/RELEASE_MANIFEST.json','utf8'));
const newFile=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_duty_position_presets_staging.sql'));
test('position presets database: legacy preservation, custom/scoped IDs, all-or-nothing eligibility, CAS, durable projection and atomic migration rollback',async()=>{
 const db=new PGlite();try{
 const original=fs.readFileSync('tests/duty-presets-database.test.cjs','utf8');const fixture=original.split('await db.exec(`')[1].split('`);')[0].replaceAll('${pid}',pid).replaceAll('${other}',other).replaceAll('${user}',user);await db.exec(fixture);
 await db.exec('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[],created_by text,idempotency_key text unique,rollback text[])');
 for(const m of manifest.duty_migration_inventory.filter(m=>!m.file.endsWith('_duty_position_presets_staging.sql'))){const sql=fs.readFileSync('supabase/migrations/'+m.file,'utf8');assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),m.sha256);await db.exec(sql);await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[m.file.slice(0,14),m.file.slice(15,-4),[sql]]);}
 const q=(sql,args=[])=>db.query(sql,args),read=async()=> (await q('select get_pharmflow_duty_schedule_v1($1,$2) d',[pid,'2026-11-01'])).rows[0].d;
 await q("update pharmflow_pharmacy_permissions_v1 set duty='FULL' where pharmacy_id=$1",[pid]);
 for(const [code,position] of [['A','pharmacist'],['B','labor']])await q("select save_pharmflow_duty_employee_v3($1,$2,$2,$2,$3,true,540,0,'')",[pid,code,position]);
 await q("insert into pharmflow_duty_positions_v1(pharmacy_id,key,label) values($1,'foreign-custom','Other pharmacy custom'),($2,'local-custom','Local custom')",[other,pid]);
 const legacy={id:'legacy',name:'Legacy overnight',periods:[{start:1140,end:1740}]};
 await q('select save_pharmflow_duty_presets_v1($1,$2,0)',[pid,JSON.stringify([legacy])]);
 const before=await read(),migration=fs.readFileSync('supabase/migrations/'+newFile,'utf8');const beforeFn=(await q("select pg_get_functiondef('save_pharmflow_duty_presets_v1(uuid,jsonb,bigint)'::regprocedure) d")).rows[0].d;
 // Only the new migration is pending on the existing seven-migration release baseline.
 await db.exec('begin');await db.exec(migration);await q('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[newFile.slice(0,14),newFile.slice(15,-4),[migration]]);await assert.rejects(db.exec('select 1/0'));await db.exec('rollback');assert.equal((await q("select to_regprocedure('apply_pharmflow_duty_preset_v1(uuid,date,text,bigint,jsonb,text)') r")).rows[0].r,null);assert.equal((await q("select pg_get_functiondef('save_pharmflow_duty_presets_v1(uuid,jsonb,bigint)'::regprocedure) d")).rows[0].d,beforeFn);assert.equal((await q('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,7);
 await db.exec('begin');await db.exec(migration);await q('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[newFile.slice(0,14),newFile.slice(15,-4),[migration]]);await db.exec('commit');assert.deepEqual((await read()).shift_presets,before.shift_presets);
 const presets=[legacy,{id:'pharm',name:'Pharmacist day',positions:['pharmacist'],periods:[{start:540,end:1080}]},{id:'both',name:'Shared split',positions:['pharmacist','labor'],periods:[{start:540,end:780},{start:1020,end:1320}]},{id:'custom',name:'Custom',positions:['local-custom'],periods:[{start:540,end:1080}]}];
 await q('select save_pharmflow_duty_presets_v1($1,$2,1)',[pid,JSON.stringify(presets)]);
 await assert.rejects(q('select save_pharmflow_duty_presets_v1($1,$2,2)',[pid,JSON.stringify([{...presets[1],positions:['foreign-custom']}])]),/Unknown pharmacy position/);
 await assert.rejects(q('select save_pharmflow_duty_presets_v1($1,$2,2)',[pid,JSON.stringify([{...presets[1],positions:['pharmacist','pharmacist']}])]),/Duplicate preset positions/);
 const changes=(codes,preset,date='2026-11-02')=>codes.map(code=>({code,date,expected_revision:0,payload:M.normalize({status:'WORK',periods:preset.periods,note:'Synthetic note',highlight:'mint'})}));
 const apply=(preset,rows,revision=2,target=pid)=>q('select apply_pharmflow_duty_preset_v1($1,$2,$3,$4,$5,$6) d',[target,'2026-11-01',preset,revision,JSON.stringify(rows),'Synthetic test']);
 const originalData=JSON.stringify((await read()).entries);await assert.rejects(apply('pharm',changes(['A','B'],presets[1])),/incompatible/);assert.equal(JSON.stringify((await read()).entries),originalData);
 await assert.rejects(apply('both',changes(['A','B'],presets[2]),1),/DUTY_CONFLICT/);
 await assert.rejects(apply('both',changes(['A'],presets[1])),/Preset values changed/);
 await assert.rejects(apply('both',changes(['A'],presets[2]),2,other),/access required/);
 await db.exec('set test.valid=\'no\'');await assert.rejects(apply('both',changes(['A'],presets[2])),/access required/);await db.exec('set test.valid=\'yes\'');
 await q("update pharmacy_members set role='staff' where pharmacy_id=$1",[pid]);await assert.rejects(apply('both',changes(['A'],presets[2])),/administrator access/);await q("update pharmacy_members set role='admin' where pharmacy_id=$1",[pid]);
 let saved=(await apply('both',changes(['A','B'],presets[2]))).rows[0].d;assert.equal(saved.entries.length,2);assert(saved.entries.every(e=>e.minutes.total===540&&e.payload.note==='Synthetic note'&&e.payload.highlight==='mint'));
 const conflict=changes(['A','B'],presets[2],'2026-11-03');conflict[1].date='2026-11-02';await assert.rejects(apply('both',conflict),/DUTY_CONFLICT/);assert(!(await read()).entries.some(e=>e.date==='2026-11-03'));
 await apply('legacy',changes(['B'],legacy,'2026-11-06'));saved=await read();assert.equal(saved.entries.find(e=>e.code==='B'&&e.date==='2026-11-06').minutes.friday_ot,600);
 await q("select set_pharmflow_duty_holiday_v1($1,'2026-11-13',true,0)",[pid]);await apply('legacy',changes(['A'],legacy,'2026-11-13'));assert.equal((await read()).entries.find(e=>e.date==='2026-11-13').minutes.holiday_ot,600);
 const persisted=JSON.stringify((await read()).entries);await q('select save_pharmflow_duty_presets_v1($1,$2,2)',[pid,JSON.stringify([{...presets[1],name:'Renamed'}])]);assert.equal(JSON.stringify((await read()).entries),persisted);await assert.rejects(apply('pharm',changes(['A'],presets[1],'2026-11-04'),2),/DUTY_CONFLICT/);
 // Presets now count as a real dependency when deleting a custom Position.
 await q('select save_pharmflow_duty_presets_v1($1,$2,3)',[pid,JSON.stringify([{...presets[1],positions:['local-custom']}])]);await assert.rejects(q("select manage_pharmflow_duty_directory_v2($1,'position','delete',$2)",[pid,JSON.stringify([{key:'local-custom',expected_revision:1}])]),/Historical dependencies/);
 for(const role of ['anon','authenticated'])assert.equal((await q("select has_table_privilege($1,'pharmflow_duty_settings_v1','SELECT,INSERT,UPDATE,DELETE') p",[role])).rows[0].p,false);
 assert.equal((await q("select has_function_privilege('anon','apply_pharmflow_duty_preset_v1(uuid,date,text,bigint,jsonb,text)','EXECUTE') p")).rows[0].p,false);assert.equal((await q('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,8);
 }finally{await db.close();}
});
