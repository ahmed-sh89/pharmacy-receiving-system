const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
test('Production-sized synthetic export: complete pagination and actual XLSX round-trip',async()=>{
 const ni=56588,nd=78164,window={};vm.runInNewContext(fs.readFileSync('js/global-items-export.js','utf8'),{window,document:{readyState:'loading',addEventListener(){}}});
 const items=Array.from({length:ni},(_,i)=>({item_code:String(i).padStart(8,'0'),item_name:'Synthetic product '+i,group_name:'Medicine',identifier_count:1+(i<nd-ni?1:0)}));
 const identifiers=Array.from({length:nd},(_,i)=>({id:i.toString(16).padStart(8,'0')+'-0000-4000-8000-000000000000',item_code:String(i%ni).padStart(8,'0'),identifier_display:i%2?'0000'+i:'ALPHA-'+i}));let calls=0,offsets={Items:0,Identifiers:0};
 const start=performance.now();const data=await window.PharmFlowGlobalItemsExport.collect(async(_,{p_kind,p_after,p_limit})=>{calls++;const all=p_kind==='Items'?items:identifiers,offset=offsets[p_kind];assert.equal(p_after,offset?String(p_kind==='Items'?all[offset-1].item_code:all[offset-1].id):'');const rows=all.slice(offset,offset+p_limit);offsets[p_kind]+=rows.length;return {rows,items:ni,identifiers:nd,version:'fixed-synthetic-production-size'};});
 assert.equal(data.items.length,ni);assert.equal(data.identifiers.length,nd);assert.equal(calls,183);
 const c={self:{postMessage:r=>c.result=r},importScripts(){},console};vm.createContext(c);vm.runInContext(fs.readFileSync('js/vendor/sheetjs-0.20.3/xlsx.full.min.js','utf8'),c);c.XLSX=c.XLSX||c.self.XLSX;vm.runInContext(fs.readFileSync('js/global-items-export-worker.js','utf8'),c);const buildAt=performance.now();c.self.onmessage({data});assert(!c.result.error);const workbookMs=performance.now()-buildAt,book=c.XLSX.read(c.result.buffer,{type:'array'});
 assert.deepEqual(Array.from(book.SheetNames),['Items','Identifiers']);assert.equal(c.XLSX.utils.decode_range(book.Sheets.Items['!ref']).e.r,ni);assert.equal(c.XLSX.utils.decode_range(book.Sheets.Identifiers['!ref']).e.r,nd);assert.equal(book.Sheets.Identifiers.B3.v,'00001');assert.equal(book.Sheets.Identifiers.B3.t,'s');assert.equal(book.Sheets.Items.A2.v,'00000000');
 console.log('PRODUCTION_SIZE_WORKBOOK',JSON.stringify({items:ni,identifiers:nd,pageRequests:calls,workbookMs:Math.round(workbookMs),totalMs:Math.round(performance.now()-start),xlsxBytes:c.result.buffer.byteLength,processPeakRssMiB:Math.round(process.resourceUsage().maxRSS/1024),conditions:'synthetic data, local Node VM; no real browser or network latency claim'}));
});
test('Proposed migration is additive, live-session/Owner guarded; no Staging or excluded runtime change',()=>{
 const sql=fs.readFileSync('proposals/accepted-improvements-release/owner-export-apply.sql','utf8');assert.match(sql,/NOT public\.is_system_owner\(\)/);assert.match(sql,/NOT pharmflow_auth_private\.password_change_complete\(\)/);assert.match(sql,/FROM PUBLIC,anon,authenticated/);assert.match(sql,/TO authenticated/);
 for(const pattern of [/CREATE TABLE/i,/ALTER TABLE/i,/DELETE FROM/i,/UPDATE public\./i,/INSERT INTO/i])assert.doesNotMatch(sql,pattern);
 const cp=require('node:child_process');for(const p of ['vite.config.js','js/supabase.js','js/config.js','vercel.json','.github/workflows/deploy.yml','js/expiry.js','js/identifier-service.js','supabase/functions/pharmflow-password-admin/index.ts','supabase/functions/pharmflow-password-admin-settings-rc/index.ts'])assert.equal(fs.readFileSync(p,'utf8'),cp.execFileSync('git',['show','08843e4:'+p],{encoding:'utf8'}),p);
 assert.doesNotMatch(fs.readFileSync('index.html','utf8'),/tovkcakucyagvbzvlnks|STAGING — TEST DATA/);
});
test('Prepared apply/rollback and authorization execute in isolated Postgres; pharmacy/anonymous/revoked owners denied',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema pharmflow_auth_private;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb $$;
 create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}');create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create table public.system_owners(user_id uuid primary key);create function public.is_system_owner() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.system_owners where user_id=auth.uid())$$;
 create table public.pharmflow_global_items_v2(item_code text primary key,item_name text,group_name text,category text,sub_category text);
 create table public.pharmflow_global_item_identifiers_v2(id uuid primary key,item_code text references public.pharmflow_global_items_v2,item_identifier text,identifier_display text);
 insert into public.pharmflow_global_items_v2 values('001','Synthetic','Medicine',null,null);
 insert into public.pharmflow_global_item_identifiers_v2(id,item_code,identifier_display) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','001','000123');
 insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
 insert into public.system_owners values('11111111-1111-4111-8111-111111111111');
 insert into auth.sessions(id,user_id) values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111');`);
 const old=fs.readFileSync('proposals/production-security/sec007-apply.sql','utf8'),at=old.indexOf('CREATE OR REPLACE FUNCTION pharmflow_auth_private.password_change_complete()'),end=old.indexOf('$function$',old.indexOf('AS $function$',at)+14)+11;
 await db.exec(old.slice(at,end));await db.exec('revoke all on function pharmflow_auth_private.password_change_complete() from public,anon;grant execute on function pharmflow_auth_private.password_change_complete() to authenticated;');
 await db.exec(fs.readFileSync('proposals/accepted-improvements-release/owner-export-apply.sql','utf8'));
 const identity=async(uid,session='33333333-3333-4333-8333-333333333333')=>{await db.query("select set_config('test.uid',$1,false),set_config('test.jwt',$2,false)",[uid,JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,session_id:session})]);};
 for(const uid of ['', '22222222-2222-4222-8222-222222222222']){await identity(uid);await assert.rejects(db.query("select public.owner_export_global_items_page_v1('Items','',750)"),/Owner permission/);}
 await identity('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444');await assert.rejects(db.query("select public.owner_export_global_items_page_v1('Items','',750)"),/live session/);
 await identity('11111111-1111-4111-8111-111111111111');const page=(await db.query("select public.owner_export_global_items_page_v1('Items','',750) as page")).rows[0].page;assert.equal(page.items,1);assert.equal(page.identifiers,1);assert.equal(page.rows[0].identifier_count,1);
 assert.equal((await db.query("select has_function_privilege('anon','public.owner_export_global_items_page_v1(text,text,integer)','execute') as allowed")).rows[0].allowed,false);
 await db.exec(fs.readFileSync('proposals/accepted-improvements-release/owner-export-rollback.sql','utf8'));assert.equal((await db.query("select to_regprocedure('public.owner_export_global_items_page_v1(text,text,integer)') as f")).rows[0].f,null);
 assert.equal((await db.query('select count(*)::int as n from public.pharmflow_global_items_v2')).rows[0].n,1);assert.equal((await db.query("select md5(prosrc) as digest from pg_proc where oid='pharmflow_auth_private.password_change_complete()'::regprocedure")).rows[0].digest,'99bda52f1b8577ac07f5c0d81bdbd8f7');
 }finally{await db.close();}
});
