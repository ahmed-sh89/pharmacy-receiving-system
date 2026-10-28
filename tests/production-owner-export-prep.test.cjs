const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),cp=require('child_process'),{fixture}=require('./helpers/export-v2-fixture.cjs');
test('Prepared V2 apply and guarded rollback preserve Master data and SEC-007',async()=>{
 const {db,rpc}=await fixture({install:false});try{
 await db.exec("insert into public.pharmflow_global_items_v2(item_code,item_name) values('001','Unchanged Master');");
 await db.exec(fs.readFileSync('proposals/accepted-improvements-release/owner-export-apply.sql','utf8'));const data=await rpc('',{p_kind:'Items'});assert.equal(data.items,1);
 await db.exec(fs.readFileSync('proposals/accepted-improvements-release/owner-export-rollback.sql','utf8'));assert.equal((await db.query("select to_regprocedure('public.owner_export_global_items_page_v2(text,text,integer,text)') as f")).rows[0].f,null);
 assert.equal((await db.query('select item_name from public.pharmflow_global_items_v2')).rows[0].item_name,'Unchanged Master');assert.equal((await db.query("select md5(prosrc) as hash from pg_proc where oid='pharmflow_auth_private.password_change_complete()'::regprocedure")).rows[0].hash,'99bda52f1b8577ac07f5c0d81bdbd8f7');
 }finally{await db.close();}
});
test('Previously accepted reports/permissions and security/environment boundaries remain exact',()=>{
 for(const p of ['js/reports.js','js/session.js','js/permissions.js'])assert.equal(fs.readFileSync(p,'utf8'),cp.execFileSync('git',['show','232f7fe:'+p],{encoding:'utf8'}),p);
 for(const p of ['js/supabase.js','js/config.js','vercel.json','.github/workflows/deploy.yml','js/expiry.js','js/identifier-service.js','css/identity.css','supabase/functions/pharmflow-password-admin/index.ts','supabase/functions/pharmflow-password-admin-settings-rc/index.ts'])assert.equal(fs.readFileSync(p,'utf8'),cp.execFileSync('git',['show','08843e4:'+p],{encoding:'utf8'}),p);
});
