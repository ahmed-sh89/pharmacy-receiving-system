const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const baseline=require('./fixtures/security-20261108/production-functions.json'),deps=require('./fixtures/security-20261108/authorization-dependencies.json');
const migration=fs.readFileSync('supabase/migrations/20261108123709_security_session_boundaries.sql','utf8');
const owner='e8110800-0000-4000-8000-000000000001',admin='e8110800-0000-4000-8000-000000000002',staff='e8110800-0000-4000-8000-000000000003',a='e8110800-0000-4000-8000-000000000010',b='e8110800-0000-4000-8000-000000000011';
const sid=u=>u.replace('e8110800','e8110801');
async function claims(db,u,extra={}){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:u,role:'authenticated',session_id:sid(u),exp:9999999999,...extra})]);}
async function value(db,sql){return (await db.query(sql)).rows[0].v;}
test('exact Production contracts: revoked privilege reproduction and session-bound remediation',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`
 CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA pharmflow_auth_private;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(auth.jwt()->>'sub','')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb DEFAULT '{}',raw_user_meta_data jsonb DEFAULT '{}');
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
 CREATE TABLE system_owners(user_id uuid PRIMARY KEY,created_at timestamptz DEFAULT now());
 CREATE TABLE pharmacies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE,name text,status text DEFAULT 'active',active boolean DEFAULT true,created_at timestamptz DEFAULT now(),updated_at timestamptz,approved_at timestamptz,approved_by uuid);
 CREATE TABLE pharmacy_members(pharmacy_id uuid,user_id uuid,role text,active boolean,created_at timestamptz DEFAULT now(),UNIQUE(pharmacy_id,user_id));
 CREATE TABLE profiles(user_id uuid,email text,display_name text,display_name_verified boolean);
 CREATE TABLE pharmacy_invitations(id uuid DEFAULT gen_random_uuid(),invite_token uuid DEFAULT gen_random_uuid(),pharmacy_id uuid,email text,role text,created_by uuid,expires_at timestamptz DEFAULT now()+interval '1 day',used_at timestamptz,used_by uuid);
 CREATE TABLE pharmflow_pharmacy_permissions_v1(pharmacy_id uuid,receiving text,expiry text,data_access text);
 CREATE TABLE pharmflow_global_gtin_v1(id int,item_code text,gtin text,item_name text,category text);
 INSERT INTO auth.users(id,email) VALUES ('${owner}','owner@example.invalid'),('${admin}','admin@example.invalid'),('${staff}','staff@example.invalid'),('e8110800-0000-4000-8000-000000000004','outsider@example.invalid');
 INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'e8110800','e8110801')::uuid,id FROM auth.users;
 INSERT INTO system_owners(user_id) VALUES ('${owner}');
 INSERT INTO pharmacies(id,code,name) VALUES ('${a}','SYN-A','Fictional A'),('${b}','SYN-B','Fictional B');
 INSERT INTO pharmacy_members(pharmacy_id,user_id,role,active) VALUES ('${a}','${admin}','admin',true),('${a}','${staff}','staff',true);
 INSERT INTO pharmflow_pharmacy_permissions_v1 VALUES ('${a}','FULL','FULL','READ_ONLY'),('${b}','FULL','FULL','READ_ONLY');
 INSERT INTO pharmflow_global_gtin_v1 VALUES (1,'SYNTH','000123','Synthetic item','Synthetic');
 `);
 // Install exact deployed definitions; SQL authorization helpers require dependencies first.
 await db.exec(deps.find(f=>f.proname==='password_change_complete').definition);
 for(const f of [...baseline].sort((a,b)=>(a.proname==='is_system_owner'?-1:b.proname==='is_system_owner'?1:0)))await db.exec(f.definition);
 for(const f of deps.filter(f=>f.proname!=='password_change_complete'))await db.exec(f.definition);
 await t.test('before: missing-session owner can suspend a synthetic pharmacy',async()=>{
  await claims(db,owner,{session_id:'e8110809-0000-4000-8000-000000000099'});
  await db.exec('SET ROLE authenticated');
  assert.equal(await value(db,'SELECT is_system_owner() v'),true);
  await db.query('SELECT owner_set_pharmacy_status($1,$2)',[b,'suspended']);
  await db.exec('RESET ROLE');assert.equal(await value(db,`SELECT status v FROM pharmacies WHERE id='${b}'`),'suspended');
  await db.query("UPDATE pharmacies SET status='active',active=true WHERE id=$1",[b]);
 });
 await t.test('before: unaffiliated live account can read legacy global catalog',async()=>{await claims(db,'e8110800-0000-4000-8000-000000000004');assert.equal((await db.query('SELECT * FROM get_global_master_gtin_page()')).rows.length,1);});
 await db.exec(migration);await db.exec(fs.readFileSync('supabase/migrations/20261108124636_security_live_session_request_gate.sql','utf8'));
 await t.test('after: revoked owner denied and synthetic pharmacy unchanged',async()=>{
  await db.exec('SET ROLE authenticated');
  assert.equal(await value(db,'SELECT is_system_owner() v'),false);
  assert.equal(await value(db,'SELECT medryvo_is_system_owner() v'),false);
  await assert.rejects(db.query('SELECT owner_set_pharmacy_status($1,$2)',[b,'suspended']),/Owner access required/);
  await db.exec('RESET ROLE');assert.equal(await value(db,`SELECT status v FROM pharmacies WHERE id='${b}'`),'active');
 });
 await t.test('live owner and admin retain intended access; staff cannot administer',async()=>{
  await claims(db,owner);assert.equal(await value(db,'SELECT is_system_owner() v'),true);
  await db.query('SELECT owner_set_pharmacy_status($1,$2)',[b,'active']);
  await claims(db,admin);assert.equal(await value(db,`SELECT is_pharmacy_admin('${a}') v`),true);
  assert.equal(await value(db,`SELECT is_pharmacy_admin('${b}') v`),false);
  await claims(db,staff);assert.equal(await value(db,`SELECT is_pharmacy_member('${a}') v`),true);
  assert.equal(await value(db,`SELECT is_pharmacy_admin('${a}') v`),false);
  await assert.rejects(db.query('SELECT owner_set_pharmacy_status($1,$2)',[a,'suspended']),/Owner access required/);
 });
 await t.test('every legacy membership alias rejects revoked and foreign pharmacy identities',async()=>{
  for(const fn of ['pharmflow_can_access_pharmacy','pharmflow_is_member','pharmflow_manifest_member_v2','pharmflow_receiving_member_v2']){
   await claims(db,admin);assert.equal(await value(db,`SELECT ${fn}('${a}') v`),true);assert.equal(await value(db,`SELECT ${fn}('${b}') v`),false);
   await claims(db,admin,{session_id:'e8110809-0000-4000-8000-000000000099'});assert.equal(await value(db,`SELECT ${fn}('${a}') v`),false);
  }
 });
 await t.test('mandatory password denies business permissions but live session can complete',async()=>{
  await db.query("UPDATE auth.users SET raw_app_meta_data='{\"pharmflow_must_change_password\":true}' WHERE id=$1",[owner]);
  await claims(db,owner);assert.equal(await value(db,'SELECT is_system_owner() v'),false);assert.equal(await value(db,'SELECT pharmflow_has_live_session_v1() v'),true);
  assert.equal((await db.query('SELECT * FROM get_my_app_context()')).rows.length,1);
  await db.query("select set_config('request.path','/rpc/pharmflow_has_live_session_v1',false)");await db.exec('SELECT pharmflow_password_change_request_guard()');
  for(const path of ['/rpc/owner_set_pharmacy_status','/rpc/pharmflow_has_live_session_v1/extra']){await db.query("select set_config('request.path',$1,false)",[path]);await assert.rejects(db.query('SELECT pharmflow_password_change_request_guard()'),/PASSWORD_CHANGE_REQUIRED/);}
  await db.query("select set_config('request.path','',false)");
  await db.query("UPDATE auth.users SET raw_app_meta_data='{}' WHERE id=$1",[owner]);
 });
 await t.test('expired token, missing session, mismatched user, expired session and malformed claims deny',async()=>{
  for(const extra of [{exp:1},{session_id:''},{session_id:sid(staff)},{session_id:'malformed'}]){
   await claims(db,admin,extra);assert.equal(await value(db,'SELECT pharmflow_has_live_session_v1() v'),false);
  }
  await claims(db,admin);await db.query("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE user_id=$1",[admin]);assert.equal(await value(db,'SELECT pharmflow_has_live_session_v1() v'),false);
  await db.query('UPDATE auth.sessions SET not_after=null WHERE user_id=$1',[admin]);
 });
 await t.test('inactive membership and suspended pharmacy denied by all canonical aliases',async()=>{
  await claims(db,admin);await db.query('UPDATE pharmacy_members SET active=false WHERE user_id=$1',[admin]);
  assert.equal(await value(db,`SELECT pharmflow_manifest_member_v2('${a}') v`),false);
  await db.query('UPDATE pharmacy_members SET active=true WHERE user_id=$1',[admin]);
  await db.query("UPDATE pharmacies SET status='suspended',active=false WHERE id=$1",[a]);
  assert.equal(await value(db,`SELECT is_pharmacy_admin('${a}') v`),false);await db.query("UPDATE pharmacies SET status='active',active=true WHERE id=$1",[a]);
 });
 await t.test('legacy global page requires live authorized pharmacy and preserves leading zeros',async()=>{
  await claims(db,admin);assert.equal((await db.query('SELECT * FROM get_global_master_gtin_page()')).rows[0].gtin,'000123');
  await claims(db,admin,{session_id:sid(staff)});await assert.rejects(db.query('SELECT * FROM get_global_master_gtin_page()'),/PERMISSION_DENIED/);
  await claims(db,'e8110800-0000-4000-8000-000000000004');await assert.rejects(db.query('SELECT * FROM get_global_master_gtin_page()'),/PERMISSION_DENIED/);
 });
 await t.test('anonymous cannot call new live-session RPC; authenticated can',async()=>{
  await claims(db,admin);await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT pharmflow_has_live_session_v1()'),/permission denied/);await db.exec('RESET ROLE');
  await db.exec('SET ROLE authenticated');assert.equal(await value(db,'SELECT pharmflow_has_live_session_v1() v'),true);await db.exec('RESET ROLE');
 });
 await t.test('three timestamp/status triggers retain output with hostile search path',async()=>{
  await db.exec('CREATE SCHEMA hostile; SET search_path=hostile,public; CREATE TABLE public.synthetic_touch(updated_at timestamptz,status text,active boolean); CREATE TRIGGER x BEFORE INSERT ON public.synthetic_touch FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();');
  await db.exec("INSERT INTO public.synthetic_touch(status,active) VALUES ('active',false)");
  assert.equal(await value(db,'SELECT updated_at IS NOT NULL v FROM public.synthetic_touch'),true);
  await db.exec('DROP TRIGGER x ON public.synthetic_touch;CREATE TRIGGER x BEFORE UPDATE ON public.synthetic_touch FOR EACH ROW EXECUTE FUNCTION public.update_session_timestamp();UPDATE public.synthetic_touch SET active=true');
  await db.exec("DROP TRIGGER x ON public.synthetic_touch;CREATE TRIGGER x BEFORE UPDATE ON public.synthetic_touch FOR EACH ROW EXECUTE FUNCTION public.sync_pharmacy_active_status();UPDATE public.synthetic_touch SET status='suspended'");
  assert.equal(await value(db,'SELECT active v FROM public.synthetic_touch'),false);await db.exec('SET search_path=public');
 });
 await t.test('migration stops on drift atomically',async()=>{
  await assert.rejects(db.exec('BEGIN;'+migration+'COMMIT;'),/baseline drift/);await db.exec('ROLLBACK');
  await claims(db,owner);assert.equal(await value(db,'SELECT is_system_owner() v'),true);
 });
});
