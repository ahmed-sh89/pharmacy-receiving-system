const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('supabase/migrations/20261024001414_staging_owner_set_pharmacy_status_compatibility.sql','utf8');
test('status RPC preserves Owner authorization, validation, target scope and existing transition semantics in isolated SQL',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE TABLE public.system_owners(user_id uuid PRIMARY KEY);
   CREATE TABLE public.pharmacies(id uuid PRIMARY KEY,status text,active boolean,updated_at timestamptz);
   CREATE FUNCTION public.is_system_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM public.system_owners WHERE user_id=auth.uid())$$;
   INSERT INTO public.system_owners VALUES('00000000-0000-0000-0000-000000000001');
   INSERT INTO public.pharmacies VALUES('00000000-0000-0000-0000-000000000010','active',true,'2026-01-01T00:00:00Z'),('00000000-0000-0000-0000-000000000020','active',true,'2026-01-01T00:00:00Z');`);
  await db.exec(migration);
  const grants=(await db.query(`SELECT has_function_privilege('anon','public.owner_set_pharmacy_status(uuid,text)','EXECUTE') AS anonymous,has_function_privilege('authenticated','public.owner_set_pharmacy_status(uuid,text)','EXECUTE') AS authenticated`)).rows[0];
  assert.equal(grants.anonymous,false);assert.equal(grants.authenticated,true);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query(`SELECT public.owner_set_pharmacy_status('00000000-0000-0000-0000-000000000010','suspended')`),/System Owner access required/);
  await db.query(`SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)`);
  await assert.rejects(db.query(`SELECT public.owner_set_pharmacy_status('00000000-0000-0000-0000-000000000010','suspended')`),/System Owner access required/);
  await db.query(`SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)`);
  await assert.rejects(db.query(`SELECT public.owner_set_pharmacy_status('00000000-0000-0000-0000-000000000010','pending')`),/Invalid pharmacy status/);
  await assert.rejects(db.query(`SELECT public.owner_set_pharmacy_status('00000000-0000-0000-0000-000000000099','active')`),/Pharmacy not found/);
  await db.query(`SELECT public.owner_set_pharmacy_status('00000000-0000-0000-0000-000000000010','suspended')`);
  await db.exec('RESET ROLE');
  let rows=(await db.query('SELECT * FROM public.pharmacies ORDER BY id')).rows;
  assert.equal(rows[0].status,'suspended');assert.equal(rows[0].active,false);assert.equal(rows[1].status,'active');assert.equal(rows[1].active,true);assert.equal(rows[1].updated_at.toISOString(),'2026-01-01T00:00:00.000Z');
  await db.query(`SELECT public.owner_set_pharmacy_status('00000000-0000-0000-0000-000000000010','active')`);
  rows=(await db.query('SELECT * FROM public.pharmacies ORDER BY id')).rows;assert.equal(rows[0].status,'active');assert.equal(rows[0].active,true);
 }finally{await db.close();}
});
