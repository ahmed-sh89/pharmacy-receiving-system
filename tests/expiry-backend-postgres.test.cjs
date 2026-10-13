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
});
test.after(async()=>{if(db)await db.close()});
test('Session earlier replacement, single reversal, stale revision, closure and isolation',async()=>{
 await identity(UA,'postgres');
 const before=await value("select md5(string_agg(row_to_json(o)::text,'' order by operation_id)) h from pharmflow_expiry_private.operations o");
 await db.exec(fs.readFileSync('proposals/staging/expiry_active_session_v1.sql','utf8'));
 assert.deepEqual(await value("select md5(string_agg(row_to_json(o)::text,'' order by operation_id)) h from pharmflow_expiry_private.operations o"),before);
 await identity();const session=uuid(),op=uuid(),other=uuid(),p=capture('SESSION-EARLY'),p2=capture('SESSION-LATER');
 const open=()=>db.query('select public.open_pharmflow_expiry_session_v1($1,$2,$3)',[PA,session,p.device_id]);await open();await open();
 const sessionSave=(payload,id)=>db.query('select public.save_pharmflow_expiry_session_capture_v1($1,$2,$3,$4::jsonb) r',[PA,session,id,JSON.stringify(payload)]);
 const r=(await sessionSave(p,op)).rows[0].r;await sessionSave(p2,other);assert.deepEqual((await sessionSave(p,op)).rows[0].r,r);
 const correction=uuid();const adjust=(req,rev,qty,operation=op)=>db.query('select public.correct_pharmflow_expiry_session_v1($1,$2,$3,$4,$5,$6) r',[PA,session,operation,req,rev,qty]);
 const edited=(await adjust(correction,0,2)).rows[0].r;assert.equal(edited.quantity,2);assert.deepEqual((await adjust(correction,0,2)).rows[0].r,edited);
 await denied(()=>adjust(correction,0,4),/payload conflict/);await denied(()=>adjust(uuid(),0,7),/Stale revision/);
 await identity(UA,'postgres');assert.equal((await value('select verified_quantity q from public.pharmflow_expiry_current_state_v1 where id=$1',[r.state_id])).q,2);
 await identity();await adjust(uuid(),1,0);
 const listed=(await value('select public.list_pharmflow_expiry_session_v1($1,$2) r',[PA,session])).r;assert.equal(listed.find(x=>x.operation_id===op).quantity,0);assert.equal(listed.find(x=>x.operation_id===other).quantity,3);
 await identity(UB);await denied(()=>adjust(uuid(),0,1,other),/Pharmacy access/);await denied(()=>open(),/Pharmacy access/);
 await identity();await db.query('select public.close_pharmflow_expiry_session_v1($1,$2)',[PA,session]);await denied(()=>open(),/Session closed/);await denied(()=>adjust(uuid(),0,1,other),/Session closed/);await denied(()=>sessionSave(capture('CLOSED'),uuid()),/Session closed/);
 assert.deepEqual((await sessionSave(p,op)).rows[0].r,r);
 const closed=(await value('select public.list_pharmflow_expiry_session_v1($1,$2) r',[PA,session])).r;assert.equal(closed.every(x=>!x.editable),true);
});
test('Session pending review corrections preserve evidence and resolution uses replacement quantity',async()=>{
 await identity();const session=uuid(),p=capture('SESSION-REVIEW','UNKNOWN');p.batch_no='SESSION-ISOLATED';const op=await singlePhoto(p);
 await db.query('select public.open_pharmflow_expiry_session_v1($1,$2,$3)',[PA,session,p.device_id]);
 const ack=(await value('select public.save_pharmflow_expiry_session_capture_v1($1,$2,$3,$4::jsonb) r',[PA,session,op,JSON.stringify(p)])).r;
 const adjust=(qty,rev=0)=>db.query('select public.correct_pharmflow_expiry_session_v1($1,$2,$3,$4,$5,$6) r',[PA,session,op,uuid(),rev,qty]);
 await adjust(2);
 const evidence=(await value('select public.get_pharmflow_expiry_review_v1($1,$2) r',[PA,ack.review_id])).r;assert.equal(evidence.quantity,3);assert.equal(evidence.product_photo_path,p.product_photo_path);
 const list=await db.query('select public.list_pharmflow_expiry_reviews_v1($1,$2,$3,$4) r',[PA,'ALL',250,0]);const row=list.rows.find(x=>x.r.review_id===ack.review_id).r;assert.equal(row.quantity,2);assert.equal(row.original_quantity,3);
 await identity(AD);await denied(()=>adjust(1,1),/scope mismatch/);await identity();
 const resolved=(await value('select public.resolve_pharmflow_expiry_review_v1($1,$2,$3,$4,$5) r',[PA,ack.review_id,uuid(),'TARGET-ITEM','Session quantity test'])).r;
 await identity(UA,'postgres');const event=await value('select previous_quantity,verified_quantity from public.pharmflow_expiry_events_v1 where id=$1',[resolved.event_id]);assert.equal(event.verified_quantity-Number(event.previous_quantity||0),2);
 await identity();await denied(()=>adjust(4,1),/Only pending/);
 const deletedPayload=capture('SESSION-REVIEW-DELETE','UNKNOWN'),deleteOp=await singlePhoto(deletedPayload);
 const deleteAck=(await value('select public.save_pharmflow_expiry_session_capture_v1($1,$2,$3,$4::jsonb) r',[PA,session,deleteOp,JSON.stringify(deletedPayload)])).r;
 const request=uuid(),args=[PA,session,deleteOp,request,0,0];const sql='select public.correct_pharmflow_expiry_session_v1($1,$2,$3,$4,$5,$6) r';const deleted=(await value(sql,args)).r;assert.deepEqual((await value(sql,args)).r,deleted);
 assert.equal((await value('select public.get_pharmflow_expiry_review_v1($1,$2) r',[PA,deleteAck.review_id])).r.status,'DELETED');
 await identity(UA,'postgres');assert.equal((await value('select payload from pharmflow_expiry_private.operations where pharmacy_id=$1 and operation_id=$2',[PA,deleteOp])).payload.quantity,3);
});
for(const id of ['U0030','S00110','1234A','001234','04065272072977'])test('SQL exact identity and additive acknowledgement: '+id,async()=>{
 await identity();const p=capture(id),op=uuid(),r=await save(p,op);assert.ok(r.state_id&&r.event_id);assert.deepEqual(await save(p,op),r);
 await identity(UA,'postgres');const row=await value('select * from public.pharmflow_expiry_current_state_v1 where id=$1',[r.state_id]);assert.equal(row.identifier_display,id);assert.equal(row.verified_quantity,3);assert.equal((await value('select count(*)::int as n from public.pharmflow_expiry_events_v1 where state_id=$1',[r.state_id])).n,1);
});
test('SQL raw GS1, batch, serial, month-end day00 and both photos survive authorized read',async()=>{
 await identity();const p=capture('04065272072977','UNKNOWN');Object.assign(p,{raw_scan:']C101040652720729771728080010LOT-A\u001d21SERIAL-A',scan_format:'GS1',batch_no:'LOT-A',sample_serial:'SERIAL-A',quantity:7});const op=await photos(p),r=await save(p,op);
 const read=(await db.query('select public.get_pharmflow_expiry_review_v1($1,$2) as r',[PA,r.review_id])).rows[0].r;
 for(const field of Object.keys(p))assert.deepEqual(read[field],p[field],field);assert.equal(read.worker_name,'Synthetic HHP084 worker');assert.equal(read.status,'PENDING');assert.equal(read.pharmacy_id,PA);assert.equal(read.identifier_key,'04065272072977');assert.deepEqual(await save(p,op),r);
 await identity(UB);await denied(()=>db.query('select public.get_pharmflow_expiry_review_v1($1,$2)',[PA,r.review_id]),/Pharmacy access/);
 await denied(()=>db.query('select public.list_pharmflow_expiry_reviews_v1($1,$2,$3,$4)',[PA,'ALL',250,0]),/Pharmacy access/);
 await denied(()=>db.query('select public.count_pharmflow_expiry_reviews_v1($1)',[PA]),/Pharmacy access/);
 assert.equal((await db.query('select * from storage.objects where bucket_id=$1 and name=$2',['pharmflow-needs-review',p.product_photo_path])).rows.length,0);
 await identity();assert.equal((await db.query('select public.get_pharmflow_expiry_review_v1($1,$2) as r',[PA,uuid()])).rows[0].r,null);
 assert.equal((await db.query('select * from storage.objects where bucket_id=$1 and name=$2',['pharmflow-needs-review',p.product_photo_path])).rows.length,1);
});
test('SQL accepts one evidence photo and preserves legacy two-photo rows through the new reader',async()=>{
 await identity();const p=capture('ONE-PHOTO','UNKNOWN'),op=await singlePhoto(p),ack=await save(p,op);
 const row=(await value('select public.get_pharmflow_expiry_review_v1($1,$2) as r',[PA,ack.review_id])).r;
 assert.equal(row.evidence_photo_path,p.product_photo_path);assert.equal(row.expiry_photo_path,null);assert.equal(row.status,'PENDING');
 const legacy=capture('LEGACY-PAIR','UNKNOWN'),legacyOp=await photos(legacy),legacyAck=await save(legacy,legacyOp);
 const legacyRow=(await value('select public.get_pharmflow_expiry_review_v1($1,$2) as r',[PA,legacyAck.review_id])).r;
 assert.equal(legacyRow.product_photo_path,legacy.product_photo_path);assert.equal(legacyRow.expiry_photo_path,legacy.expiry_photo_path);assert.equal(legacyRow.evidence_photo_path,legacy.product_photo_path);
 await identity(UA,'postgres');assert.equal((await value('select count(*)::int n from public.pharmflow_needs_review_v2 where workflow=\'EXPIRY\' and status=\'PENDING\'')).n>=2,true);
});
test('SQL review tombstone is pharmacy-scoped, idempotent, and leaves evidence and protected domains unchanged',async()=>{
 await identity();const p=capture('DELETE-CASE','UNKNOWN'),op=await singlePhoto(p),ack=await save(p,op);
 await identity(UA,'postgres');
 await identity(UA,'service_role');
 const photoCountBefore=(await value("select count(*)::int n from storage.objects where bucket_id='pharmflow-needs-review'")).n;
 await identity(UA,'postgres');
 const inventoryBefore=(await value('select count(*)::int n from public.pharmflow_expiry_current_state_v1')).n;
 const eventsBefore=(await value('select count(*)::int n from public.pharmflow_expiry_events_v1')).n;
 const masterBefore=(await value('select count(*)::int n from public.pharmflow_global_item_identifiers_v2')).n;
 const receivingBefore=(await value('select count(*)::int n from public.test_receiving_ledger')).n;
 await identity();
 const first=(await value('select public.delete_pharmflow_expiry_review_v1($1,$2) r',[PA,ack.review_id])).r;
 assert.deepEqual(first,{success:true,review_id:ack.review_id,status:'DELETED',already_deleted:false,photo_cleanup_queued:true});
 const retry=(await value('select public.delete_pharmflow_expiry_review_v1($1,$2) r',[PA,ack.review_id])).r;
 assert.deepEqual(retry,{success:true,review_id:ack.review_id,status:'DELETED',already_deleted:true});
 const row=(await value('select status,deleted_by,deleted_at,workflow,pharmacy_id from public.pharmflow_needs_review_v2 where id=$1',[ack.review_id]));
 assert.equal(row.status,'DELETED');assert.equal(row.deleted_by,UA);assert.ok(row.deleted_at);assert.equal(row.workflow,'EXPIRY');assert.equal(row.pharmacy_id,PA);
 await identity(UA,'service_role');assert.equal((await value("select count(*)::int n from pharmflow_expiry_private.photo_cleanup_jobs where review_id=$1 and state='PENDING'",[ack.review_id])).n,1);
 await identity(UA,'service_role');assert.equal((await value('select count(*)::int n from storage.objects where bucket_id=$1 and name=$2',['pharmflow-needs-review',p.product_photo_path])).n,1);
 await identity(UB);await denied(()=>db.query('select public.delete_pharmflow_expiry_review_v1($1,$2)',[PA,ack.review_id]),/Pharmacy access/);
 await identity();await denied(()=>db.query('select public.delete_pharmflow_expiry_review_v1($1,$2)',[PB,ack.review_id]),/Pharmacy access/);
 await identity(UA,'postgres');const receivingId=uuid();await db.query("insert into public.pharmflow_needs_review_v2(id,pharmacy_id,workflow,gtin,identifier_display,identifier_key,pending_quantity,created_by) values($1,$2,'RECEIVING','REC001','REC001','REC001',1,$3)",[receivingId,PA,UA]);
 await identity();await denied(()=>db.query('select public.delete_pharmflow_expiry_review_v1($1,$2)',[PA,receivingId]),/not found/);
 assert.equal((await value("select count(*)::int n from public.pharmflow_needs_review_v2 where id=$1 and status='PENDING'",[ack.review_id])).n,0);
 await identity(UA,'postgres');
 assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_current_state_v1')).n,inventoryBefore);
 assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_events_v1')).n,eventsBefore);
 assert.equal((await value('select count(*)::int n from public.pharmflow_global_item_identifiers_v2')).n,masterBefore);
 assert.equal((await value('select count(*)::int n from public.test_receiving_ledger')).n,receivingBefore);
 await identity(UA,'service_role');assert.equal((await value("select count(*)::int n from storage.objects where bucket_id='pharmflow-needs-review'")).n,photoCountBefore);
});
test('SQL photo cleanup is durable, server-owned, retryable, idempotent, and exact-path scoped',async()=>{
 await identity();const p=capture('CLEANUP-RETRY','UNKNOWN'),op=await singlePhoto(p),ack=await save(p,op);
 const deleted=(await value('select public.delete_pharmflow_expiry_review_v1($1,$2) r',[PA,ack.review_id])).r;assert.equal(deleted.success,true);
 await identity(UA);await denied(()=>db.query('select * from pharmflow_expiry_private.claim_photo_cleanup_jobs(10)'),/permission denied|worker role required/i);
 await identity(UA,'service_role');let jobs=await db.query('select * from pharmflow_expiry_private.claim_photo_cleanup_jobs(10)');
 assert.ok(jobs.rows.length<=4,'claims are batch bounded');
 let job=jobs.rows.find(row=>row.object_path===p.product_photo_path);assert.ok(job,'exact evidence path is claimed');
 const parallelClaim=await db.query('select * from pharmflow_expiry_private.claim_photo_cleanup_jobs(4)');
 assert.equal(parallelClaim.rows.some(row=>row.job_id===job.job_id),false,'an active lease prevents another worker claim of the same job');
 const tokenA=job.claim_token;
 await db.query('select pharmflow_expiry_private.fail_photo_cleanup_job($1,$2,$3)',[job.job_id,tokenA,'storage_503']);
 assert.equal((await value('select count(*)::int n from storage.objects where name=$1',[p.product_photo_path])).n,1);
 const health=await value("select count(*)::int outstanding,max(attempts)::int attempts,count(*) filter(where last_error_code is not null)::int failures,min(created_at) oldest from pharmflow_expiry_private.photo_cleanup_jobs where review_id=$1 and state<>'DONE'",[ack.review_id]);
 assert.deepEqual(health,{outstanding:1,attempts:1,failures:1,oldest:health.oldest});
 assert.ok(health.oldest,'queue health exposes oldest outstanding job age anchor');
 await identity(UA,'postgres');await db.query("update pharmflow_expiry_private.photo_cleanup_jobs set next_attempt_at=now()-interval '1 second' where job_id=$1",[job.job_id]);
 await identity(UA,'service_role');jobs=await db.query('select * from pharmflow_expiry_private.claim_photo_cleanup_jobs(10)');assert.equal(jobs.rows.length,1);job=jobs.rows[0];
 assert.notEqual(job.claim_token,tokenA,'reclaim issues a fresh fencing token');
 assert.equal((await value('select pharmflow_expiry_private.complete_photo_cleanup_job($1,$2,$3) r',[job.job_id,job.object_path,tokenA])).r,false,'expired worker cannot complete reclaimed work');
 assert.equal((await value('select pharmflow_expiry_private.fail_photo_cleanup_job($1,$2,$3) r',[job.job_id,tokenA,'stale_worker'])).r,false,'expired worker cannot change reclaimed retry state');
 assert.equal((await value('select claim_token from pharmflow_expiry_private.photo_cleanup_jobs where job_id=$1',[job.job_id])).claim_token,job.claim_token);
 await db.query('delete from storage.objects where bucket_id=$1 and name=$2',['pharmflow-needs-review',job.object_path]);
 // Lost completion response: expire the lease, reclaim, and make Storage's 404 path a success.
 await identity(UA,'postgres');await db.query("update pharmflow_expiry_private.photo_cleanup_jobs set claim_until=now()-interval '1 second' where job_id=$1",[job.job_id]);
 await identity(UA,'service_role');jobs=await db.query('select * from pharmflow_expiry_private.claim_photo_cleanup_jobs(10)');job=jobs.rows.find(row=>row.job_id===job.job_id);assert.ok(job);
 await db.query('delete from storage.objects where bucket_id=$1 and name=$2',['pharmflow-needs-review',job.object_path]);
 const complete=(await value('select pharmflow_expiry_private.complete_photo_cleanup_job($1,$2,$3) r',[job.job_id,job.object_path,job.claim_token])).r;assert.equal(complete,true);
 assert.equal((await value("select state from pharmflow_expiry_private.photo_cleanup_jobs where job_id=$1",[job.job_id])).state,'DONE');
 await identity();assert.equal((await value('select public.get_pharmflow_expiry_review_v1($1,$2) r',[PA,ack.review_id])).r.evidence_photo_deleted,true);
 assert.equal((await value('select count(*)::int n from storage.objects where name=$1',[p.product_photo_path])).n,0);
 await identity(UA,'service_role');
 assert.equal((await value('select pharmflow_expiry_private.complete_photo_cleanup_job($1,$2,$3) r',[job.job_id,job.object_path,job.claim_token])).r,false);
});

test('SQL terminal transition queues every registered operation photo, but not pending, foreign-pharmacy, or unrelated photos',async()=>{
 await identity();
 const p=capture('RETAKE-COVERAGE','UNKNOWN'),op=uuid(),otherOp=uuid(),foreignOp=uuid();
 await db.query('select public.reserve_pharmflow_expiry_capture_v1($1,$2)',[PA,op]);
 const paths=[];
 for(const role of ['product','expiry','product','expiry']){
  const path=PA+'/expiry-v1/'+op+'/'+role+'/'+uuid()+'.jpg';paths.push(path);
  await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',path,UA,JSON.stringify({mimetype:'image/jpeg',size:500})]);
 }
 p.product_photo_path=paths[0];p.expiry_photo_path=paths[1];
 const unrelatedPath=PA+'/expiry-v1/'+otherOp+'/product/'+uuid()+'.jpg';
 await db.query('select public.reserve_pharmflow_expiry_capture_v1($1,$2)',[PA,otherOp]);
 await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',unrelatedPath,UA,JSON.stringify({mimetype:'image/jpeg',size:500})]);
 await identity(UB);
 const foreignPath=PB+'/expiry-v1/'+foreignOp+'/product/'+uuid()+'.jpg';
 await db.query('select public.reserve_pharmflow_expiry_capture_v1($1,$2)',[PB,foreignOp]);
 await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',foreignPath,UB,JSON.stringify({mimetype:'image/jpeg',size:500})]);
 await identity();const ack=await save(p,op);
 await identity(UA,'service_role');
 assert.equal((await value('select count(*)::int n from pharmflow_expiry_private.photo_cleanup_jobs where operation_id=$1',[op])).n,0,'pending evidence stays unqueued');
 await identity();await db.query('select public.delete_pharmflow_expiry_review_v1($1,$2)',[PA,ack.review_id]);
 await identity(UA,'service_role');
 const queued=await db.query('select pharmacy_id,operation_id,object_path from pharmflow_expiry_private.photo_cleanup_jobs where review_id=$1',[ack.review_id]);
 assert.equal(queued.rows.length,4,'selected evidence and all retakes are queued');
 assert.deepEqual(new Set(queued.rows.map(row=>row.object_path)),new Set(paths));
 assert.ok(queued.rows.every(row=>row.pharmacy_id===PA&&row.operation_id===op));
 assert.equal(queued.rows.some(row=>row.object_path===unrelatedPath||row.object_path===foreignPath),false);
 assert.equal((await value('select count(*)::int n from storage.objects where name=any($1::text[])',[paths])).n,4,'terminal transition queues but does not synchronously remove photos');
 assert.equal((await value('select count(*)::int n from storage.objects where name=$1',[unrelatedPath])).n,1);
 assert.equal((await value('select count(*)::int n from storage.objects where name=$1',[foreignPath])).n,1);
 await processQueuedReviewPhotos(ack.review_id,4);
 assert.equal((await value('select count(*)::int n from pharmflow_expiry_private.photo_cleanup_jobs where review_id=$1 and state<>\'DONE\'',[ack.review_id])).n,0);
 assert.equal((await value('select count(*)::int n from storage.objects where name=any($1::text[])',[paths])).n,0);
 assert.equal((await value('select count(*)::int n from storage.objects where name=$1',[unrelatedPath])).n,1);
 assert.equal((await value('select count(*)::int n from storage.objects where name=$1',[foreignPath])).n,1);
});
test('SQL ordinary member resolution maps pharmacy-locally and atomically commits inventory, event, audit, and cleanup',async()=>{
 await identity();const p=capture('RESOLVE-ONCE','UNKNOWN'),op=await singlePhoto(p);
 const retakePath=PA+'/expiry-v1/'+op+'/product/'+uuid()+'.jpg';
 await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',retakePath,UA,JSON.stringify({mimetype:'image/jpeg',size:500})]);
 const ack=await save(p,op);
 const inventoryBefore=Number((await value('select count(*)::int n from public.pharmflow_expiry_current_state_v1')).n);
 const eventsBefore=Number((await value('select count(*)::int n from public.pharmflow_expiry_events_v1')).n);
 await identity(UA,'postgres');const globalMappingsBefore=Number((await value('select count(*)::int n from public.pharmflow_global_item_identifiers_v2')).n);await identity();
 const listed=await db.query('select public.list_pharmflow_expiry_reviews_v1($1,$2,$3,$4) as r',[PA,'PENDING',250,0]);assert.ok(listed.rows.some(row=>row.r.review_id===ack.review_id));
 assert.ok(Number((await value('select public.count_pharmflow_expiry_reviews_v1($1) as n',[PA])).n)>=1);
 await identity(UB);await denied(()=>db.query('select public.count_pharmflow_expiry_reviews_v1($1)',[PA]),/Pharmacy access/);
 await identity(UB);await denied(()=>db.query('select public.resolve_pharmflow_expiry_review_v1($1,$2,$3,$4,$5)',[PA,ack.review_id,uuid(),'TARGET-ITEM','test']),/Pharmacy access/);
 await identity(UA);const resolutionOp=uuid();const first=(await value('select public.resolve_pharmflow_expiry_review_v1($1,$2,$3,$4,$5) as r',[PA,ack.review_id,resolutionOp,'TARGET-ITEM',''])).r;
 assert.equal(first.success,true);assert.equal(first.item_code,'TARGET-ITEM');
 assert.equal(first.scope,'PHARMACY');assert.ok(first.state_id&&first.event_id);
 const retry=(await value('select public.resolve_pharmflow_expiry_review_v1($1,$2,$3,$4,$5) as r',[PA,ack.review_id,resolutionOp,'TARGET-ITEM',''])).r;
 assert.equal(retry.already_resolved,true);assert.equal(retry.operation_id,resolutionOp);
 assert.equal(retry.state_id,first.state_id);assert.equal(retry.event_id,first.event_id);
 await denied(()=>db.query('select public.resolve_pharmflow_expiry_review_v1($1,$2,$3,$4,$5)',[PA,ack.review_id,uuid(),'TARGET-ITEM','']),/another operation or item/i);
 await denied(()=>db.query('select public.resolve_pharmflow_expiry_review_v1($1,$2,$3,$4,$5)',[PA,ack.review_id,resolutionOp,'OTHER-ITEM','']),/another operation or item/i);
 await identity(UA,'postgres');assert.equal((await value('select count(*)::int n from public.pharmflow_needs_review_v2 where id=$1 and status=\'RESOLVED\' and resolved_item_code=\'TARGET-ITEM\'',[ack.review_id])).n,1);
 const state=await value('select * from public.pharmflow_expiry_current_state_v1 where id=$1',[first.state_id]);
 assert.equal(state.pharmacy_id,PA);assert.equal(state.item_code,'TARGET-ITEM');assert.equal(state.identifier_display,'RESOLVE-ONCE');assert.equal(state.batch_no,null);assert.equal(state.expiry_month,8);assert.equal(state.expiry_year,2028);assert.equal(state.verified_quantity,3);
 assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_events_v1 where id=$1 and event_type=\'CAPTURE\'',[first.event_id])).n,1);
 assert.equal((await value('select count(*)::int n from public.pharmflow_pharmacy_gtin_v1 where pharmacy_id=$1 and identifier_key=\'RESOLVE-ONCE\' and item_code=\'TARGET-ITEM\'',[PA])).n,1);
 assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_review_resolution_audit_v1 where review_id=$1 and operation_id=$2 and performed_by=$3',[ack.review_id,resolutionOp,UA])).n,1);
 await identity(UA);await denied(()=>db.query('select public.delete_pharmflow_expiry_review_v1($1,$2)',[PA,ack.review_id]),/Only pending Expiry review/);
 await identity(UA,'service_role');
 const resolveJobs=await db.query("select object_path from pharmflow_expiry_private.photo_cleanup_jobs where review_id=$1 and state='PENDING'",[ack.review_id]);
 assert.deepEqual(new Set(resolveJobs.rows.map(row=>row.object_path)),new Set([p.product_photo_path,retakePath]));
 assert.equal((await value('select count(*)::int n from storage.objects where name=$1',[p.product_photo_path])).n,1);
 assert.equal((await value('select count(*)::int n from storage.objects where name=$1',[retakePath])).n,1);
 await identity(UA,'postgres');
 assert.equal((await value('select count(*)::int n from public.pharmflow_global_item_identifiers_v2')).n,globalMappingsBefore,'Global Master mapping set is unchanged');
 assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_current_state_v1')).n,inventoryBefore+1);
 assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_events_v1')).n,eventsBefore+1);
 await processQueuedReviewPhotos(ack.review_id,2);
 assert.equal((await value('select count(*)::int n from storage.objects where name=any($1::text[])',[[p.product_photo_path,retakePath]])).n,0);
});

test('SQL Global Master add preserves exact same-operation audit retries and rejects operation-ID reuse',async()=>{
 await identity(AD);const operation=uuid();
 const first=(await value("select public.add_pharmflow_global_identifier_v2($1,'AUDIT-ONCE','TARGET-ITEM','review reason') as r",[operation])).r;
 assert.equal(first.success,true);assert.equal(first.itemCode,'TARGET-ITEM');
 const retry=(await value("select public.add_pharmflow_global_identifier_v2($1,'AUDIT-ONCE','TARGET-ITEM','review reason') as r",[operation])).r;
 assert.equal(retry.success,true);assert.equal(retry.identifierId,first.identifierId);
 await denied(()=>db.query("select public.add_pharmflow_global_identifier_v2($1,'AUDIT-OTHER','TARGET-ITEM','different mapping')",[operation]),/different identifier mapping operation/i);
 await denied(()=>db.query("select public.add_pharmflow_global_identifier_v2($1,'AUDIT-ONCE','TARGET-ITEM','different reason')",[operation]),/different identifier mapping operation/i);
 await identity(UA,'postgres');assert.equal((await value('select count(*)::int n from public.pharmflow_identifier_mapping_audit_v1 where operation_id=$1',[operation])).n,1);
 assert.equal((await value("select count(*)::int n from public.pharmflow_global_item_identifiers_v2 where identifier_key in ('AUDIT-ONCE','AUDIT-OTHER')")).n,1);
});

test('SQL historical resolved cases without a recorded resolution operation fail closed',async()=>{
 await identity();const p=capture('LEGACY-RESOLVED','UNKNOWN'),op=await singlePhoto(p),ack=await save(p,op);
 await identity(AD,'postgres');await db.query("update public.pharmflow_needs_review_v2 set status='RESOLVED',resolved_by=$1,resolved_item_code='TARGET-ITEM',resolved_item_name='Synthetic Global Item',resolved_at=now() where id=$2",[AD,ack.review_id]);
 await identity(AD);
 const inventoryBefore=Number((await value('select count(*)::int n from public.pharmflow_expiry_current_state_v1')).n);
 await denied(()=>db.query('select public.resolve_pharmflow_expiry_review_v1($1,$2,$3,$4,$5)',[PA,ack.review_id,uuid(),'TARGET-ITEM','legacy retry']),/another operation or item/i);
 await identity(UA,'postgres');assert.equal((await value('select resolution_transaction_id from public.pharmflow_needs_review_v2 where id=$1',[ack.review_id])).resolution_transaction_id,null);
 assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_current_state_v1')).n,inventoryBefore);
});
test('SQL conflicting pharmacy-local mapping leaves review pending and adds no audit or inventory record',async()=>{
 await identity(UA,'postgres');await db.query("insert into public.pharmflow_pharmacy_gtin_v1(pharmacy_id,gtin,identifier_display,identifier_key,item_code,item_name,source) values($1,'CONFLICT','CONFLICT','CONFLICT','OTHER-ITEM','Other item','TEST')",[PA]);
 await identity();const p=capture('CONFLICT','UNKNOWN'),op=await singlePhoto(p),ack=await save(p,op);
 const inventoryBefore=Number((await value('select count(*)::int n from public.pharmflow_expiry_current_state_v1')).n);
 await identity(UA);await denied(()=>db.query('select public.resolve_pharmflow_expiry_review_v1($1,$2,$3,$4,$5)',[PA,ack.review_id,uuid(),'TARGET-ITEM','']),/already mapped to another item in this pharmacy/i);
 await identity(UA,'postgres');assert.equal((await value('select status from public.pharmflow_needs_review_v2 where id=$1',[ack.review_id])).status,'PENDING');
 assert.equal((await value("select count(*)::int n from public.pharmflow_expiry_review_resolution_audit_v1 where identifier_key='CONFLICT'")).n,0);
 assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_current_state_v1')).n,inventoryBefore);
});
test('SQL required fields, raw identity mismatch and bad dates reject atomically',async()=>{
 await identity();for(const change of [{raw_scan:null},{identifier_display:'0030'},{device_id:''},{quantity:0},{quantity:1.5},{expiry_month:13},{expiry_month:null},{worker_id:null},{batch_no:7},{sample_serial:7}]){const p={...capture(),...change};await denied(()=>save(p),/required|match|Invalid|invalid|Worker|integer|Integer/);}
 const p=capture();delete p.raw_scan;await denied(()=>save(p),/Complete capture/);
 await identity(UA,'postgres');assert.equal((await value("select count(*)::int n from pharmflow_expiry_private.operations where status='COMMITTING'")).n,0);
});
test('SQL GS1 mismatches and unsupported/malformed input reject; optional manual batch works',async()=>{
 await identity();const p=capture('04065272072977');Object.assign(p,{scan_format:'GS1',raw_scan:'(01)04065272072977(17)280831(10)BATCH',expiry_month:8,expiry_year:2028,batch_no:'BATCH'});await save(p);
 for(const change of [{batch_no:'OTHER'},{expiry_month:7},{raw_scan:'(01)04065272072977(17)280832(10)BATCH'},{raw_scan:'(01)04065272072977(99)UNSUPPORTED'}])await denied(()=>save({...p,...change}),/GS1|range/);
 const manual=capture('MANUAL1');manual.batch_no='MANUAL-LOT';await save(manual);
});
test('SQL photo replacement/rename/deletion is blocked before resolution, including another member/admin',async()=>{
 await identity();const p=capture('PHOTO1','UNKNOWN'),op=await photos(p),r=await save(p,op);
 await denied(()=>db.query('update storage.objects set metadata=$1 where name=$2',[{mimetype:'image/jpeg',size:20},p.product_photo_path]),/immutable/);
 await denied(()=>db.query('update storage.objects set name=$1 where name=$2',[`${PA}/unprotected.jpg`,p.product_photo_path]),/immutable/);
 await identity(AD);await denied(()=>db.query('delete from storage.objects where name=$1',[p.product_photo_path]),/cleanup authorization/);
 await denied(()=>db.query('select public.authorize_pharmflow_expiry_photo_cleanup_v1($1,$2)',[PA,r.review_id]),/Successfully resolved/);
 await identity(UB);const objects=await db.query('select * from storage.objects where name=$1',[p.product_photo_path]);assert.equal(objects.rows.length,0);
});
test('SQL safe retake deletes only uploader staging object; missing/type-invalid/wrong-role photos reject',async()=>{
 await identity();const p=capture('RETAKE1','UNKNOWN'),op=await photos(p);await db.query('delete from storage.objects where name=$1',[p.product_photo_path]);await denied(()=>save(p,op),/Uploaded role-correct evidence photo required/);
 const path=`${PA}/expiry-v1/${op}/product/${uuid()}.jpg`;
 await denied(()=>db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',path,UA,JSON.stringify({size:100})]),/type or size/);
 await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',path,UA,JSON.stringify({size:100,mimetype:'image/jpeg'})]);p.product_photo_path=path;const reversed={...p,product_photo_path:p.expiry_photo_path,expiry_photo_path:p.product_photo_path};await denied(()=>save(reversed,op),/role-correct/);await save(p,op);
});
test('SQL resolved cleanup requires admin authorization; row/audit/photo references survive Storage deletion',async()=>{
 await identity();const p=capture('CLEANUP1','UNKNOWN'),op=await photos(p),r=await save(p,op);
 // Synthetic successful resolution: database owner changes only resolution fields,
 // retaining the real trigger authorization check with an admin JWT identity.
 await identity(AD,'postgres');await db.query("update public.pharmflow_needs_review_v2 set status='RESOLVED',resolved_by=$1,resolved_item_code='RESOLVED1',resolved_item_name='Resolved synthetic product' where id=$2",[AD,r.review_id]);
 await identity();await denied(()=>db.query('select public.authorize_pharmflow_expiry_photo_cleanup_v1($1,$2)',[PA,r.review_id]),/admin/);
 await identity(AD);await denied(()=>db.query('delete from storage.objects where name=$1',[p.product_photo_path]),/cleanup authorization/);const authorization=(await db.query('select public.authorize_pharmflow_expiry_photo_cleanup_v1($1,$2) as r',[PA,r.review_id])).rows[0].r;assert.equal(authorization.paths.length,2);
 for(const path of authorization.paths)await db.query('delete from storage.objects where name=$1',[path]);
 const read=(await db.query('select public.get_pharmflow_expiry_review_v1($1,$2) as r',[PA,r.review_id])).rows[0].r;assert.equal(read.product_photo_deleted,true);assert.equal(read.expiry_photo_deleted,true);assert.equal(read.raw_scan,p.raw_scan);assert.equal(read.status,'RESOLVED');
 await identity(AD,'postgres');await denied(()=>db.query('delete from public.pharmflow_needs_review_v2 where id=$1',[r.review_id]),/audit cannot/);
 await denied(()=>db.query("update public.pharmflow_needs_review_v2 set resolved_item_code='OTHER' where id=$1",[r.review_id]),/attribution is immutable/);
});
test('SQL idempotency payload/owner conflict, uncertain response reconciliation and separate legitimate captures',async()=>{
 await identity();const p=capture('RETRY1'),op=uuid(),r=await save(p,op);await denied(()=>save({...p,quantity:4},op),/payload conflict/);
 assert.deepEqual((await db.query('select public.get_pharmflow_expiry_capture_operation_v1($1,$2) as r',[PA,op])).rows[0].r,r);
 await identity(AD);await denied(()=>save(p,op),/owner conflict/);assert.equal((await db.query('select public.get_pharmflow_expiry_capture_operation_v1($1,$2) as r',[PA,op])).rows[0].r,null);
 await identity();await save(p);await identity(UA,'postgres');assert.equal((await value('select verified_quantity from public.pharmflow_expiry_current_state_v1 where id=$1',[r.state_id])).verified_quantity,6);
});
test('SQL cross-pharmacy/worker, anonymous and System Owner without membership cannot bypass new permissions',async()=>{
 await identity(UB);await denied(()=>save(capture(),uuid(),PA),/Pharmacy access/);await denied(()=>save(capture(),uuid(),PB),/Active pharmacy worker/);
 await identity(SO);await denied(()=>save(capture()),/Pharmacy access/);await identity(null,'anon');await denied(()=>save(capture()),/permission denied/);
 await identity();await denied(()=>db.query('select * from pharmflow_expiry_private.operations'),/permission denied/);
 await identity(UA,'postgres');await db.exec('grant usage on schema pharmflow_expiry_private to rls_probe;grant select on all tables in schema pharmflow_expiry_private to rls_probe;set role rls_probe');assert.equal((await db.query('select * from pharmflow_expiry_private.operations')).rows.length,0);await identity();
});
test('SQL all legacy Expiry capture paths reject; Receiving legacy bodies and legacy media behavior remain unchanged',async()=>{
 await identity();const common=[PA,'ITEM','Product','001234','Medicine',1,8,2028,W];
 await denied(()=>db.query('select * from public.save_pharmacy_expiry_capture($1,$2,$3,$4,$5,$6,$7,$8,$9)',common),/operation-aware/);
 await denied(()=>db.query('select * from public.save_pharmacy_expiry_capture_smart($1,$2,$3,$4,$5,$6,$7,$8,$9)',common),/operation-aware/);
 for(const v of ['v1','v2'])await denied(()=>db.query(`select * from public.save_pharmacy_expiry_verified_state_${v}($1,$2,$3,$4,$5,$6,$7,$8,$9)`,common),/operation-aware/);
 for(const args of [[PA,'EXPIRY','U0030'],[PA,'EXPIRY','U0030',null,null,null,1,8,2028,W,'device','HANDHELD','UNKNOWN_GTIN']])await denied(()=>db.query(`select * from public.save_pharmacy_needs_review(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args),/operation-aware|ambiguous|not unique/);
 // Explicit signatures disambiguate the deployed default overloads.
 const a=[PA,'RECEIVING','001234','raw','ORDER1','Order',2,null,null,null,'device','PC'];
 const q='select * from public.save_pharmacy_needs_review($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::integer,$8::integer,$9::integer,$10::uuid,$11::text,$12::text,$13::text)';
 // The deployed 13-argument legacy body already contains an unqualified
 // created_at/RETURNS TABLE ambiguity. Verify identical behavior rather than
 // quietly fixing unrelated Receiving SQL or treating its error as a regression.
 await denied(()=>db.query(q,[...a,'UNKNOWN_GTIN']),/created_at.*ambiguous/);
 await identity(UA,'postgres');
 const original=JSON.parse(fs.readFileSync('tests/expiry-backend/deployed-save-contracts.json','utf8')).find(d=>d.proname==='save_pharmacy_needs_review'&&d.arguments.includes('p_review_reason'));
 const guarded=original.definition.replace(/\bbegin\b/i,m=>m+"\n if upper(btrim(coalesce(p_workflow,'')))='EXPIRY' then raise exception 'Expiry capture requires operation-aware V3';end if;");
 await db.exec(original.definition+';');await identity();await denied(()=>db.query(q,[...a,'UNKNOWN_GTIN']),/created_at.*ambiguous/);
 await identity(UA,'postgres');await db.exec(guarded+';');await identity();
 console.log('Legacy Receiving 13-argument RPC: same pre-existing created_at ambiguity before/after');
 await identity();const path=`${PA}/legacy-review/photo.jpg`;await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',path,UA,'{}']);await db.query('update storage.objects set metadata=$1 where name=$2',[{size:999},path]);await identity(AD);await db.query('delete from storage.objects where name=$1',[path]);
 await identity(UA,'postgres');assert.equal((await value('select quantity from public.test_receiving_ledger where id=1')).quantity,42);assert.equal((await value("select item_code from public.test_global_master where identifier_display='U0030'")).item_code,'GLOBAL1');
});
test('SQL alternate creators cannot insert incomplete Expiry review or mutate saved evidence',async()=>{
 await identity(UA,'postgres');await denied(()=>db.query("insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,gtin,identifier_display,identifier_key,pending_quantity,created_by) values($1,'EXPIRY','U0030','U0030','U0030',1,$2)",[PA,UA]),/complete operation/);
 await identity();const p=capture('IMMUTABLE1','UNKNOWN'),op=await photos(p),r=await save(p,op);await identity(UA,'postgres');await denied(()=>db.query('update public.pharmflow_needs_review_v2 set pending_quantity=9 where id=$1',[r.review_id]),/immutable/);
});
test('SQL known capture cannot orphan uploaded review photos',async()=>{
 await identity();const p=capture('ORPHAN1'),op=await photos(p);await denied(()=>save(p,op),/cannot orphan/);
});

test('Native PostgreSQL independent-connection duplicate and same-item concurrency', {skip:!process.env.PHARMFLOW_LOCAL_PG_URL?'NOT RUN: native PostgreSQL unavailable; PGlite has one connection':false},async()=>{
 const {Client}=require('pg'),clients=[new Client({connectionString:process.env.PHARMFLOW_LOCAL_PG_URL}),new Client({connectionString:process.env.PHARMFLOW_LOCAL_PG_URL})];
 try{
  for(const c of clients){await c.connect();await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[UA]);}
  const p=capture('NATIVE-DUPLICATE'),op=uuid(),q='select public.save_pharmflow_expiry_capture_v3($1,$2,$3::jsonb) as r';
  const results=await Promise.all(clients.map(c=>c.query(q,[PA,op,JSON.stringify(p)])));assert.deepEqual(results[0].rows[0].r,results[1].rows[0].r);
  const p2=capture('NATIVE-ADDITIVE');await Promise.all(clients.map(c=>c.query(q,[PA,uuid(),JSON.stringify(p2)])));
  await identity(UA,'postgres');assert.equal((await value("select verified_quantity from public.pharmflow_expiry_current_state_v1 where item_code='ITEM-NATIVE-ADDITIVE'")).verified_quantity,6);
  assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_events_v1 where state_id=$1',[results[0].rows[0].r.state_id])).n,1);
 }finally{for(const c of clients)await c.end();}
});
test('Client adapter executes actual operation SQL, two media rows and authorized review read',async()=>{
 const vm=require('node:vm'),context={Blob,structuredClone};vm.createContext(context);vm.runInContext(fs.readFileSync('js/expiry-operation.js','utf8')+'\nthis.api=ExpiryOperation;',context);
 await identity();const operation={id:uuid(),pharmacyId:PA},p=capture('S00110','UNKNOWN');let saves=0;
 const rpc=async(name,args)=>{
  if(name==='reserve_pharmflow_expiry_capture_v1')return (await db.query('select public.reserve_pharmflow_expiry_capture_v1($1,$2) r',[args.p_pharmacy_id,args.p_operation_id])).rows[0].r;
  if(name==='save_pharmflow_expiry_capture_v3'){saves++;return save(args.p_capture,args.p_operation_id,args.p_pharmacy_id);}
  if(name==='get_pharmflow_expiry_review_v1')return (await db.query('select public.get_pharmflow_expiry_review_v1($1,$2) r',[args.p_pharmacy_id,args.p_review_id])).rows[0].r;
  throw new Error('Unexpected RPC '+name);
 };
 const input={rpc,upload:async(path,file)=>db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4::jsonb)',['pharmflow-needs-review',path,UA,JSON.stringify({mimetype:file.type,size:file.size})]),persist:async()=>{},scope:UA+'/'+PA,currentScope:()=>UA+'/'+PA,operation,payload:p,photos:{product:new Blob(['product'],{type:'image/jpeg'}),expiry:new Blob(['expiry'],{type:'image/png'})},uuid};
 const first=await context.api.save(input),second=await context.api.save(input);assert.equal(first.review_id,second.review_id);assert.equal(saves,2);
 assert.equal((await value('select count(*)::int n from public.pharmflow_needs_review_v2 where operation_id=$1',[operation.id])).n,1);
 await identity(UB);await assert.rejects(context.api.readReview(PA,first.review_id,rpc),/Pharmacy access/);await identity();
});

test('OFFLINE ONLY: coordinated AI11 private-helper proposal preserves raw scan, permissions and save idempotency',async()=>{
 const vm=require('node:vm'),context={Blob,structuredClone};vm.createContext(context);vm.runInContext(fs.readFileSync('js/expiry-operation.js','utf8')+'\nthis.api=ExpiryOperation;',context);
 const raw='010012345678901210000ABC\x1d112512311730053121000123ABC4567',facts=context.api.scanFacts(raw);
 const p={...capture(facts.identifier),raw_scan:raw,scan_format:'GS1',batch_no:facts['10'],sample_serial:facts['21'],expiry_month:5,expiry_year:2030};
 await identity();await denied(()=>save(p),/Unsupported GS1 AI/);
 await identity(UA,'postgres');
 const original=(await value("select pg_get_functiondef('pharmflow_expiry_private.scan_facts(text,text)'::regprocedure) definition")).definition;
 const publicBefore=(await value("select pg_get_functiondef('public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb)'::regprocedure) definition")).definition;
 const permissions=await value("select proacl::text acl from pg_proc where oid='pharmflow_expiry_private.scan_facts(text,text)'::regprocedure");
 try{
  await db.exec(fs.readFileSync('supabase/migrations/20261011200941_expiry_private_ai11_validated_production_date.sql','utf8'));
  assert.deepEqual(await value("select proacl::text acl from pg_proc where oid='pharmflow_expiry_private.scan_facts(text,text)'::regprocedure"),permissions);
  assert.equal((await value("select pg_get_functiondef('public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb)'::regprocedure) definition")).definition,publicBefore);
  for(const id of ['E0029-L','U0030','S00110','1234A','1234','001234','04065272072977']){
   assert.equal((await value('select pharmflow_expiry_private.scan_facts($1,$2) facts',[id,'PLAIN'])).facts.identifier,id);
  }
  const fields={'01':'00123456789012','10':'000ABC','11':'251231','17':'300531','21':'000123ABC4567'};
  function orders(xs){return xs.length?xs.flatMap((x,i)=>orders(xs.filter((_,j)=>i!==j)).map(rest=>[x,...rest])):[[]];}
  for(const order of orders(Object.keys(fields))){
   const scan=order.map((ai,i)=>ai+fields[ai]+(['10','21'].includes(ai)&&i<order.length-1?'\x1d':'')).join('');
   const expected=context.api.scanFacts(scan),actual=(await value('select pharmflow_expiry_private.scan_facts($1,$2) facts',[scan,'GS1'])).facts;
   for(const ai of Object.keys(fields))assert.equal(actual[ai],expected[ai]);
  }
  const server=(await value('select pharmflow_expiry_private.scan_facts($1,$2) facts',[raw,'GS1'])).facts;
  for(const ai of ['01','10','11','17','21'])assert.equal(server[ai],facts[ai]);
  for(const bad of [raw.replace('251231','250229'),raw.replace('251231','251200'),raw.replace('17300531',''),raw.replace('\x1d','')])await denied(()=>db.query('select pharmflow_expiry_private.scan_facts($1,$2)',[bad,'GS1']),/production date|expiry AI 17|Invalid GS1|Unsupported GS1/);
  await identity();const operation={id:uuid(),pharmacyId:PA},rpc=async(name,args)=>name==='reserve_pharmflow_expiry_capture_v1'?(await value('select public.reserve_pharmflow_expiry_capture_v1($1,$2) r',[args.p_pharmacy_id,args.p_operation_id])).r:save(args.p_capture,args.p_operation_id,args.p_pharmacy_id);
  const input={rpc,persist:async()=>{},scope:UA+'/'+PA,currentScope:()=>UA+'/'+PA,operation,payload:p};
  const first=await context.api.save(input),second=await context.api.save(input);assert.deepEqual(first,second);
  await identity(UA,'postgres');const op=await value('select payload from pharmflow_expiry_private.operations where operation_id=$1',[operation.id]);assert.equal(op.payload.raw_scan,raw);
  const row=await value('select * from public.pharmflow_expiry_current_state_v1 where id=$1',[first.state_id]);assert.equal(row.expiry_month,5);assert.equal(row.expiry_year,2030);assert.equal(row.verified_quantity,3);assert.equal(row.batch_no,'000ABC');assert.equal(row.sample_serial,'000123ABC4567');assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_events_v1 where state_id=$1',[first.state_id])).n,1);
  await identity(UB);await denied(()=>save(p,uuid(),PA),/Pharmacy access/);
 }finally{await identity(UA,'postgres');await db.exec(original+';');await identity();}
});

test('FINAL GATE: signed login session, optional evidence, ten authoritative receipts and operation identity moves',async()=>{
 await identity(UA,'postgres');
 await db.exec(fs.readFileSync('supabase/migrations/20261011200941_expiry_private_ai11_validated_production_date.sql','utf8'));
 await db.exec(`create table auth.sessions(id uuid primary key,user_id uuid not null,created_at timestamptz default now(),not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`);
 const before=await value("select md5(string_agg(row_to_json(o)::text,'' order by operation_id)) h from pharmflow_expiry_private.operations o");
 await db.exec(fs.readFileSync('proposals/staging/expiry_final_handheld_gate.sql','utf8'));
 assert.deepEqual(await value("select md5(string_agg(row_to_json(o)::text,'' order by operation_id)) h from pharmflow_expiry_private.operations o"),before);
 const sid=uuid();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,UA]);await identity();
 const jwt=async(id=sid,exp=Math.floor(Date.now()/1000)+3600)=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:id,exp})]);await jwt();
 const open=async()=>(await value('select public.get_pharmflow_expiry_auth_session_v1($1,$2) r',[PA,'synthetic-device'])).r;
 const session=await open();assert.equal((await open()).session_id,session.session_id);
 const save2=async(p,op=uuid())=>(await value('select public.save_pharmflow_expiry_session_capture_v2($1,$2,$3,$4::jsonb) r',[PA,session.session_id,op,JSON.stringify(p)])).r;
 const adjust=async(op,rev,fields,request=uuid())=>(await value('select public.correct_pharmflow_expiry_session_v2($1,$2,$3,$4,$5,$6::jsonb) r',[PA,session.session_id,op,request,rev,JSON.stringify(fields)])).r;
 for(const [name,note,photo] of [['NONE',false,false],['NOTE',true,false],['PHOTO',false,true],['BOTH',true,true]]){
  const p=capture('OPTIONAL-'+name,'UNKNOWN');if(note)p.identification_note='Panadol';const op=photo?await singlePhoto(p):uuid();const ack=await save2(p,op);assert.ok(ack.review_id);assert.deepEqual(ack.confirmed_capture,p);assert.deepEqual(await save2(p,op),ack);
  const row=(await value('select public.get_pharmflow_expiry_review_v1($1,$2) r',[PA,ack.review_id])).r;assert.equal(row.identifier_display,p.identifier_display);assert.equal(row.identification_note,note?'Panadol':undefined);assert.equal(row.status,'PENDING');assert.equal(row.product_photo_path,photo?p.product_photo_path:null);
 }
 const p=capture('MOVING-OP'),op=uuid(),second=uuid();await save2(p,op);await save2(p,second);
 const replacement={quantity:2,batch_no:null,expiry_month:8,expiry_year:2028},request=uuid();const corrected=await adjust(op,0,replacement,request);assert.deepEqual(await adjust(op,0,replacement,request),corrected);await denied(()=>adjust(op,0,replacement),/Stale revision/);
 const moved=await adjust(op,1,{quantity:2,batch_no:'NEW-LOT',expiry_month:9,expiry_year:2029});await identity(UA,'postgres');assert.equal((await value('select verified_quantity q from public.pharmflow_expiry_current_state_v1 where id=$1',[moved.state_id])).q,2);assert.equal((await value("select verified_quantity q from public.pharmflow_expiry_current_state_v1 where item_code=$1 and batch_key='' and expiry_month=8",[p.item_code])).q,3);await identity();
 await adjust(op,2,{quantity:0,batch_no:'NEW-LOT',expiry_month:9,expiry_year:2029});
 const u=capture('OPTIONAL-EDIT','UNKNOWN'),uid=uuid(),ua=await save2(u,uid);await adjust(uid,0,{quantity:4,batch_no:'REVIEW-LOT',expiry_month:11,expiry_year:2030});
 const resolved=(await value('select public.resolve_pharmflow_expiry_review_v1($1,$2,$3,$4,$5) r',[PA,ua.review_id,uuid(),'TARGET-ITEM','Final gate'])).r;await identity(UA,'postgres');const state=await value('select * from public.pharmflow_expiry_current_state_v1 where id=$1',[resolved.state_id]);assert.equal(state.verified_quantity,4);assert.equal(state.batch_no,'REVIEW-LOT');assert.equal(state.expiry_month,11);assert.equal(state.expiry_year,2030);assert.notEqual(state.item_name,'Panadol');await identity();await denied(()=>adjust(uid,1,{quantity:1,batch_no:null,expiry_month:8,expiry_year:2028}),/Only pending/);
 for(let i=0;i<12;i++)await save2(capture('LIMIT-'+i));const rows=(await value('select public.list_pharmflow_expiry_session_v2($1,$2) r',[PA,session.session_id])).r;assert.equal(rows.length,10);assert.equal(new Set(rows.map(r=>r.operation_id)).size,10);
 const bsid=uuid();await identity(UA,'postgres');await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[bsid,UB]);await identity(UB);await jwt(bsid);await denied(()=>open(),/Pharmacy/);await identity();await jwt();
 await jwt(sid,1);await denied(()=>open(),/expired or revoked/);await jwt();
 await denied(()=>db.query('select public.correct_pharmflow_expiry_session_v1($1,$2,$3,$4,0,1)',[PA,session.session_id,op,uuid()]),/permission denied/);
 await db.query('select public.close_pharmflow_expiry_auth_session_v1()');await denied(()=>open(),/Session closed/);await denied(()=>adjust(second,0,replacement),/Session closed/);
 const next=uuid();await identity(UA,'postgres');await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[next,UA]);await identity();await jwt(next);assert.notEqual((await open()).session_id,session.session_id);await denied(()=>adjust(second,0,replacement),/scope mismatch/);
 await identity(UA,'postgres');await db.query('delete from auth.sessions where id=$1',[next]);await identity();await denied(()=>open(),/expired or revoked/);
});

test('FINAL THREE: History excludes deleted before ten, refills newest-first, retains audit and signed scope',async()=>{
 await identity(UA,'postgres');
 const snapshot=()=>value("select md5(coalesce(string_agg(to_jsonb(o)::text,'' order by operation_id),'')) h,count(*)::int n from pharmflow_expiry_private.operations o");
 const before=await snapshot(),security=await value("select proacl::text acl,proowner,prosecdef,proconfig from pg_proc where oid='public.list_pharmflow_expiry_session_v2(uuid,uuid)'::regprocedure");
 await db.exec(fs.readFileSync('proposals/staging/expiry_history_active_only.sql','utf8'));
 assert.deepEqual(await snapshot(),before);assert.deepEqual(await value("select proacl::text acl,proowner,prosecdef,proconfig from pg_proc where oid='public.list_pharmflow_expiry_session_v2(uuid,uuid)'::regprocedure"),security);
 const sid=uuid();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,UA]);await identity();const jwt=async(id=sid)=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:id,exp:Math.floor(Date.now()/1000)+3600})]);await jwt();
 const session=(await value('select public.get_pharmflow_expiry_auth_session_v1($1,$2) r',[PA,'synthetic-device'])).r;
 const save2=async(p,id=uuid())=>({id,ack:(await value('select public.save_pharmflow_expiry_session_capture_v2($1,$2,$3,$4::jsonb) r',[PA,session.session_id,id,JSON.stringify(p)])).r});
 const list=async()=>(await value('select public.list_pharmflow_expiry_session_v2($1,$2) r',[PA,session.session_id])).r;
 const ids=[];for(let i=0;i<15;i++)ids.push((await save2(capture('ACTIVE-'+i))).id);
 const top=await list();assert.equal(top.length,10);for(let i=1;i<top.length;i++)assert.ok(top[i-1].captured_at>=top[i].captured_at);
 await identity(UA,'postgres');const all=(await db.query('select o.operation_id from pharmflow_expiry_private.operations o join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>\'event_id\')::uuid where o.operation_id=any($1::uuid[]) order by e.occurred_at desc,o.operation_id desc',[ids])).rows.map(r=>r.operation_id);assert.deepEqual(top.map(r=>r.operation_id),all.slice(0,10));
 const original=await value('select payload,result from pharmflow_expiry_private.operations where operation_id=$1',[top[0].operation_id]);await identity();
 const correction={quantity:0,batch_no:null,expiry_month:8,expiry_year:2028};await db.query('select public.correct_pharmflow_expiry_session_v2($1,$2,$3,$4,0,$5::jsonb)',[PA,session.session_id,top[0].operation_id,uuid(),JSON.stringify(correction)]);
 const after=await list();assert.deepEqual(after.map(r=>r.operation_id),all.slice(1,11));assert.ok(after.every(r=>r.quantity>0&&r.status!=='DELETED'));
 await identity(UA,'postgres');assert.deepEqual(await value('select payload,result from pharmflow_expiry_private.operations where operation_id=$1',[top[0].operation_id]),original);assert.equal((await value('select count(*)::int n from pharmflow_expiry_private.session_adjustments_v1 where operation_id=$1',[top[0].operation_id])).n,1);assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_events_v1 where id=$1',[original.result.event_id])).n,1);await identity();
 const unknown=await save2(capture('EXTERNAL-DELETION','UNKNOWN'));await db.query('select public.delete_pharmflow_expiry_review_v1($1,$2)',[PA,unknown.ack.review_id]);assert.ok(!(await list()).some(r=>r.operation_id===unknown.id));
 const bsid=uuid();await identity(UA,'postgres');await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[bsid,UB]);await identity(UB);await jwt(bsid);await denied(()=>list(),/Pharmacy|scope mismatch/);await identity();await jwt();await denied(()=>db.query('select public.list_pharmflow_expiry_session_v2($1,$2)',[PB,session.session_id]),/Pharmacy|scope mismatch/);
 const other=uuid();await identity(UA,'postgres');await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[other,UA]);await identity();await jwt(other);await denied(()=>list(),/scope mismatch/);await jwt();await db.query('select public.close_pharmflow_expiry_auth_session_v1()');await denied(()=>list(),/Session closed/);
});

test('Desktop inventory release: zero, retained Resolve, new capture, isolated Restore, stale versions and idempotency',async()=>{
 await identity(UA,'postgres');await db.exec(fs.readFileSync('supabase/migrations/20261013012115_expiry_desktop_inventory_release.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261013012928_expiry_inventory_query_validation.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261013015700_expiry_desktop_receipt_operator_and_readonly.sql','utf8'));
 const sid=uuid();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,UA]);await identity();await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:sid,exp:Math.floor(Date.now()/1000)+3600})]);
 const session=(await value('select public.get_pharmflow_expiry_auth_session_v1($1,$2) r',[PA,'synthetic-device'])).r;
 const p={...capture('DESKTOP-RC'),source:'PC',worker_id:null,quantity:10};
 const savePC=async(q)=>value('select public.save_pharmflow_expiry_desktop_capture_v1($1,$2,$3,$4::jsonb) r',[PA,session.session_id,uuid(),JSON.stringify({...p,quantity:q})]);
 await savePC(10);
 await denied(()=>db.query('select public.query_pharmflow_expiry_inventory_v1($1,$2::jsonb,false,$3,0,null)',[PA,'{}','ADDED']),/Invalid inventory query/);
 const query=async(resolved=false)=> (await value('select public.query_pharmflow_expiry_inventory_v1($1,$2::jsonb,$3) r',[PA,JSON.stringify({search:p.item_code}),resolved])).r;
 const mutate=async(action,row,qty=null,request=uuid())=>(await value('select public.mutate_pharmflow_expiry_inventory_v1($1,$2,$3,$4::jsonb,$5) r',[PA,request,action,JSON.stringify([{id:row.row_id,version:row.version}]),qty])).r;
 let r=(await query()).rows[0];assert.equal(r.quantity,10);
 const zeroRequest=uuid(),zero=await mutate('QUANTITY',r,0,zeroRequest);assert.deepEqual(await mutate('QUANTITY',r,0,zeroRequest),zero);
 assert.equal((await query()).count,1);assert.equal((await query()).rows[0].quantity,0);assert.equal((await query(true)).count,0);
 await denied(()=>mutate('QUANTITY',r,2),/Inventory changed/);
 await savePC(3);r=(await query()).rows[0];assert.equal(r.quantity,3);await mutate('RESOLVE',r);assert.equal((await query()).count,0);
 const archived=(await query(true)).rows[0];assert.equal(archived.quantity,3);
 await savePC(2);assert.equal((await query()).rows[0].quantity,2);assert.equal((await query(true)).rows[0].quantity,3);
 const restoreRequest=uuid(),restored=await mutate('RESTORE',archived,null,restoreRequest);assert.deepEqual(await mutate('RESTORE',archived,null,restoreRequest),restored);
 assert.equal((await query()).rows[0].quantity,5);assert.equal((await query(true)).count,0);
 await denied(()=>mutate('RESTORE',archived),/Inventory changed/);
 const history=(await value('select public.list_pharmflow_expiry_desktop_session_v1($1,$2) r',[PA,session.session_id])).r;assert.equal(history.length,3);assert.ok(history.every(r=>r.worker_name==='Desktop'&&!r.editable));assert.equal(history.reduce((n,x)=>n+x.quantity,0),15);
 const ubSid=uuid();await identity(UA,'postgres');await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[ubSid,UB]);await identity(UB);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:ubSid,exp:Math.floor(Date.now()/1000)+3600})]);await denied(()=>query(),/Pharmacy access/);await identity(UA,'anon');await denied(()=>query(),/permission denied/);
 await identity();await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:sid,exp:Math.floor(Date.now()/1000)+3600})]);
 const rowsBefore=(await value('select count(*)::int n from public.pharmflow_expiry_current_state_v1')).n;
 const malformed=await query();await denied(()=>mutate('QUANTITY',malformed.rows[0],-1),/Nonnegative/);
 assert.equal((await value('select count(*)::int n from public.pharmflow_expiry_current_state_v1')).n,rowsBefore);
});

test('Desktop server paging, shared export filters, exact bulk scope, stale all-or-nothing and session detail beyond ten',async()=>{
 await identity(UA,'postgres');const sid=uuid();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,UA]);await identity();await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:sid,exp:Math.floor(Date.now()/1000)+3600})]);
 const session=(await value('select public.get_pharmflow_expiry_auth_session_v1($1,$2) r',[PA,'synthetic-device'])).r;
 for(let i=0;i<55;i++){const p={...capture('PAGE-RC-'+i),source:'PC',worker_id:null,quantity:1,expiry_month:i%12+1,expiry_year:2027};await db.query('select public.save_pharmflow_expiry_desktop_capture_v1($1,$2,$3,$4::jsonb)',[PA,session.session_id,uuid(),JSON.stringify(p)]);}
 const filter={search:'PAGE-RC',departments:['Medicine']};
 const query=async(off=0,res=false,f=filter)=>(await value('select public.query_pharmflow_expiry_inventory_v1($1,$2::jsonb,$3,$4,$5,$6) r',[PA,JSON.stringify(f),res,'EXPIRY',off,50])).r;
 const first=await query(),second=await query(50);assert.equal(first.count,55);assert.equal(first.units,55);assert.equal(first.rows.length,50);assert.equal(second.rows.length,5);assert.equal(new Set([...first.rows,...second.rows].map(r=>r.row_id)).size,55);
 const exported=(await value('select public.export_pharmflow_expiry_inventory_v1($1,$2::jsonb,false) r',[PA,JSON.stringify(filter)])).r;assert.equal(exported.length,55);for(let i=1;i<exported.length;i++)assert.ok(exported[i-1].expiry_year*12+exported[i-1].expiry_month<=exported[i].expiry_year*12+exported[i].expiry_month);
 const mult={...filter,months:['2027-01','2027-12'],from:2027*12+1,to:2027*12+12};const filtered=await query(0,false,mult);const filteredExport=(await value('select public.export_pharmflow_expiry_inventory_v1($1,$2::jsonb,false) r',[PA,JSON.stringify(mult)])).r;assert.equal(filtered.count,filteredExport.length);assert.ok(filtered.rows.every(r=>[1,12].includes(r.expiry_month)));
 const preview=(await value('select public.select_pharmflow_expiry_inventory_v1($1,$2::jsonb,false) r',[PA,JSON.stringify(filter)])).r;assert.equal(preview.count,55);
 const mutate=async(action,sel,q=null,id=uuid())=>(await value('select public.mutate_pharmflow_expiry_inventory_v1($1,$2,$3,$4::jsonb,$5) r',[PA,id,action,JSON.stringify(sel),q])).r;
 await mutate('QUANTITY',[preview.selection[10]],2);await denied(()=>mutate('RESOLVE',preview.selection),/Inventory changed/);assert.equal((await query()).count,55);assert.equal((await query(0,true)).count,0);
 const fresh=(await value('select public.select_pharmflow_expiry_inventory_v1($1,$2::jsonb,false) r',[PA,JSON.stringify(filter)])).r;const request=uuid(),result=await mutate('RESOLVE',fresh.selection,null,request);assert.equal(result.count,55);assert.deepEqual(await mutate('RESOLVE',fresh.selection,null,request),result);assert.equal((await query()).count,0);assert.equal((await query(0,true)).count,55);
 const one=(await query(0,true)).rows[0];await mutate('RESTORE',[{id:one.row_id,version:one.version}]);assert.equal((await query()).count,1);assert.equal((await query(0,true)).count,54);
 const history=(await value('select public.list_pharmflow_expiry_desktop_session_v1($1,$2) r',[PA,session.session_id])).r;assert.equal(history.length,55);assert.equal(history.reduce((n,r)=>n+r.quantity,0),55);
 const summary=(await value('select public.summary_pharmflow_expiry_inventory_v1($1) r',[PA])).r;assert.equal(summary.length,4);assert.equal(summary.find(p=>p.key==='NEXT6').to-summary.find(p=>p.key==='NEXT6').from,5);
 const expired=summary.find(p=>p.key==='EXPIRED');const actual=(await value("select count(*)::int n from public.pharmflow_expiry_current_state_v1 where pharmacy_id=$1 and status='ACTIVE' and expiry_year*12+expiry_month<=$2",[PA,expired.to])).n;assert.equal(expired.count,actual);
});

test('Existing single-capture contract preserves historical 5 through +2, edit4, delete and idempotent retry; not an atomic group contract',async()=>{
 await identity(UA,'postgres');const oldAuth=uuid();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[oldAuth,UA]);await identity();
 const jwtFor=async sid=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:sid,exp:Math.floor(Date.now()/1000)+3600})]);await jwtFor(oldAuth);
 const oldSession=(await value('select public.get_pharmflow_expiry_auth_session_v1($1,$2) r',[PA,'history-device'])).r;
 const p={...capture('ROUND2-HISTORY'),source:'PC',worker_id:null,quantity:5,device_id:'history-device',batch_no:'BATCH A',sample_serial:'OLD-SERIAL'};const oldOp=uuid();
 const oldAck=(await value('select public.save_pharmflow_expiry_desktop_capture_v1($1,$2,$3,$4::jsonb) r',[PA,oldSession.session_id,oldOp,JSON.stringify(p)])).r;
 await identity(UA,'postgres');const before=await value('select payload,result from pharmflow_expiry_private.operations where operation_id=$1',[oldOp]);const nextAuth=uuid();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[nextAuth,UA]);await identity();await jwtFor(nextAuth);
 const nextSession=(await value('select public.get_pharmflow_expiry_auth_session_v1($1,$2) r',[PA,'new-device'])).r;const newOp=uuid();await db.query('select public.save_pharmflow_expiry_desktop_capture_v1($1,$2,$3,$4::jsonb)',[PA,nextSession.session_id,newOp,JSON.stringify({...p,device_id:'new-device',quantity:2,sample_serial:'NEW-SERIAL'})]);
 const state=async()=> (await value('select verified_quantity q from public.pharmflow_expiry_current_state_v1 where id=$1',[oldAck.state_id])).q;
 const receipts=async()=> (await value('select public.list_pharmflow_expiry_desktop_session_v1($1,$2) r',[PA,nextSession.session_id])).r;
 assert.equal(await state(),7);assert.equal((await receipts()).reduce((n,r)=>n+r.quantity,0),2);
 const edit=uuid(),correction={quantity:4,batch_no:p.batch_no,expiry_month:p.expiry_month,expiry_year:p.expiry_year};
 const correct=async(id,rev,c)=> (await value('select public.correct_pharmflow_expiry_desktop_session_v1($1,$2,$3,$4,$5,$6::jsonb) r',[PA,nextSession.session_id,newOp,id,rev,JSON.stringify(c)])).r;
 const ack=await correct(edit,0,correction);assert.equal(await state(),9);assert.deepEqual(await correct(edit,0,correction),ack);assert.equal(await state(),9);
 const cancel=uuid(),zero={...correction,quantity:0};const removed=await correct(cancel,1,zero);assert.equal(await state(),5);assert.deepEqual(await correct(cancel,1,zero),removed);assert.equal(await state(),5);
 assert.equal((await receipts()).filter(r=>r.quantity>0).length,0);
 await identity(UA,'postgres');assert.deepEqual(await value('select payload,result from pharmflow_expiry_private.operations where operation_id=$1',[oldOp]),before);assert.equal((await value('select quantity q from pharmflow_expiry_private.session_captures_v1 where operation_id=$1',[oldOp])).q,5);assert.equal((await value('select payload->>\'sample_serial\' s from pharmflow_expiry_private.operations where operation_id=$1',[oldOp])).s,'OLD-SERIAL');
});

test('REVIEW ONLY group RPC proposal: atomic 5+2→7, edit4→9, delete→5; serials, stale completeness, scope, rollback and retries',async()=>{
 await identity(UA,'postgres');await db.exec(fs.readFileSync('proposals/staging/expiry-group-correction-proposed.sql','utf8'));
 const jwtFor=async sid=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:sid,exp:Math.floor(Date.now()/1000)+3600})]);
 const open=async device=>{await identity(UA,'postgres');const sid=uuid();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,UA]);await identity();await jwtFor(sid);return (await value('select public.get_pharmflow_expiry_auth_session_v1($1,$2) r',[PA,device])).r;};
 const old=await open('group-old'),p={...capture('ENTERPRISE-GROUP'),source:'PC',worker_id:null,quantity:5,device_id:'group-old',batch_no:'GROUP A',sample_serial:'HISTORY'};
 const oldOp=uuid(),oldAck=(await value('select public.save_pharmflow_expiry_desktop_capture_v1($1,$2,$3,$4::jsonb) r',[PA,old.session_id,oldOp,JSON.stringify(p)])).r;
 const cur=await open('group-current'),ops=[uuid(),uuid()].sort();for(let i=0;i<2;i++)await db.query('select public.save_pharmflow_expiry_desktop_capture_v1($1,$2,$3,$4::jsonb)',[PA,cur.session_id,ops[i],JSON.stringify({...p,quantity:1,device_id:'group-current',sample_serial:'SERIAL-'+i})]);
 const state=async()=> (await value('select verified_quantity q from public.pharmflow_expiry_current_state_v1 where id=$1',[oldAck.state_id])).q;
 const members=async()=> (await value('select public.list_pharmflow_expiry_desktop_session_v1($1,$2) r',[PA,cur.session_id])).r.filter(r=>r.quantity>0).map(r=>({operation_id:r.operation_id,revision:r.revision}));
 const correct=async(expected,q,request=uuid(),pharmacy=PA,session=cur.session_id)=>(await value('select public.correct_pharmflow_expiry_desktop_group_v1($1,$2,$3,$4,$5::jsonb,$6) r',[pharmacy,session,oldAck.state_id,request,JSON.stringify(expected),q])).r;
 const start=await members();assert.equal(await state(),7);await denied(()=>correct(start.slice(0,1),4),/Stale group/);assert.equal(await state(),7);
 await denied(()=>correct(start,4,uuid(),PB),/Pharmacy|scope/);await denied(()=>correct(start,4,uuid(),PA,old.session_id),/scope/);await identity(UA,'anon');await denied(()=>correct(start,4),/permission denied/);await identity();
 // Force a failure in the second member after the first member has changed.
 await identity(UA,'postgres');await db.query("update pharmflow_expiry_private.operations set payload=jsonb_set(payload,'{source}','\"HH\"'::jsonb) where operation_id=$1",[ops[0]]);await identity();
 await denied(()=>correct(start,0),/Desktop group/);assert.equal(await state(),7);await identity(UA,'postgres');assert.equal((await value('select sum(quantity)::int q from pharmflow_expiry_private.session_captures_v1 where session_id=$1',[cur.session_id])).q,2);assert.equal((await value('select max(revision)::int r from pharmflow_expiry_private.session_captures_v1 where session_id=$1',[cur.session_id])).r,0);
 await identity(UA,'postgres');assert.equal((await value('select count(*)::int n from pharmflow_expiry_private.session_group_adjustments_v1')).n,0);await db.query("update pharmflow_expiry_private.operations set payload=jsonb_set(payload,'{source}','\"PC\"'::jsonb) where operation_id=$1",[ops[0]]);await identity();
 const req=uuid(),edit=await correct(start,4,req);assert.equal(await state(),9);assert.deepEqual(await correct(start,4,req),edit);assert.equal(await state(),9);await denied(()=>correct(start,3,req),/payload conflict/);await denied(()=>correct(start,2),/Stale group/);
 const fresh=await members(),del=uuid(),removed=await correct(fresh,0,del);assert.equal(await state(),5);assert.deepEqual(await correct(fresh,0,del),removed);assert.equal(await state(),5);
 await identity(UA,'postgres');assert.equal((await value('select quantity q from pharmflow_expiry_private.session_captures_v1 where operation_id=$1',[oldOp])).q,5);for(let i=0;i<2;i++)assert.equal((await value("select payload->>'sample_serial' s from pharmflow_expiry_private.operations where operation_id=$1",[ops[i]])).s,'SERIAL-'+i);
});
