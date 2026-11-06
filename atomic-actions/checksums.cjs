// Offline contract: no network, connection string, deploy or Production execution.
const fs=require('node:fs'),crypto=require('node:crypto');
const files=[
['20261103235030_duty_stage_a_foundation.sql','63b407bd9f4bde20e522a5b538dc071bf15cdf978f80625e855972f562301447'],
['20261103235335_duty_position_default_name_validation.sql','c0b946ceca851ee2dce2ecd55dadf0619fdee9e09f08b20c5d89f00349976cc4'],
['20261104013200_duty_stage_b_scheduling.sql','ec7133695b21655e66a1e19e9bc252c8c6f06f892cbb0e8eb2c46037ae091bd4'],
['20261105183357_duty_production_readiness_staging.sql','8279998cdc6c7f222303faba38af45c61a1ac79f82cc989fd57f59726cb523b9'],
['20261106001033_duty_final_directory_and_save_staging.sql','bb69687131cb6a7cea8491db623bf045708f2ddefab56d925d8e5ed500e29a3f'],
['20261106010727_duty_directory_lifecycle_staging.sql','ebf5633e92f7e82185056f435a6cf2623ff60f8eef68ae3af4ffa131d70d2352'],
['20261106134244_duty_shift_presets_staging.sql','9c5f6aecc4a59439edccd90e08c4f03ec12145b7b51f2d97dc59fc2811cc4acb']];
function load(){return files.map(([file,sha256])=>{const bytes=fs.readFileSync('supabase/migrations/'+file);if(crypto.createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('Checksum mismatch: '+file);return {file,sha256,version:file.slice(0,14),name:file.slice(15,-4),sql:bytes.toString('utf8')};});}
// Test adapter uses exactly one connection. The caller supplies an isolated DB only.
async function transaction(db,{failAfter=null,inspect=async()=>{}}={}){
 const migrations=load();await db.exec('BEGIN');
 try{
  await db.exec("select pg_advisory_xact_lock(4183,61106)");
  if((await db.query("select version from supabase_migrations.schema_migrations where version = any($1::text[])",[migrations.map(m=>m.version)])).rows.length)throw Error('Existing Duty migration history: reconcile, never replay');
  if(failAfter===0)throw Error('INJECTED_BOUNDARY_0');
  for(let i=0;i<migrations.length;i++){
   const m=migrations[i];await db.exec(m.sql);
   await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[m.version,m.name,[m.sql]]);
   await inspect(i+1);
   if(failAfter===i+1)throw Error('INJECTED_BOUNDARY_'+(i+1));
  }
  const rows=(await db.query('select version,name,statements from supabase_migrations.schema_migrations where version = any($1::text[]) order by version',[migrations.map(m=>m.version)])).rows;
  if(JSON.stringify(rows)!==JSON.stringify(migrations.map(m=>({version:m.version,name:m.name,statements:[m.sql]}))))throw Error('History mismatch');
  if((await db.query("select count(*)::int n from pharmflow_pharmacy_permissions_v1 where duty is distinct from 'DISABLED'")).rows[0].n)throw Error('Duty must remain disabled');
  await db.exec('COMMIT');
 }catch(e){await db.exec('ROLLBACK');throw e;}
}
module.exports={load,transaction};
