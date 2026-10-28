const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const apply=fs.readFileSync('proposals/production-security/sec007-apply.sql','utf8');
const rollback=fs.readFileSync('proposals/production-security/sec007-rollback.sql','utf8');
const oldBody=`\n SELECT EXISTS (\n  SELECT 1 FROM auth.users u\n  WHERE u.id=auth.uid()\n   AND coalesce(u.raw_app_meta_data->>'pharmflow_must_change_password','false')<>'true'\n );\n`;
async function setup(){const db=new PGlite();await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA pharmflow_auth_private;
CREATE TABLE auth.users(id uuid primary key,raw_app_meta_data jsonb);CREATE TABLE auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(auth.jwt()->>'sub','')::uuid$$;
CREATE FUNCTION pharmflow_auth_private.password_change_complete() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','auth' AS $old$${oldBody}$old$;
REVOKE ALL ON FUNCTION pharmflow_auth_private.password_change_complete() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pharmflow_auth_private.password_change_complete() TO authenticated;
INSERT INTO auth.users VALUES('10000000-0000-4000-8000-000000000001','{}');
INSERT INTO auth.sessions VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',NULL);`);return db;}
const signature='pharmflow_auth_private.password_change_complete()';
async function state(db){return (await db.query(`select md5(prosrc) hash,proacl::text acl,pg_get_userbyid(proowner) owner from pg_proc where oid=$1::regprocedure`,[signature])).rows[0];}
test('Production guarded migration preserves ACL and session semantics; exact rollback restores baseline',async()=>{
const db=await setup();try{
const before=await state(db);assert.equal(before.hash,'e9b53d68c5d32ec04a70409383af5e5f');await db.exec(apply);assert.equal((await state(db)).hash,'99bda52f1b8577ac07f5c0d81bdbd8f7');assert.equal((await state(db)).acl,before.acl);
const claims={sub:'10000000-0000-4000-8000-000000000001',session_id:'20000000-0000-4000-8000-000000000001',exp:Math.floor(Date.now()/1000)+3600};
async function allowed(c){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(c)]);return (await db.query('select '+signature+' as ok')).rows[0].ok;}
assert.equal(await allowed(claims),true);assert.equal(await allowed({...claims,exp:0}),false);assert.equal(await allowed({...claims,session_id:null}),false);assert.equal(await allowed({...claims,sub:'10000000-0000-4000-8000-000000000002'}),false);
await db.exec("update auth.users set raw_app_meta_data='{\"pharmflow_must_change_password\":true}'");assert.equal(await allowed(claims),false);await db.exec("update auth.users set raw_app_meta_data='{}'; delete from auth.sessions");assert.equal(await allowed(claims),false);
await db.exec(rollback);assert.deepEqual(await state(db),before);
}finally{await db.close();}});
for(const [name,drift] of [['body',`CREATE OR REPLACE FUNCTION ${signature} RETURNS boolean LANGUAGE sql AS $$SELECT true$$`],['ACL',`GRANT EXECUTE ON FUNCTION ${signature} TO PUBLIC`],['owner',`CREATE ROLE unexpected_owner; ALTER FUNCTION ${signature} OWNER TO unexpected_owner`]])test('Production migration rejects '+name+' drift atomically',async()=>{const db=await setup();try{await db.exec(drift);const before=await state(db);await assert.rejects(db.exec(apply),/drift/);await db.exec('ROLLBACK');assert.deepEqual(await state(db),before);}finally{await db.close();}});
