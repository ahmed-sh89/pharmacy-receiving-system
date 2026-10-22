'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
let db;
test.before(async()=>{db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table public.pharmflow_global_items_v2(item_code text primary key,group_name text);alter table public.pharmflow_global_items_v2 enable row level security;insert into public.pharmflow_global_items_v2 values('1056889','HomeHealth'),('0007','Beauty'),('7','Medicine');`);const source=fs.readFileSync('sql/receiving-hotfix-review/01_identity_and_provenance.sql','utf8');await db.exec(source.slice(source.indexOf('CREATE FUNCTION public.pharmflow_receiving_item_code_v1'),source.indexOf('CREATE FUNCTION public.learn_pharmflow_existing_identifier_v3')));await db.exec(fs.readFileSync('sql/receiving-hotfix-review/07_receiving_group_display.sql','utf8'));});
test.after(async()=>db?.close());
test('anonymous caller denied; authenticated caller without identity denied',async()=>{
 await db.exec('set role anon');await assert.rejects(db.query(`select * from public.get_pharmflow_receiving_groups_v1(array['1056889'])`),/permission denied/);await db.exec('reset role;set role authenticated');await assert.rejects(db.query(`select * from public.get_pharmflow_receiving_groups_v1(array['1056889'])`),/Authentication required/);await db.exec('reset role');
});
test('authenticated read returns canonical Group with no identifier table; no direct Global table access',async()=>{
 await db.exec(`select set_config('request.jwt.claim.sub','0ec51f5e-1927-435c-a07c-3232265b31be',false);set role authenticated`);
 assert.deepEqual((await db.query(`select * from public.get_pharmflow_receiving_groups_v1(array['1056889'])`)).rows,[{item_code:'1056889',group_name:'HomeHealth'}]);
 await assert.rejects(db.query('select * from public.pharmflow_global_items_v2'),/permission denied/);await db.exec('reset role');
});
test('ambiguous canonical codes excluded, missing/empty codes return none, request size bounded',async()=>{
 assert.equal((await db.query(`select * from public.get_pharmflow_receiving_groups_v1(array['7','MISSING'])`)).rows.length,0);assert.equal((await db.query(`select * from public.get_pharmflow_receiving_groups_v1(null)`)).rows.length,0);
 await assert.rejects(db.query(`select * from public.get_pharmflow_receiving_groups_v1(array_fill('X'::text,array[1001]))`),/At most 1000/);
});
