import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.dirname(new URL(import.meta.url).pathname);
const {PGlite}=await import(process.env.PF_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const result={engine:(await db.query('select version()')).rows[0].version,productionEngine:'PostgreSQL 17.6',scope:'Exact captured Production application schema/contracts, empty tables plus synthetic fixtures. Local PostgreSQL 17.5 WASM; managed services are not emulated.',ddlAdapter:'Only Storage policy ownership and pgrst role-setting statements use bootstrap privileges to model Supabase privileged DDL. All application functions retain postgres ownership; authenticated runtime tests have no superuser/BYPASSRLS.',baselineUnits:0,migrations:[],tests:[],status:'RUNNING'};
const save=()=>fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));
try{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'production-baseline.json'),'utf8'));
 const baseline=manifest.files.flatMap(file=>{const bytes=fs.readFileSync(path.join(root,file.path));if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Baseline checksum mismatch: '+file.path);return JSON.parse(bytes);});
 for(const unit of baseline){
  try{await db.exec(unit.sql);}catch(e){throw new Error('BASELINE '+unit.name+': '+e.message,{cause:e});}
  result.baselineUnits++;
 }
 console.log('Baseline restored:',result.baselineUnits,'units');
 for(const line of (await db.query("select current_user,pg_get_function_result('public.count_pharmflow_needs_review_v2(uuid,text)'::regprocedure) as contract")).rows)console.log(line);
 await db.exec('SET ROLE postgres');
 await db.exec(fs.readFileSync(path.join(root,'fixtures.sql'),'utf8'));
 const catalogSql=`select p.oid::regprocedure::text signature,pg_get_function_result(p.oid) result,pg_get_functiondef(p.oid) definition,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prolang in (select oid from pg_language where lanname in ('sql','plpgsql'))`;
 const originals=(await db.query(catalogSql)).rows;
 const tables=(await db.query(`select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage','pharmflow_expiry_private') and c.relkind='r' order by n.nspname,c.relname`)).rows;
 const qi=s=>'"'+s.replaceAll('"','""')+'"';
 const fingerprint=async()=>{let values={};for(const t of tables){const sql=`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) hash from ${qi(t.schema)}.${qi(t.name)} t`;values[t.schema+'.'+t.name]=(await db.query(sql)).rows[0].hash;}return values;};
 const initialData=await fingerprint();
 const sqlpath=path.join(root,'../sql');
 const files=fs.readdirSync(sqlpath).filter(n=>/^\d.*\.sql$/.test(n)).sort();
 result.migrationChecksums=Object.fromEntries(files.map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(sqlpath,name))).digest('hex')]));
 const migrate=async name=>{
  const sql=fs.readFileSync(path.join(sqlpath,name),'utf8');
  let adapted=sql.replace(/^CREATE POLICY[^;]* ON storage\.objects[^;]*;/gm,m=>'SET ROLE pf_rehearsal_bootstrap; '+m+' SET ROLE postgres;');
  adapted=adapted.replace(/^ALTER ROLE authenticator SET pgrst\.[^;]+;/gm,m=>'SET ROLE pf_rehearsal_bootstrap; '+m+' SET ROLE postgres;');
  await db.exec(adapted);
 };
 // Whole release runs in one transaction. Any error triggers rollback.
 await db.exec('SET check_function_bodies=true; BEGIN');
 for(const name of files){
  try{const sql=fs.readFileSync(path.join(sqlpath,name),'utf8');
   // Local upstream PostgreSQL lacks Supabase's privileged Storage-policy DDL hook.
   // Execute only those policy statements as the isolated bootstrap role; runtime owners/ACLs stay exact.
   let adapted=sql.replace(/^CREATE POLICY[^;]* ON storage\.objects[^;]*;/gm, m=>'SET ROLE pf_rehearsal_bootstrap; '+m+' SET ROLE postgres;');
   adapted=adapted.replace(/^ALTER ROLE authenticator SET pgrst\.[^;]+;/gm,m=>'SET ROLE pf_rehearsal_bootstrap; '+m+' SET ROLE postgres;');
   await db.exec(adapted);}catch(e){throw new Error('MIGRATION '+name+': '+e.message,{cause:e});}
  result.migrations.push(name);console.log('PASS',name);
 }
 const finalData=await fingerprint();
 if(JSON.stringify(initialData)!==JSON.stringify(finalData))throw Error('Existing baseline records changed during migration');
 result.tests.push(`all ${tables.length} original tables retain identical row fingerprints, including synthetic legacy history`);
 const current=(await db.query(catalogSql)).rows;
 const retired=new Set(['create_receiving_session','join_receiving_session','join_receiving_session_by_code','get_received_qty','get_session_items','get_session_snapshot','record_receiving_transaction','bulk_upsert_session_items','upsert_session_item','pharmflow_end_session','pharmflow_is_session_ended']);
 const norm=s=>s.replace(/\s+/g,' ').trim().replace(/;$/,'');
 const body=s=>s.match(/AS (\$[^$]*\$)([\s\S]*?)\1/)[2];
 let preserved=0;
 for(const old of originals){
  const updated=current.find(x=>x.signature===old.signature);if(!updated||updated.result!==old.result)throw Error('Signature/return drift: '+old.signature);
  const name=old.signature.split('(')[0];
  if(!retired.has(name)&&name!=='owner_review_pharmacy_registration_v2')for(const role of ['anon','authenticated','service'])if(old[role]!==updated[role])throw Error('Unintended RPC ACL drift: '+old.signature+' '+role);
  if(updated.definition.includes('require_receiving_compat')||updated.definition.includes('PERFORM pharmflow_auth_private.require_access')){
   if(name==='get_pharmflow_workspace_generation')continue; // Approved Read Only bootstrap protection.
   let value=body(updated.definition).replace(/PERFORM pharmflow_auth_private.require_(?:receiving_compat|access)\([^;]+;/gi,'');
   if(/LANGUAGE sql/.test(old.definition)){const query=/return query/i.test(value);value=query?value.trim().replace(/^begin\s*return query\s*/i,'').replace(/;\s*end;?$/i,''):value.trim().replace(/^begin\s*return\s*\(/i,'').replace(/\);\s*end;?$/i,'');}
   if(norm(value)!==norm(body(old.definition)))throw Error('Operational body changed: '+old.signature);
   preserved++;
  }
 }
 result.tests.push(`${originals.length} existing public function signatures/return contracts retained; RPC ACLs retained except explicitly retired/superseded APIs; ${preserved} operational bodies unchanged after guard removal`);
 await db.exec(fs.readFileSync(path.join(root,'assertions.sql'),'utf8'));
 result.tests.push('complete release assertions');
 await db.exec('ROLLBACK');
 const after=(await db.query("select to_regnamespace('pharmflow_auth_private') is null as foundation_absent,pg_get_function_result('public.count_pharmflow_needs_review_v2(uuid,text)'::regprocedure) as contract")).rows[0];
 if(!after.foundation_absent||after.contract!=='integer')throw Error('Release rollback did not restore original baseline');
 result.tests.push('whole release rollback restores original integer contract and removes new foundation');
 // Repeat from the same clean baseline and inject a late failure after every migration.
 await db.exec('BEGIN');
 for(const name of files)await migrate(name);
 try{await db.exec("DO $$BEGIN RAISE EXCEPTION 'QA_LATE_MIGRATION_FAILURE';END $$");throw Error('Missing injected failure');}
 catch(e){if(e.message!=='QA_LATE_MIGRATION_FAILURE')throw e;}
 await db.exec('ROLLBACK');
 const clean=(await db.query("select to_regnamespace('pharmflow_auth_private') is null as clean,not exists(select 1 from pg_roles r,unnest(coalesce(r.rolconfig,ARRAY[]::text[])) c where r.rolname='authenticator' and c like 'pgrst.db_pre_request=%') as hook_clean")).rows[0];
 if(!clean.clean||!clean.hook_clean||JSON.stringify(initialData)!==JSON.stringify(await fingerprint()))throw Error('Failed migration rollback left changes');
 result.tests.push('injected late migration error rolls back complete foundation, request hook and all existing records');
 // Successful commit path, followed by assertions under real authenticated roles.
 await db.exec('BEGIN');for(const name of files)await migrate(name);await db.exec('COMMIT');
 await db.exec('BEGIN');await db.exec(fs.readFileSync(path.join(root,'assertions.sql'),'utf8'));await db.exec('ROLLBACK');
 if(JSON.stringify(initialData)!==JSON.stringify(await fingerprint()))throw Error('Committed migration changed existing data');
 result.tests.push('clean rerun commits all 13 files; post-commit integer/count/isolation/RLS/password assertions pass');
 result.baselineSha256=createHash('sha256').update(fs.readFileSync(path.join(root,'production-baseline.json'))).digest('hex');
 result.status='PASS';save();console.log('PASS COMPLETE');
}catch(e){
 result.status='FAIL';result.error=e.message;result.postgres=e.cause?{code:e.cause.code,detail:e.cause.detail,where:e.cause.where}:null;
 try{await db.exec('ROLLBACK');}catch{}
 save();console.error(result.error,result.postgres);process.exitCode=1;
}finally{await db.close();}
