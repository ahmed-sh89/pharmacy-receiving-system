const assert=require('node:assert/strict'),fs=require('node:fs');
const {Client}=require('pg');
const {load}=require('./checksums.cjs');
const pid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.PGHOST!=='127.0.0.1'||process.env.PGUSER!=='postgres')throw Error('Only isolated Actions localhost service is permitted');
const migrations=load();
const result={engine:'native PostgreSQL 16 service',checksums:migrations.map(({file,sha256})=>({file,sha256})),scenarios:[]};
async function connect(database){const c=new Client({database,connectionTimeoutMillis:5000});await c.connect();await c.query("set statement_timeout='750ms'");return c;}
async function catalog(b){return (await b.query(`select
 (select count(*)::int from pg_class where relnamespace='public'::regnamespace and relname like '%duty%') objects,
 (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname like '%duty%') rpcs,
 (select count(*)::int from pg_attribute where attrelid='public.pharmflow_pharmacy_permissions_v1'::regclass and attname='duty' and not attisdropped) duty_columns,
 (select count(*)::int from supabase_migrations.schema_migrations) history`)).rows[0];}
async function baseline(b){return (await b.query(`select jsonb_build_object(
 'permissions',(select jsonb_agg(to_jsonb(p)-'duty' order by pharmacy_id) from pharmflow_pharmacy_permissions_v1 p),
 'receiving',(select jsonb_agg(r order by pharmacy_id) from receiving_synthetic r),
 'expiry',(select jsonb_agg(r order by pharmacy_id) from expiry_synthetic r),
 'policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where tablename not like 'pharmflow_duty_%'),
 'grants',(select jsonb_agg(jsonb_build_array(relname,relacl,relrowsecurity) order by relname) from pg_class where relnamespace='public'::regnamespace and relname in ('receiving_synthetic','expiry_synthetic','pharmflow_pharmacy_permissions_v1','pharmflow_permission_audit_v1'))
 ) data`)).rows[0].data;}
async function rejected(b,sql,args,codes){try{await b.query(sql,args);assert.fail('Unexpected usable Duty object');}catch(e){assert.ok(codes.includes(e.code),`Unexpected ${e.code}: ${e.message}`);return e.code;}}
async function observe(b,boundary){await b.query('reset role');assert.deepEqual(await catalog(b),{objects:0,rpcs:0,duty_columns:0,history:1});
 const checks=[];
 for(const role of ['anon','authenticated']){await b.query('set role '+role);await b.query("select set_config('test.uid',$1,false)",[uid]);
 checks.push({role,rpc:await rejected(b,'select public.get_pharmflow_duty_foundation_v1($1::uuid,$2::date)',[pid,'2026-11-01'],['42883']),table:await rejected(b,'select * from public.pharmflow_duty_employees_v1',[],['42P01'])});}
 await b.query('reset role');
 // ALTER TABLE may block row reads; timeout is denial of intermediate access, not success.
 const permissionRead=await rejected(b,'select duty from public.pharmflow_pharmacy_permissions_v1',[],['42703','57014']);
 return {boundary,catalog:'baseline only',checks,permissionRead};}
async function isolation(b){await b.query('set role authenticated');await b.query("select set_config('test.uid',$1,false)",[uid]);assert.deepEqual((await b.query('select quantity from receiving_synthetic')).rows,[{quantity:17}]);assert.deepEqual((await b.query('select quantity from expiry_synthetic')).rows,[{quantity:23}]);await b.query("select set_config('test.uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false)");assert.equal((await b.query('select * from receiving_synthetic')).rows.length,0);assert.equal((await b.query('select * from expiry_synthetic')).rows.length,0);await b.query('reset role');}
(async()=>{
 for(const failAfter of [null,3,6,7]){
 const name='duty_atomic_'+(failAfter===null?'commit':'rollback_'+failAfter);
 let control=await connect('postgres');await control.query('create database '+name);await control.end();
 let a=await connect(name),b=await connect(name);
 const s={name,failAfter,boundaries:[]};try{
 let fixture=fs.readFileSync('atomic-actions/fixture.sql','utf8');if(failAfter!==null)fixture=fixture.replace('create role anon;create role authenticated;','');await a.query(fixture);await isolation(b);const before=await baseline(b);
 const apid=(await a.query('select pg_backend_pid() pid')).rows[0].pid,bpid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;assert.notEqual(apid,bpid);s.backends={a:apid,b:bpid};
 await a.query('begin');await a.query("set local statement_timeout='10s'");
 let injected=false;
 for(let i=0;i<migrations.length;i++){
 const m=migrations[i];await a.query(m.sql);await a.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[m.version,m.name,[m.sql]]);
 s.boundaries.push(await observe(b,i+1));
 if(failAfter===i+1){await assert.rejects(a.query('select 1/0'),e=>e.code==='22012');injected=true;break;}
 }
 if(failAfter!==null){assert.ok(injected);await a.query('rollback');assert.deepEqual(await catalog(b),{objects:0,rpcs:0,duty_columns:0,history:1});assert.deepEqual(await baseline(b),before);await isolation(b);s.rollback='PASS';}
 else{
 await a.query('commit');const c=await catalog(b);assert.ok(c.objects>=7);assert.ok(c.rpcs>=10);assert.equal(c.duty_columns,1);assert.equal(c.history,8);
 assert.deepEqual(await baseline(b),before);
 const rows=(await b.query("select version,name,statements from supabase_migrations.schema_migrations where version like '202611%' order by version")).rows;
 assert.deepEqual(rows,migrations.map(m=>({version:m.version,name:m.name,statements:[m.sql]})));
 assert.equal((await b.query("select count(*)::int n from pharmflow_pharmacy_permissions_v1 where duty='DISABLED'")).rows[0].n,2);
 await a.query("insert into pharmacies(id) values('33333333-3333-4333-8333-333333333333')");assert.equal((await b.query("select duty from pharmflow_pharmacy_permissions_v1 where pharmacy_id='33333333-3333-4333-8333-333333333333'")).rows[0].duty,'DISABLED');
 for(const owner of ['no','yes']){await b.query('set role authenticated');await b.query("select set_config('test.uid',$1,false),set_config('test.owner',$2,false)",[uid,owner]);for(const target of [pid,other])await rejected(b,'select get_pharmflow_duty_schedule_v1($1::uuid,$2::date)',[target,'2026-11-01'],['42501']);await b.query('reset role');}
 const tables=(await b.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'pharmflow_duty_%'")).rows;assert.equal(tables.length,7);assert.ok(tables.every(t=>t.relrowsecurity));
 for(const role of ['anon','authenticated'])for(const t of tables)assert.equal((await b.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') p",[role,t.relname])).rows[0].p,false);
 assert.equal((await b.query("select has_function_privilege('anon','get_pharmflow_duty_schedule_v1(uuid,date)','EXECUTE') p")).rows[0].p,false);
 assert.equal((await b.query("select has_function_privilege('authenticated','manage_pharmflow_duty_directory_v1(uuid,text,text,jsonb)','EXECUTE') p")).rows[0].p,false);
 await isolation(b);s.commit='PASS';s.defaultDisabled='PASS';s.history='PASS';s.rlsGrants='PASS';
 }
 s.permissionIsolation='PASS';result.scenarios.push(s);console.log(JSON.stringify(s));
 }finally{await a.end();await b.end();}
 }
 result.verdict='PASS';fs.mkdirSync('atomic-results',{recursive:true});fs.writeFileSync('atomic-results/evidence.json',JSON.stringify(result,null,2));console.log('TWO-CONNECTION ATOMIC COMMIT / ROLLBACK / ISOLATION: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
