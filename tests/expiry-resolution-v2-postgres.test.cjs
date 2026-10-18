const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
let db;const PA='11111111-1111-4111-8111-111111111111',PB='22222222-2222-4222-8222-222222222222';
const UA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',UB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',AD='cccccccc-cccc-4ccc-8ccc-cccccccccccc',SO='dddddddd-dddd-4ddd-8ddd-dddddddddddd',W='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const uuid=()=>crypto.randomUUID();
const migration='proposals/expiry-backend/20261008004855_expiry_capture_integrity_final.sql';
async function identity(user=UA,role='authenticated'){await db.exec(`reset role;set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);}
function capture(id='U0030',kind='KNOWN'){return {kind,identifier_display:id,raw_scan:id,scan_format:'PLAIN',quantity:3,expiry_month:8,expiry_year:2028,worker_id:W,device_id:'synthetic-device',source:'HANDHELD',batch_no:null,sample_serial:null,item_code:'ITEM-'+id,item_name:'Synthetic '+id,category:'Medicine'};}
async function save(p,op=uuid(),pharmacy=PA){return (await db.query('select public.save_pharmflow_expiry_capture_v3($1,$2,$3::jsonb) as r',[pharmacy,op,JSON.stringify(p)])).rows[0].r;}
async function photos(p,op=uuid()){
 await db.query('select public.reserve_pharmflow_expiry_capture_v1($1,$2)',[PA,op]);
 for(const role of ['product','expiry']){const path=`${PA}/expiry-v1/${op}/${role}/${uuid()}.jpg`;await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',path,UA,JSON.stringify({mimetype:'image/jpeg',size:500})]);p[role+'_photo_path']=path;}
 return op;
}
async function singlePhoto(p,op=uuid()){
 await db.query('select public.reserve_pharmflow_expiry_capture_v1($1,$2)',[PA,op]);
 const path=`${PA}/expiry-v1/${op}/product/${uuid()}.jpg`;
 await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',path,UA,JSON.stringify({mimetype:'image/jpeg',size:500})]);
 p.product_photo_path=path;return op;
}
async function value(sql,args=[]){return (await db.query(sql,args)).rows[0];}
async function denied(fn,pattern){await assert.rejects(fn,pattern);}
async function processQueuedReviewPhotos(reviewId,expectedCount){
 await identity(UA,'postgres');
 await db.query("update pharmflow_expiry_private.photo_cleanup_jobs set next_attempt_at=now()+interval '1 day' where review_id<>$1 and state='PENDING'",[reviewId]);
 await identity(UA,'service_role');
 const claimed=await db.query('select * from pharmflow_expiry_private.claim_photo_cleanup_jobs(4)');
 const jobs=claimed.rows.filter(row=>row.review_id===reviewId);
 assert.equal(jobs.length,expectedCount);
 for(const job of jobs){
  await db.query('delete from storage.objects where bucket_id=$1 and name=$2',['pharmflow-needs-review',job.object_path]);
  assert.equal((await value('select pharmflow_expiry_private.complete_photo_cleanup_job($1,$2,$3) r',[job.job_id,job.object_path,job.claim_token])).r,true);
 }
 return jobs;
}
test.before(async()=>{
 const localUrl=process.env.PHARMFLOW_LOCAL_PG_URL;
 if(localUrl){
  const url=new URL(localUrl);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^\/pharmflow_expiry_synthetic_[a-z0-9_]+$/.test(url.pathname))throw new Error('Only a fresh disposable loopback synthetic database is allowed');
  const {Client}=require('pg'),client=new Client({connectionString:localUrl});await client.connect();
  const existing=await client.query("select count(*)::int n from information_schema.tables where table_schema in ('public','auth','storage')");
  if(existing.rows[0].n!==0){await client.end();throw new Error('Native synthetic database must be empty; no cleanup/destructive reset is performed');}
  db={exec:sql=>client.query(sql),query:(...a)=>client.query(...a),close:()=>client.end()};
 }else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
 await db.exec(fs.readFileSync('tests/expiry-backend/fixture.sql','utf8'));
 const schema=fs.readFileSync('PHASE2C1176_EXPIRY_STAGE1_CURRENT_STATE.sql','utf8');await db.exec(schema.slice(0,schema.indexOf('create or replace function public.save_pharmacy_expiry_verified_state_v1')));
 const defs=JSON.parse(fs.readFileSync('tests/expiry-backend/deployed-save-contracts.json','utf8'));
 for(const d of defs){await db.exec(d.definition+';');const types=d.arguments.split(', ').map(a=>a.slice(a.indexOf(' ')+1)).join(',');await db.exec(`revoke all on function public.${d.proname}(${types}) from public,anon;grant execute on function public.${d.proname}(${types}) to authenticated;`);}
 await db.exec(`alter table public.pharmacies add column code text,add column active boolean default true,add column status text default 'active';
 alter table public.pharmflow_needs_review_v2 add column resolved_at timestamptz,add column resolution_transaction_id text,add column updated_at timestamptz default now();
 create table public.pharmacy_members(pharmacy_id uuid,user_id uuid,active boolean,role text);
 create function public.is_system_owner() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select auth.uid()='${SO}'::uuid$$;
 create table public.pharmflow_global_items_v2(item_code text primary key,item_name text not null,group_name text,category text,sub_category text,created_at timestamptz default now(),created_by uuid,updated_at timestamptz default now(),updated_by uuid);
 create table public.pharmflow_global_item_identifiers_v2(id uuid primary key default gen_random_uuid(),item_code text not null references public.pharmflow_global_items_v2(item_code) on delete restrict,identifier_display text not null,identifier_key text not null unique,mapping_revision bigint not null default 1,created_at timestamptz default now(),created_by uuid,updated_at timestamptz default now(),updated_by uuid);
 create table public.pharmflow_pharmacy_gtin_v1(id uuid primary key default gen_random_uuid(),pharmacy_id uuid not null references public.pharmacies(id),gtin text not null,item_code text not null,item_name text not null default '',source text not null default 'LEARNED',created_by uuid,created_at timestamptz not null default now(),updated_by uuid,updated_at timestamptz not null default now(),mapping_revision bigint not null default 1,identifier_display text not null,identifier_key text not null);alter table public.pharmflow_pharmacy_gtin_v1 enable row level security;
 create table public.pharmflow_identifier_mapping_audit_v1(id uuid primary key default gen_random_uuid(),operation_id uuid not null unique,action text not null,identifier_id uuid references public.pharmflow_global_item_identifiers_v2(id) on delete set null,identifier_display text not null,identifier_key text not null,old_item_code text,new_item_code text,reason text not null,performed_by uuid not null references auth.users(id),performed_at timestamptz not null default now());
 create or replace function public.pharmflow_is_reference_master_admin_v1() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select auth.uid() is not null and (public.is_system_owner() or exists(select 1 from public.pharmacy_members pm join public.pharmacies p on p.id=pm.pharmacy_id where pm.user_id=auth.uid() and pm.active is true and lower(coalesce(pm.role,''))='admin' and p.active is true and p.status='active' and upper(btrim(coalesce(p.code,'')))='HHP084'))$$;
 insert into public.pharmacies(id,code,active,status) values('${PA}','HHP084',true,'active'),('${PB}','BETA001',true,'active');
 insert into auth.users values('${UA}'),('${UB}'),('${AD}'),('${SO}');
 insert into public.test_members values('${UA}','${PA}',false),('${UB}','${PB}',false),('${AD}','${PA}',true);
 insert into public.pharmacy_members values('${PA}','${AD}',true,'admin');
 insert into public.pharmflow_expiry_workers_v1 values('${W}','${PA}','Synthetic HHP084 worker',true);
 insert into public.pharmflow_global_items_v2(item_code,item_name) values('TARGET-ITEM','Synthetic Global Item'),('OTHER-ITEM','Other Global Item');`);
 await db.exec(fs.readFileSync(migration,'utf8'));
 await db.exec(fs.readFileSync('proposals/staging/20261010_expiry_needs_review_single_photo_and_resolution.sql','utf8'));
 let cleanupMigration=fs.readFileSync('proposals/staging/20261010_expiry_needs_review_member_delete.sql','utf8');
 // PGlite has no pg_cron/pg_net or Supabase Vault. Keep all queue/RPC/trigger
 // SQL in the fixture, omitting only the hosted-provider preflight and schedule.
 cleanupMigration=cleanupMigration
  .replace(/  if not exists\(select 1 from pg_extension where extname='pg_cron'[\s\S]*?  end if;\n/,'')
  .replace(/  if \(select count\(\*\) from vault\.decrypted_secrets[\s\S]*?  end if;\n/,'');
 cleanupMigration=cleanupMigration.slice(0,cleanupMigration.indexOf('-- Durable retry schedule.'))+'\ncommit;';
 await db.exec(cleanupMigration);
 await db.exec(fs.readFileSync('proposals/staging/PHASE2C1184_EXPIRY_REVIEW_LOCAL_RESOLUTION.sql','utf8'));
 await identity();
 console.log('LOCAL SQL ENGINE:',(await value('select version() as version')).version);
 await installV2();
});
test.after(async()=>{if(db)await db.close()});
async function installV2(){
 await identity(UA,'postgres');
 await db.exec(`alter table public.pharmflow_needs_review_v2 add column resolution_type text,add column order_number text,add column order_name text,add column work_scope_order_numbers text[],add column resolution_block_code text,add column resolution_block_detail text;
 create table public.pharmflow_needs_review_resolution_intents_v1(id uuid,pharmacy_id uuid,operation_id uuid,review_id uuid,transaction_id text,item_code text,item_name text,allocations jsonb);
 create table public.pharmflow_receiving_transactions_v1(transaction_id text);
 create function public.pharmflow_normalize_main_group_v1(p_group_name text) returns text language sql immutable as $$ select case lower(btrim(coalesce(p_group_name,''))) when 'beauty' then 'Beauty' when 'fmcg' then 'FMCG' when 'homehealth' then 'HomeHealth' when 'home health' then 'HomeHealth' when 'medicine' then 'Medicine' when 'mom & baby' then 'Mom & Baby' when 'supplement' then 'Supplement' end $$;
 insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key) values('TARGET-ITEM','OLD-IDENTIFIER','OLD-IDENTIFIER');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261018185307_expiry_review_transactional_resolution_v2.sql','utf8'));
}
async function resolveV2(review,op,code='TARGET-ITEM',newItem=null,pharmacy=PA){return (await value('select public.resolve_pharmflow_expiry_review_v2($1,$2,$3,$4,$5,$6) r',[pharmacy,review,op,code,'Synthetic acceptance',newItem])).r;}
async function pending(identifier){await identity();const p=capture(identifier,'UNKNOWN');const op=await singlePhoto(p);return save(p,op);}
test('V2 global-authorized existing link preserves identifiers, capture and exactly-once inventory',async()=>{
 const ack=await pending('V2-GLOBAL'),op=uuid();await identity(AD);
 const r=await resolveV2(ack.review_id,op);assert.equal(r.scope,'GLOBAL_AND_PHARMACY');
 const retry=await resolveV2(ack.review_id,op);assert.equal(retry.already_resolved,true);assert.equal(retry.event_id,r.event_id);
 await denied(()=>resolveV2(ack.review_id,uuid()),/already resolved/);
 await identity(UA,'postgres');
 assert.equal((await value("select count(*)::int n from public.pharmflow_global_item_identifiers_v2 where item_code='TARGET-ITEM'")).n,2);
 assert.equal((await value('select verified_quantity from public.pharmflow_expiry_events_v1 where id=$1',[r.event_id])).verified_quantity,3);
 assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_review_resolution_audit_v1 where review_id=$1',[ack.review_id])).n,1);
});
test('V2 pharmacy-only member resolves existing item without Global writes',async()=>{
 const ack=await pending('V2-LOCAL');await identity();const r=await resolveV2(ack.review_id,uuid());assert.equal(r.scope,'PHARMACY');
 await identity(UA,'postgres');assert.equal((await value("select count(*)::int n from public.pharmflow_global_item_identifiers_v2 where identifier_key='V2-LOCAL'")).n,0);
 assert.equal((await value("select count(*)::int n from public.pharmflow_pharmacy_gtin_v1 where identifier_key='V2-LOCAL'")).n,1);
});
for(const group of ['Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement'])test('V2 authorized create: '+group,async()=>{
 const code='CREATE-'+group,ack=await pending('BAR-'+group),op=uuid();await identity(AD);
 const r=await resolveV2(ack.review_id,op,code,{item_name:'Created '+group,group_name:group});assert.equal(r.global_item_created,true);
 assert.equal((await resolveV2(ack.review_id,op,code,{item_name:'Created '+group,group_name:group})).already_resolved,true);
 await identity(UA,'postgres');assert.equal((await value('select group_name,category from public.pharmflow_global_items_v2 where item_code=$1',[code])).group_name,group);
});
test('V2 invalid Group and unauthorized creation preserve Pending and do not create items',async()=>{
 const ack=await pending('V2-INVALID');await identity(AD);
 await denied(()=>resolveV2(ack.review_id,uuid(),'INVALID-ITEM',{item_name:'Invalid',group_name:'Other'}),/six approved/);
 await identity();await denied(()=>resolveV2(ack.review_id,uuid(),'UNAUTHORIZED-ITEM',{item_name:'No',group_name:'Medicine'}),/permission/);
 await identity(UA,'postgres');assert.equal((await value('select status from public.pharmflow_needs_review_v2 where id=$1',[ack.review_id])).status,'PENDING');
 assert.equal((await value("select count(*)::int n from public.pharmflow_global_items_v2 where item_code in ('INVALID-ITEM','UNAUTHORIZED-ITEM')")).n,0);
});
test('V2 cross-pharmacy and conflicting barcode reject without partial Global creation',async()=>{
 const ack=await pending('V2-CONFLICT');await identity(UB);await denied(()=>resolveV2(ack.review_id,uuid()),/Pharmacy access/);
 await identity(UA,'postgres');await db.query("insert into public.pharmflow_pharmacy_gtin_v1(pharmacy_id,gtin,item_code,item_name,identifier_display,identifier_key) values($1,'V2-CONFLICT','OTHER-ITEM','Other','V2-CONFLICT','V2-CONFLICT')",[PA]);
 await identity(AD);await denied(()=>resolveV2(ack.review_id,uuid(),'ROLLBACK-ITEM',{item_name:'Rollback',group_name:'Medicine'}),/another item/);
 await identity(UA,'postgres');assert.equal((await value("select count(*)::int n from public.pharmflow_global_items_v2 where item_code='ROLLBACK-ITEM'")).n,0);
 assert.equal((await value('select status from public.pharmflow_needs_review_v2 where id=$1',[ack.review_id])).status,'PENDING');
});
test('all seven Receiving mutators reject Expiry before any Receiving logic',async()=>{
 const ack=await pending('V2-BOUNDARY');await identity(AD);
 for(const [name,args] of [
  ['resolve_pharmflow_needs_review_v2',[PA,ack.review_id,'TARGET-ITEM','Name','ADD_UNORDERED','tx']],
  ['delete_pharmflow_needs_review_v2',[PA,ack.review_id]],
  ['set_pharmflow_needs_review_qty_v2',[PA,ack.review_id,4]],
  ['set_pharmflow_needs_review_photo_v2',[PA,ack.review_id,'fake']],
  ['assign_pharmflow_needs_review_order_v1',[PA,ack.review_id,'ORDER']],
  ['request_pharmflow_needs_review_resolution_v4',[uuid(),PA,ack.review_id,'TARGET-ITEM','Name','tx']],
  ['request_pharmflow_needs_review_resolution_v5',[uuid(),PA,ack.review_id,'TARGET-ITEM','Name','tx','[]']]
 ])await denied(()=>db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args),/Receiving Needs Review case required/);
});
test('overlapping same-operation resolution requests produce one event and one audit',async()=>{
 const ack=await pending('V2-OVERLAPPING'),op=uuid();await identity(AD);
 const [a,b]=await Promise.all([resolveV2(ack.review_id,op),resolveV2(ack.review_id,op)]);
 assert.equal(a.event_id,b.event_id);assert.equal(b.already_resolved,true);
 await identity(UA,'postgres');assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_review_resolution_audit_v1 where review_id=$1',[ack.review_id])).n,1);
});
