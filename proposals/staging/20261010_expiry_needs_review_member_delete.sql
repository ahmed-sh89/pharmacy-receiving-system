-- PharmFlow Expiry pending-case deletion and durable private-photo cleanup.
-- PREPARED ONLY: do not apply without separate Staging database approval.
-- Target project: tovkcakucyagvbzvlnks. Production is not a target.
-- Storage bytes are deleted only through the private Storage API from the
-- server-side cleanup worker. The queue is written in the same transaction
-- as Resolve/Delete and supports leased, idempotent retry.

begin;

do $$
begin
  if to_regclass('public.pharmflow_needs_review_v2') is null
     or to_regclass('pharmflow_expiry_private.review_details') is null
     or to_regclass('pharmflow_expiry_private.photos') is null
     or to_regprocedure('public.is_pharmacy_member(uuid)') is null then
    raise exception 'Expiry review, photo, or pharmacy membership contract missing';
  end if;
  if not exists(select 1 from pg_attribute where attrelid='public.pharmflow_needs_review_v2'::regclass and attname='status' and atttypid='text'::regtype and not attisdropped) then
    raise exception 'Expected text review status column missing';
  end if;
  if not exists(select 1 from pg_constraint c where c.conrelid='public.pharmflow_needs_review_v2'::regclass and c.contype='c' and c.convalidated and position('DELETED' in upper(pg_get_constraintdef(c.oid)))>0 and position('PENDING' in upper(pg_get_constraintdef(c.oid)))>0 and position('RESOLVED' in upper(pg_get_constraintdef(c.oid)))>0) then
    raise exception 'Existing PENDING/RESOLVED/DELETED status model constraint missing';
  end if;
  if exists(select 1 from public.pharmflow_needs_review_v2 where status not in ('PENDING','RESOLVED','DELETED')) then
    raise exception 'Unexpected review status value; inspect before migration';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.pharmflow_needs_review_v2'::regclass and tgname='pharmflow_expiry_review_guard' and not tgisinternal) then
    raise exception 'Expiry review integrity guard missing';
  end if;
  if to_regprocedure('public.delete_pharmflow_expiry_review_v1(uuid,uuid)') is not null then
    raise exception 'Delete RPC already exists; inspect existing contract first';
  end if;
  if to_regclass('pharmflow_expiry_private.photo_cleanup_jobs') is not null then
    raise exception 'Cleanup queue already exists; inspect existing contract first';
  end if;
  if not exists(select 1 from storage.buckets where id='pharmflow-needs-review' and public is false) then
    raise exception 'Expected private Needs Review Storage bucket missing or public';
  end if;
  if not exists(select 1 from pg_extension where extname='pg_cron') or not exists(select 1 from pg_extension where extname='pg_net') then
    raise exception 'Unattended photo retry requires separately enabled pg_cron and pg_net';
  end if;
  if (select count(*) from vault.decrypted_secrets where name in ('pharmflow_expiry_cleanup_project_url','pharmflow_expiry_cleanup_publishable_key','pharmflow_expiry_cleanup_cron_token'))<>3
     or (select decrypted_secret from vault.decrypted_secrets where name='pharmflow_expiry_cleanup_project_url') is distinct from 'https://tovkcakucyagvbzvlnks.supabase.co' then
    raise exception 'Configure the exact Staging URL, publishable key, and random cleanup token in Vault before migration approval';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='storage.objects'::regclass and tgname='pharmflow_expiry_photo_guard' and not tgisinternal) then
    raise exception 'Expiry Storage integrity guard missing';
  end if;
  if exists(select 1 from public.pharmflow_needs_review_v2 r left join pharmflow_expiry_private.review_details d on d.review_id=r.id and d.pharmacy_id=r.pharmacy_id where r.workflow='EXPIRY' and (d.review_id is null or d.product_photo_path is null or not exists(select 1 from pharmflow_expiry_private.photos p where p.path=d.product_photo_path and p.pharmacy_id=r.pharmacy_id and p.operation_id=d.operation_id) or (d.expiry_photo_path is not null and not exists(select 1 from pharmflow_expiry_private.photos p where p.path=d.expiry_photo_path and p.pharmacy_id=r.pharmacy_id and p.operation_id=d.operation_id)))) then
    raise exception 'Existing Expiry review/photo references are incomplete or cross-pharmacy';
  end if;
end $$;

alter table public.pharmflow_needs_review_v2
  add column deleted_by uuid references auth.users(id) on delete set null,
  add column deleted_at timestamptz;

create table pharmflow_expiry_private.photo_cleanup_jobs (
  job_id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id),
  review_id uuid not null references public.pharmflow_needs_review_v2(id),
  operation_id uuid not null,
  object_path text not null unique,
  state text not null default 'PENDING' check(state in ('PENDING','CLAIMED','DONE')),
  attempts integer not null default 0 check(attempts>=0),
  next_attempt_at timestamptz not null default now(),
  claim_until timestamptz,
  claim_token uuid,
  last_error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key(pharmacy_id,operation_id) references pharmflow_expiry_private.operations(pharmacy_id,operation_id),
  check((state='CLAIMED')=(claim_until is not null)),
  check((state='CLAIMED')=(claim_token is not null)),
  check((state='DONE')=(completed_at is not null))
);
create index expiry_photo_cleanup_due_idx on pharmflow_expiry_private.photo_cleanup_jobs(state,next_attempt_at,claim_until,created_at);
alter table pharmflow_expiry_private.photo_cleanup_jobs enable row level security;
revoke all on pharmflow_expiry_private.photo_cleanup_jobs from public,anon,authenticated;
grant usage on schema pharmflow_expiry_private to service_role;
grant select on pharmflow_expiry_private.photo_cleanup_jobs to service_role;

-- Preserve the live capture immutability and resolution checks while allowing
-- only a pharmacy-member PENDING -> DELETED tombstone. RESOLVED is not deletable.
create or replace function pharmflow_expiry_private.guard_review()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if tg_op='INSERT' then
  if new.workflow='EXPIRY' and not exists(select 1 from pharmflow_expiry_private.operations o where o.pharmacy_id=new.pharmacy_id and o.operation_id::text=new.operation_id and o.created_by=auth.uid() and o.status='COMMITTING' and o.payload->>'kind'='UNKNOWN') then raise exception 'Expiry review requires complete operation capture';end if;
  if new.deleted_by is not null or new.deleted_at is not null then raise exception 'Deletion attribution is server managed';end if;
  return new;
 end if;
 if old.workflow<>'EXPIRY' then
  if tg_op='UPDATE' and new.workflow='EXPIRY' then raise exception 'Workflow reassignment denied';end if;
  if tg_op='DELETE' then return old;else return new;end if;
 end if;
 if not exists(select 1 from pharmflow_expiry_private.review_details where review_id=old.id) then
  if tg_op='DELETE' then return old;else return new;end if;
 end if;
 if tg_op='DELETE' then raise exception 'Expiry review audit cannot be deleted';end if;
 if row(new.id,new.created_at,new.review_reason,new.pharmacy_id,new.workflow,new.gtin,new.identifier_display,new.identifier_key,new.raw_barcode,new.pending_quantity,new.source,new.device_id,new.created_by,new.operation_id,new.photo_path) is distinct from row(old.id,old.created_at,old.review_reason,old.pharmacy_id,old.workflow,old.gtin,old.identifier_display,old.identifier_key,old.raw_barcode,old.pending_quantity,old.source,old.device_id,old.created_by,old.operation_id,old.photo_path) then raise exception 'Expiry capture evidence is immutable';end if;
 if new.status='DELETED' and old.status='PENDING' then
  if public.is_pharmacy_member(old.pharmacy_id) is not true or new.deleted_by is distinct from auth.uid() or new.deleted_at is null or new.resolved_by is distinct from old.resolved_by or new.resolved_item_code is distinct from old.resolved_item_code or new.resolved_item_name is distinct from old.resolved_item_name then raise exception 'Authorized pharmacy-member pending-case deletion required';end if;
  if old.deleted_by is not null or old.deleted_at is not null then raise exception 'Deletion attribution is immutable';end if;
  return new;
 end if;
 if old.status='DELETED' then raise exception 'Deleted Expiry review is immutable';end if;
 if new.deleted_by is distinct from old.deleted_by or new.deleted_at is distinct from old.deleted_at then raise exception 'Deletion attribution is immutable';end if;
 if new.status=old.status and row(new.resolved_by,new.resolved_item_code,new.resolved_item_name) is distinct from row(old.resolved_by,old.resolved_item_code,old.resolved_item_name) then raise exception 'Resolution attribution is immutable outside successful resolution';end if;
 if new.status is distinct from old.status and (old.status<>'PENDING' or new.status<>'RESOLVED' or public.is_pharmacy_admin(old.pharmacy_id) is not true or new.resolved_by is distinct from auth.uid() or coalesce(btrim(new.resolved_item_code),'')='' or coalesce(btrim(new.resolved_item_name),'')='') then raise exception 'Authorized successful resolution required';end if;
 return new;
end $$;
revoke all on function pharmflow_expiry_private.guard_review() from public,anon,authenticated;

-- This trigger writes one durable cleanup obligation per registered private
-- Storage object for the exact operation, including unused retakes. The
-- operation is unique to this Expiry review; do not limit cleanup to the two
-- currently selected paths in review_details.
-- in the same transaction as the terminal review status transition.
create function pharmflow_expiry_private.enqueue_review_photo_cleanup()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pharmflow_expiry_private,pg_temp as $$
begin
 if old.status='PENDING' and new.status in ('RESOLVED','DELETED') and new.workflow='EXPIRY' then
  insert into pharmflow_expiry_private.photo_cleanup_jobs(pharmacy_id,review_id,operation_id,object_path)
  select d.pharmacy_id,d.review_id,d.operation_id,p.path
  from pharmflow_expiry_private.review_details d
  join pharmflow_expiry_private.photos p on p.pharmacy_id=d.pharmacy_id and p.operation_id=d.operation_id
  join pharmflow_expiry_private.operations o on o.pharmacy_id=d.pharmacy_id and o.operation_id=d.operation_id
  where d.review_id=new.id and d.pharmacy_id=new.pharmacy_id and o.status='COMMITTED' and p.deleted_at is null
    and p.path ~ ('^'||new.pharmacy_id::text||'/expiry-v1/'||d.operation_id::text||'/(product|expiry)/[0-9a-f-]{36}\.(jpg|png|webp)$')
  on conflict(object_path) do nothing;
 end if;
 return new;
end $$;
revoke all on function pharmflow_expiry_private.enqueue_review_photo_cleanup() from public,anon,authenticated;
create trigger pharmflow_expiry_review_cleanup_enqueue
after update of status on public.pharmflow_needs_review_v2
for each row when(old.status='PENDING' and new.status in ('RESOLVED','DELETED') and new.workflow='EXPIRY')
execute function pharmflow_expiry_private.enqueue_review_photo_cleanup();

-- Permit Storage API deletion only to the server worker while it owns a live
-- lease for this exact photo and the exact case has durably become terminal.
create or replace function pharmflow_expiry_private.guard_photo() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_path text;v_op pharmflow_expiry_private.operations%rowtype;v_photo pharmflow_expiry_private.photos%rowtype;v_p uuid;v_id uuid;v_actor uuid;v_member boolean;v_prior_sub text;
begin
 if tg_op='UPDATE' then
  if (old.bucket_id='pharmflow-needs-review' and split_part(old.name,'/',2)='expiry-v1') or (new.bucket_id='pharmflow-needs-review' and split_part(new.name,'/',2)='expiry-v1') then raise exception 'Expiry photos are immutable; retake with a new path';end if;
  return new;
 end if;
 if tg_op='DELETE' then v_path:=old.name;if old.bucket_id<>'pharmflow-needs-review' or split_part(v_path,'/',2)<>'expiry-v1' then return old;end if;
 else v_path:=new.name;if new.bucket_id<>'pharmflow-needs-review' or split_part(v_path,'/',2)<>'expiry-v1' then return new;end if;end if;
 if v_path !~ '^[0-9a-f-]{36}/expiry-v1/[0-9a-f-]{36}/(product|expiry)/[0-9a-f-]{36}\.(jpg|png|webp)$' then raise exception 'Invalid Expiry photo path';end if;
 v_p:=split_part(v_path,'/',1)::uuid;v_id:=split_part(v_path,'/',3)::uuid;
 select * into v_op from pharmflow_expiry_private.operations where pharmacy_id=v_p and operation_id=v_id for update;
 if not found then raise exception 'Photo scope denied';end if;
 if tg_op='DELETE' and current_setting('role',true)='service_role' and exists(
  select 1 from pharmflow_expiry_private.photo_cleanup_jobs j
  join pharmflow_expiry_private.review_details d on d.review_id=j.review_id and d.pharmacy_id=j.pharmacy_id and d.operation_id=j.operation_id
  join pharmflow_expiry_private.photos p on p.path=j.object_path and p.pharmacy_id=j.pharmacy_id and p.operation_id=j.operation_id and p.deleted_at is null
  join public.pharmflow_needs_review_v2 r on r.id=j.review_id and r.pharmacy_id=j.pharmacy_id
  join pharmflow_expiry_private.operations o on o.pharmacy_id=j.pharmacy_id and o.operation_id=j.operation_id and o.status='COMMITTED'
  where j.pharmacy_id=v_p and j.operation_id=v_id and j.object_path=v_path and j.state='CLAIMED' and j.claim_until>now() and j.claim_token is not null
    and r.workflow='EXPIRY' and r.status in ('RESOLVED','DELETED')
 ) then
  update pharmflow_expiry_private.photos set deleted_at=coalesce(deleted_at,now()),cleanup_by=null,cleanup_until=null where path=v_path and pharmacy_id=v_p and operation_id=v_id;
  return old;
 end if;
 v_actor:=auth.uid();
 if tg_op='INSERT' and v_actor is null and session_user='supabase_storage_admin' and current_setting('role',true)='service_role' then
  v_actor:=coalesce(new.owner_id,new.owner::text)::uuid;v_prior_sub:=current_setting('request.jwt.claim.sub',true);perform set_config('request.jwt.claim.sub',v_actor::text,true);v_member:=public.is_pharmacy_member(v_p);perform set_config('request.jwt.claim.sub',coalesce(v_prior_sub,''),true);
 else v_member:=public.is_pharmacy_member(v_p);end if;
 if v_actor is null or v_member is not true then raise exception 'Photo scope denied';end if;
 if tg_op='INSERT' then
  if v_op.status<>'RESERVED' or v_op.created_by<>v_actor or coalesce(new.owner_id,new.owner::text) is distinct from v_actor::text then raise exception 'Photo upload denied';end if;
  if session_user='supabase_storage_admin' and (new.metadata->>'mimetype' is null or new.metadata->>'size' is null) then return new;end if;
  if new.metadata->>'mimetype' is null or new.metadata->>'mimetype' not in ('image/jpeg','image/png','image/webp') or coalesce((new.metadata->>'size')::bigint,0) not between 1 and 5242880 then raise exception 'Invalid photo type or size';end if;
  insert into pharmflow_expiry_private.photos(path,pharmacy_id,operation_id,role,created_by) values(v_path,v_p,v_id,split_part(v_path,'/',4),v_actor);return new;
 end if;
 select * into v_photo from pharmflow_expiry_private.photos where path=v_path;
 if v_op.status='RESERVED' and v_photo.created_by=auth.uid() then update pharmflow_expiry_private.photos set deleted_at=now() where path=v_path;return old;end if;
 if v_op.status<>'COMMITTED' or public.is_pharmacy_admin(v_p) is not true or v_photo.cleanup_by is distinct from auth.uid() or v_photo.cleanup_until is null or v_photo.cleanup_until<now()
   or not exists(select 1 from pharmflow_expiry_private.review_details d join public.pharmflow_needs_review_v2 r on r.id=d.review_id where d.pharmacy_id=v_p and d.operation_id=v_id and r.workflow='EXPIRY' and r.status='RESOLVED') then raise exception 'Resolved Expiry cleanup authorization required';end if;
 update pharmflow_expiry_private.photos set deleted_at=now(),cleanup_by=null,cleanup_until=null where path=v_path;return old;
end $$;
revoke all on function pharmflow_expiry_private.guard_photo() from public,anon,authenticated;

create function public.delete_pharmflow_expiry_review_v1(p_pharmacy_id uuid,p_review_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_row public.pharmflow_needs_review_v2%rowtype;
begin
 if auth.uid() is null or p_pharmacy_id is null or p_review_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select * into v_row from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY' for update;
 if not found then raise exception 'Expiry review not found in authorized pharmacy';end if;
 if v_row.status='DELETED' then return jsonb_build_object('success',true,'review_id',p_review_id,'status','DELETED','already_deleted',true);end if;
 if v_row.status<>'PENDING' then raise exception 'Only pending Expiry review cases may be deleted';end if;
 update public.pharmflow_needs_review_v2 set status='DELETED',deleted_by=auth.uid(),deleted_at=clock_timestamp(),updated_at=clock_timestamp()
 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY' and status='PENDING';
 if not found then raise exception 'Expiry review changed; retry safely';end if;
 return jsonb_build_object('success',true,'review_id',p_review_id,'status','DELETED','already_deleted',false,'photo_cleanup_queued',true);
end $$;
revoke all on function public.delete_pharmflow_expiry_review_v1(uuid,uuid) from public,anon;
grant execute on function public.delete_pharmflow_expiry_review_v1(uuid,uuid) to authenticated;

-- These RPCs are private to the server-side Edge Function using the project
-- service-role key; no client receives this key or can claim a cleanup lease.
create function pharmflow_expiry_private.claim_photo_cleanup_jobs(p_limit integer default 4)
returns table(job_id uuid,pharmacy_id uuid,review_id uuid,operation_id uuid,object_path text,attempts integer,claim_token uuid)
language plpgsql security definer set search_path=pg_catalog,public,pharmflow_expiry_private,pg_temp as $$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Cleanup worker role required';end if;
 return query with due as (
  select j.job_id from pharmflow_expiry_private.photo_cleanup_jobs j
  where (j.state='PENDING' and j.next_attempt_at<=now()) or (j.state='CLAIMED' and j.claim_until<=now())
  order by j.next_attempt_at,j.created_at for update skip locked limit least(greatest(coalesce(p_limit,4),1),4)
 ), claimed as (
  update pharmflow_expiry_private.photo_cleanup_jobs j set state='CLAIMED',attempts=j.attempts+1,claim_until=now()+interval '3 minutes',claim_token=gen_random_uuid(),last_error_code=null
  from due where j.job_id=due.job_id
  returning j.job_id,j.pharmacy_id,j.review_id,j.operation_id,j.object_path,j.attempts,j.claim_token
 ) select * from claimed;
end $$;
create function pharmflow_expiry_private.complete_photo_cleanup_job(p_job_id uuid,p_object_path text,p_claim_token uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,pharmflow_expiry_private,pg_temp as $$
declare v_job pharmflow_expiry_private.photo_cleanup_jobs%rowtype;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Cleanup worker role required';end if;
 select * into v_job from pharmflow_expiry_private.photo_cleanup_jobs where job_id=p_job_id and object_path=p_object_path and claim_token=p_claim_token and state='CLAIMED' and claim_until>now() for update;
 if not found then return false;end if;
 if not exists(select 1 from pharmflow_expiry_private.review_details d join public.pharmflow_needs_review_v2 r on r.id=d.review_id and r.pharmacy_id=d.pharmacy_id join pharmflow_expiry_private.photos p on p.path=p_object_path and p.pharmacy_id=d.pharmacy_id and p.operation_id=d.operation_id join pharmflow_expiry_private.operations o on o.pharmacy_id=d.pharmacy_id and o.operation_id=d.operation_id where d.review_id=v_job.review_id and d.pharmacy_id=v_job.pharmacy_id and d.operation_id=v_job.operation_id and r.workflow='EXPIRY' and r.status in ('RESOLVED','DELETED') and o.status='COMMITTED' and p_object_path ~ ('^'||d.pharmacy_id::text||'/expiry-v1/'||d.operation_id::text||'/(product|expiry)/[0-9a-f-]{36}\.(jpg|png|webp)$')) then raise exception 'Cleanup target no longer belongs to the terminal Expiry case';end if;
 update pharmflow_expiry_private.photos set deleted_at=coalesce(deleted_at,now()),cleanup_by=null,cleanup_until=null where path=p_object_path and pharmacy_id=v_job.pharmacy_id and operation_id=v_job.operation_id;
 update pharmflow_expiry_private.photo_cleanup_jobs set state='DONE',claim_until=null,claim_token=null,completed_at=coalesce(completed_at,now()),last_error_code=null where job_id=p_job_id and claim_token=p_claim_token;
 return true;
end $$;
create function pharmflow_expiry_private.fail_photo_cleanup_job(p_job_id uuid,p_claim_token uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,pharmflow_expiry_private,pg_temp as $$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Cleanup worker role required';end if;
 update pharmflow_expiry_private.photo_cleanup_jobs set state='PENDING',claim_until=null,claim_token=null,next_attempt_at=now()+make_interval(secs=>least(3600,5*(2^least(attempts,9))::integer)),last_error_code=left(coalesce(nullif(p_error_code,''),'storage_error'),64)
 where job_id=p_job_id and claim_token=p_claim_token and state='CLAIMED' and claim_until>now();
 return found;
end $$;
revoke all on function pharmflow_expiry_private.claim_photo_cleanup_jobs(integer),pharmflow_expiry_private.complete_photo_cleanup_job(uuid,text,uuid),pharmflow_expiry_private.fail_photo_cleanup_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function pharmflow_expiry_private.claim_photo_cleanup_jobs(integer),pharmflow_expiry_private.complete_photo_cleanup_job(uuid,text,uuid),pharmflow_expiry_private.fail_photo_cleanup_job(uuid,uuid,text) to service_role;

-- A visible contract bump keeps the updated frontend fail-closed until every
-- independently approved Staging database/function/scheduler gate is ready.
create or replace function public.get_pharmflow_expiry_review_contract_v1(p_pharmacy_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if to_regprocedure('public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb)') is null or to_regprocedure('public.get_pharmflow_expiry_review_v1(uuid,uuid)') is null or to_regprocedure('public.list_pharmflow_expiry_reviews_v1(uuid,text,integer,integer)') is null or to_regprocedure('public.count_pharmflow_expiry_reviews_v1(uuid)') is null or to_regprocedure('public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)') is null or to_regprocedure('public.add_pharmflow_global_identifier_v2(uuid,text,text,text)') is null or to_regprocedure('public.delete_pharmflow_expiry_review_v1(uuid,uuid)') is null or to_regprocedure('pharmflow_expiry_private.claim_photo_cleanup_jobs(integer)') is null or to_regprocedure('pharmflow_expiry_private.complete_photo_cleanup_job(uuid,text,uuid)') is null or to_regprocedure('pharmflow_expiry_private.fail_photo_cleanup_job(uuid,uuid,text)') is null or to_regclass('pharmflow_expiry_private.photo_cleanup_jobs') is null then raise exception 'Expiry review contract is incomplete';end if;
 return jsonb_build_object('contract_version','EXPIRY_NEEDS_REVIEW_20261010_V2');
end $$;
revoke all on function public.get_pharmflow_expiry_review_contract_v1(uuid) from public,anon;
grant execute on function public.get_pharmflow_expiry_review_contract_v1(uuid) to authenticated;

-- Durable retry schedule. The worker claims at most 4 objects with 3-minute
-- fencing leases and 10-second request deadlines. Deploy the Edge Function and
-- its matching token before applying this migration.
select cron.schedule(
  'pharmflow-expiry-photo-cleanup',
  '* * * * *',
  $cleanup$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='pharmflow_expiry_cleanup_project_url')||'/functions/v1/pharmflow-expiry-photo-cleanup',
      headers := jsonb_build_object(
        'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='pharmflow_expiry_cleanup_cron_token'),
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name='pharmflow_expiry_cleanup_publishable_key'),
        'Content-Type','application/json'
      ),
      body := '{}'::jsonb
    );
  $cleanup$
);
commit;

-- Read-only preflight (before the separately approved migration):
-- select current_database(),current_setting('server_version');
-- select extname,extversion from pg_extension where extname in ('pg_cron','pg_net','supabase_vault');
-- select id,public from storage.buckets where id='pharmflow-needs-review';
-- select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('pf_nr_photo_select','pharmflow_expiry_staged_photo_delete');
-- select name from vault.decrypted_secrets where name in ('pharmflow_expiry_cleanup_project_url','pharmflow_expiry_cleanup_publishable_key','pharmflow_expiry_cleanup_cron_token');
-- select p.oid::regprocedure,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_exec from pg_proc p where p.oid='public.authorize_pharmflow_expiry_photo_cleanup_v1(uuid,uuid)'::regprocedure;
-- Read-only post-deployment contract checks (never run to apply the migration):
-- select p.oid::regprocedure,p.prosecdef,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_exec,has_function_privilege('service_role',p.oid,'EXECUTE') service_exec from pg_proc p where p.oid in ('public.delete_pharmflow_expiry_review_v1(uuid,uuid)'::regprocedure,'pharmflow_expiry_private.claim_photo_cleanup_jobs(integer)'::regprocedure,'pharmflow_expiry_private.complete_photo_cleanup_job(uuid,text,uuid)'::regprocedure,'pharmflow_expiry_private.fail_photo_cleanup_job(uuid,uuid,text)'::regprocedure);
-- select status,workflow,count(*) from public.pharmflow_needs_review_v2 where pharmacy_id=:authorized_pharmacy_id group by status,workflow;
-- Queue health: backlog age, retry pressure, and expired leases.
-- select state,count(*)::bigint jobs,min(created_at) oldest_created_at,max(attempts) max_attempts,count(*) filter(where last_error_code is not null) failures,count(*) filter(where state='CLAIMED' and claim_until<=now()) expired_claims from pharmflow_expiry_private.photo_cleanup_jobs where state<>'DONE' group by state order by state;
-- select now()-min(created_at) oldest_outstanding_age,max(attempts) max_attempts,count(*) filter(where last_error_code is not null) failures from pharmflow_expiry_private.photo_cleanup_jobs where state<>'DONE';
-- select j.job_id,j.pharmacy_id,j.review_id,j.operation_id,j.state,j.attempts,j.next_attempt_at,j.claim_until,j.last_error_code,p.deleted_at from pharmflow_expiry_private.photo_cleanup_jobs j join pharmflow_expiry_private.photos p on p.path=j.object_path and p.pharmacy_id=j.pharmacy_id and p.operation_id=j.operation_id where j.review_id=:review_id and j.state<>'DONE' order by j.created_at;
-- select count(*) as remaining_storage_objects from storage.objects where bucket_id='pharmflow-needs-review' and name=:exact_evidence_path; expect 0 only after that job is DONE.
-- select id,pharmacy_id,workflow,status,deleted_by,deleted_at from public.pharmflow_needs_review_v2 where id=:review_id;
-- Confirm bucket public=false; verify Storage objects are removed through Storage API only, not SQL.
-- Compare Receiving, Global Master/audit, Expiry inventory/event counts before/after synthetic test.
-- Verify schedule installation:
-- select jobname,schedule,command from cron.job where jobname='pharmflow-expiry-photo-cleanup';
-- Invocation response history is diagnostic only; HTTP 200 does not prove all
-- objects were deleted. Review these responses alongside queue health:
-- select status_code,content,timed_out,created from net._http_response order by created desc limit 20;
-- The URL/token are Staging Vault secrets; the service-role key exists only in Edge Function runtime env.
