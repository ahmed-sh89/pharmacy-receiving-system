const fs=require('fs');
async function fixture({install=true}={}){
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema pharmflow_auth_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb$$;
 create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}');create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create table public.system_owners(user_id uuid primary key);create function public.is_system_owner() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.system_owners where user_id=auth.uid())$$;
 create table public.pharmflow_global_items_v2(item_code text primary key,item_name text,group_name text,category text,sub_category text,created_at timestamptz default now(),created_by uuid,updated_at timestamptz default now(),updated_by uuid);
 create table public.pharmflow_global_item_identifiers_v2(id uuid primary key,item_code text references public.pharmflow_global_items_v2,identifier_display text,identifier_key text,mapping_revision bigint default 1,created_at timestamptz default now(),created_by uuid,updated_at timestamptz default now(),updated_by uuid);
 create index on public.pharmflow_global_item_identifiers_v2(item_code);
 insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
 insert into public.system_owners values('11111111-1111-4111-8111-111111111111');
 insert into auth.sessions values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',null);`);
 const old=fs.readFileSync('proposals/production-security/sec007-apply.sql','utf8'),at=old.indexOf('CREATE OR REPLACE FUNCTION pharmflow_auth_private.password_change_complete()'),end=old.indexOf('$function$',old.indexOf('AS $function$',at)+14)+11;
 await db.exec(old.slice(at,end));await db.exec('revoke all on function pharmflow_auth_private.password_change_complete() from public,anon;grant execute on function pharmflow_auth_private.password_change_complete() to authenticated;');
 if(install)await db.exec(fs.readFileSync('proposals/final-refinements/export-v2.sql','utf8'));
 async function identity(uid='11111111-1111-4111-8111-111111111111',sid='33333333-3333-4333-8333-333333333333'){
  await db.query("select set_config('test.uid',$1,false),set_config('test.jwt',$2,false)",[uid,JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,session_id:sid})]);
 }
 await identity();
 async function rpc(_,{p_kind,p_after='',p_limit=750,p_version=null}){return (await db.query('select public.owner_export_global_items_page_v2($1,$2,$3,$4) as page',[p_kind,p_after,p_limit,p_version])).rows[0].page;}
 return {db,identity,rpc};
}
function worker(){
 const vm=require('vm');const c={self:{postMessage:r=>c.result=r},importScripts(){},console,TextEncoder,Uint32Array,CompressionStream,ReadableStream,Response};vm.createContext(c);vm.runInContext(fs.readFileSync('js/vendor/sheetjs-0.20.3/xlsx.full.min.js','utf8'),c);c.XLSX=c.XLSX||c.self.XLSX;vm.runInContext(fs.readFileSync('js/global-items-export-worker.js','utf8'),c);let id=0;
 return {c,async send(type,args={}){await c.self.onmessage({data:{id:++id,type,...args}});if(c.result.error)throw Error(c.result.error);return c.result;}};
}
module.exports={fixture,worker};
