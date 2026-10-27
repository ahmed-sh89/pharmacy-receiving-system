const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('SEC-007 shared gate preserves password restriction and fences revoked/foreign/expired sessions',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();
 const user='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',sid='20000000-0000-4000-8000-000000000001';
 try{
  await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA pharmflow_auth_private;
   CREATE TABLE auth.users(id uuid primary key,raw_app_meta_data jsonb);
   CREATE TABLE auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(auth.jwt()->>'sub','')::uuid $$;
   INSERT INTO auth.users VALUES('${user}','{"pharmflow_must_change_password":false}');
   INSERT INTO auth.sessions VALUES('${sid}','${user}',NULL);`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../proposals/security/20261028_sec007_rollback.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../proposals/security/20261028_sec007_trusted_session_gate.sql'),'utf8'));
  async function allowed(claims){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);return (await db.query('select pharmflow_auth_private.password_change_complete() as allowed')).rows[0].allowed;}
  const claims={sub:user,session_id:sid,exp:Math.floor(Date.now()/1000)+3600};
  assert.equal(await allowed(claims),true);
  assert.equal(await allowed({...claims,session_id:null}),false);
  assert.equal(await allowed({...claims,exp:1}),false);
  assert.equal(await allowed({...claims,sub:other}),false);
  assert.equal(await allowed({}),false);
  await db.exec("update auth.sessions set not_after=now()-interval '1 minute'");assert.equal(await allowed(claims),false);
  await db.exec('update auth.sessions set not_after=NULL');
  await db.exec("update auth.users set raw_app_meta_data='{\"pharmflow_must_change_password\":true}'");assert.equal(await allowed(claims),false);
  await db.exec("update auth.users set raw_app_meta_data='{\"pharmflow_must_change_password\":false}'");assert.equal(await allowed(claims),true);
  await db.exec('delete from auth.sessions');assert.equal(await allowed(claims),false);
 }finally{await db.close();}
});
