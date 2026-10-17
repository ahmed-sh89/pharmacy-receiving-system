-- PHASE2C1184 — Pharmacy-local Expiry review resolution.
-- STAGING ONLY: tovkcakucyagvbzvlnks. Additive audit table + resolver replacement.
-- No Global Master writes, Receiving changes, or data backfills.

begin;

do $$
declare
  v_proc oid;
  v_index oid;
begin
  if current_database() <> 'postgres' then raise exception 'Unexpected database'; end if;
  if to_regclass('public.pharmflow_needs_review_v2') is null
     or to_regclass('pharmflow_expiry_private.review_details') is null
     or to_regclass('pharmflow_expiry_private.operations') is null
     or to_regclass('public.pharmflow_expiry_current_state_v1') is null
     or to_regclass('public.pharmflow_expiry_events_v1') is null
     or to_regclass('public.pharmflow_pharmacy_gtin_v1') is null
     or to_regclass('public.pharmflow_global_items_v2') is null
     or to_regclass('pharmflow_expiry_private.photo_cleanup_jobs') is null then
    raise exception 'Required Staging Expiry, pharmacy mapping, Global Master read, or cleanup contracts are missing';
  end if;
  if to_regprocedure('pharmflow_expiry_private.save_known_core(uuid,text,text,text,text,integer,integer,integer,uuid,text,text,text,text,text)') is null
     or to_regprocedure('public.is_pharmacy_member(uuid)') is null
     or to_regprocedure('public.pharmflow_identifier_key_v2(text)') is null then
    raise exception 'Approved member authorization, identifier normalization, or inventory/event writer is missing';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='resolve_pharmflow_expiry_review_v1') <> 1 then
    raise exception 'Unexpected Expiry resolver overload; compare before applying';
  end if;
  v_proc := to_regprocedure('public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)');
  if v_proc is null or pg_get_function_result(v_proc) <> 'jsonb' or not (select prosecdef from pg_proc where oid=v_proc) then
    raise exception 'Existing resolver signature, return type, or SECURITY DEFINER contract differs';
  end if;
  if not has_function_privilege('authenticated',v_proc,'EXECUTE')
     or has_function_privilege('anon',v_proc,'EXECUTE')
     or exists(select 1 from aclexplode(coalesce((select proacl from pg_proc where oid=v_proc),acldefault('f',(select proowner from pg_proc where oid=v_proc)))) a where a.grantee=0 and a.privilege_type='EXECUTE') then
    raise exception 'Existing resolver privileges differ from authenticated-only';
  end if;
  if exists(select 1 from public.pharmflow_pharmacy_gtin_v1 where nullif(btrim(identifier_key),'') is null)
     or exists(select 1 from public.pharmflow_pharmacy_gtin_v1 group by pharmacy_id,identifier_key having count(*)>1) then
    raise exception 'Existing pharmacy mappings contain blank or duplicate scoped identifier keys';
  end if;
  v_index := to_regclass('public.pharmflow_pharmacy_gtin_v1_pharmacy_identifier_key_key');
  if v_index is not null
     and not exists(select 1 from pg_index i where i.indexrelid=v_index
       and i.indrelid='public.pharmflow_pharmacy_gtin_v1'::regclass and i.indisunique
       and (select array_agg(a.attname::text order by x.ord) from unnest(i.indkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=i.indrelid and a.attnum=x.attnum)=array['pharmacy_id','identifier_key']) then
    raise exception 'Identifier uniqueness index name is occupied by a different contract';
  end if;
  if to_regclass('public.pharmflow_expiry_review_resolution_audit_v1') is not null then
    raise exception 'Audit table name is already occupied; inspect before applying';
  end if;
  if has_table_privilege('authenticated','public.pharmflow_needs_review_v2','UPDATE')
     or has_table_privilege('anon','public.pharmflow_needs_review_v2','UPDATE') then
    raise exception 'Direct review-table UPDATE is granted; preserve it and design a narrower trigger authorization before applying';
  end if;
  if position('public.is_pharmacy_admin(old.pharmacy_id) is not true' in pg_get_functiondef('pharmflow_expiry_private.guard_review()'::regprocedure))=0
     or position('Expiry capture evidence is immutable' in pg_get_functiondef('pharmflow_expiry_private.guard_review()'::regprocedure))=0 then
    raise exception 'Expiry review guard differs from the inspected Staging contract';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.pharmflow_needs_review_v2'::regclass and not tgisinternal and tgname ilike '%photo%cleanup%')
     and not exists(select 1 from pg_trigger where tgrelid='public.pharmflow_needs_review_v2'::regclass and not tgisinternal and pg_get_triggerdef(oid) ilike '%enqueue_review_photo_cleanup%') then
    raise exception 'Terminal review photo cleanup trigger is missing';
  end if;
end $$;

-- Staging currently has no unique index on this key. The preflight above proves
-- that no rows collide before adding the concurrency/idempotency guard.
create unique index if not exists pharmflow_pharmacy_gtin_v1_pharmacy_identifier_key_key
  on public.pharmflow_pharmacy_gtin_v1(pharmacy_id,identifier_key);

-- Keep all existing immutable-capture, delete-attribution, and workflow guards.
-- Only the Expiry transition check changes from pharmacy-admin to member; table
-- UPDATE is not granted to API roles, and the resolver RPC independently checks
-- membership and performs inventory/event/audit writes in the same transaction.
create or replace function pharmflow_expiry_private.guard_review()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
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
 if new.status is distinct from old.status and (old.status<>'PENDING' or new.status<>'RESOLVED' or public.is_pharmacy_member(old.pharmacy_id) is not true or new.resolved_by is distinct from auth.uid() or coalesce(btrim(new.resolved_item_code),'')='' or coalesce(btrim(new.resolved_item_name),'')='') then raise exception 'Authorized successful resolution required';end if;
 return new;
end;
$$;

create table public.pharmflow_expiry_review_resolution_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  review_id uuid not null references public.pharmflow_needs_review_v2(id) on delete restrict,
  operation_id uuid not null,
  identifier_display text not null,
  identifier_key text not null,
  item_code text not null references public.pharmflow_global_items_v2(item_code) on delete restrict,
  item_name text not null,
  mapping_id uuid not null,
  mapping_created boolean not null,
  expiry_state_id uuid not null references public.pharmflow_expiry_current_state_v1(id) on delete restrict,
  expiry_event_id uuid not null references public.pharmflow_expiry_events_v1(id) on delete restrict,
  performed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (pharmacy_id, review_id),
  unique (pharmacy_id, operation_id)
);
alter table public.pharmflow_expiry_review_resolution_audit_v1 enable row level security;
revoke all on table public.pharmflow_expiry_review_resolution_audit_v1 from public, anon, authenticated;

create or replace function public.resolve_pharmflow_expiry_review_v1(
  p_pharmacy_id uuid,
  p_review_id uuid,
  p_operation_id uuid,
  p_item_code text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pharmflow_expiry_private, pg_temp
as $$
declare
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_details pharmflow_expiry_private.review_details%rowtype;
  v_capture jsonb;
  v_item public.pharmflow_global_items_v2%rowtype;
  v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_audit public.pharmflow_expiry_review_resolution_audit_v1%rowtype;
  v_identifier text;
  v_key text;
  v_worker uuid;
  v_ack record;
  v_mapping_created boolean := false;
begin
  if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then
    raise exception 'Pharmacy access required';
  end if;
  if p_review_id is null or p_operation_id is null or nullif(btrim(coalesce(p_item_code,'')),'') is null then
    raise exception 'Review, operation, and selected Global Master item are required';
  end if;

  select * into v_review
    from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY'
   for update;
  if not found then raise exception 'Expiry review case not found in authorized pharmacy'; end if;

  if v_review.status='RESOLVED' then
    select * into v_audit from public.pharmflow_expiry_review_resolution_audit_v1
     where pharmacy_id=p_pharmacy_id and review_id=p_review_id for share;
    if v_review.resolution_transaction_id is distinct from p_operation_id::text
       or v_review.resolved_item_code is distinct from btrim(p_item_code) then
      raise exception 'Expiry review was already resolved under another operation or item';
    end if;
    return jsonb_build_object('success',true,'review_id',p_review_id,'item_code',v_review.resolved_item_code,
      'item_name',v_review.resolved_item_name,'operation_id',p_operation_id::text,'already_resolved',true,
      'state_id',v_audit.expiry_state_id,'event_id',v_audit.expiry_event_id,'scope','PHARMACY');
  end if;
  if v_review.status<>'PENDING' then raise exception 'Only pending Expiry review cases may be resolved'; end if;

  select * into v_details from pharmflow_expiry_private.review_details
   where review_id=p_review_id and pharmacy_id=p_pharmacy_id;
  if not found then raise exception 'Expiry review capture details are unavailable'; end if;
  select o.payload into v_capture from pharmflow_expiry_private.operations o
   where o.pharmacy_id=p_pharmacy_id and o.operation_id=v_details.operation_id and o.status='COMMITTED';
  if v_capture is null or jsonb_typeof(v_capture)<>'object' then raise exception 'Committed Expiry capture payload is unavailable'; end if;
  if not (v_capture ?& array['quantity','expiry_month','expiry_year','source','device_id','batch_no','sample_serial','worker_id']) then
    raise exception 'Committed Expiry capture payload is incomplete';
  end if;

  select * into v_item from public.pharmflow_global_items_v2 where item_code=btrim(p_item_code);
  if not found then raise exception 'Selected Global Master item does not exist'; end if;
  v_identifier:=coalesce(nullif(btrim(v_review.identifier_display),''),nullif(btrim(v_review.gtin),''));
  v_key:=public.pharmflow_identifier_key_v2(v_identifier);
  if v_key='' then raise exception 'Expiry identifier is invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||':'||v_key,1156));

  select * into v_mapping from public.pharmflow_pharmacy_gtin_v1
   where pharmacy_id=p_pharmacy_id and identifier_key=v_key for update;
  if v_mapping.id is not null and v_mapping.item_code<>v_item.item_code then
    raise exception 'Identifier is already mapped to another item in this pharmacy';
  end if;
  if v_mapping.id is null then
    insert into public.pharmflow_pharmacy_gtin_v1
      (pharmacy_id,gtin,identifier_display,identifier_key,item_code,item_name,source,created_by,updated_by)
    values(p_pharmacy_id,v_identifier,v_identifier,v_key,v_item.item_code,v_item.item_name,'EXPIRY_REVIEW',auth.uid(),auth.uid())
    returning * into v_mapping;
    v_mapping_created:=true;
  end if;

  v_worker:=nullif(v_capture->>'worker_id','')::uuid;
  select * into v_ack from pharmflow_expiry_private.save_known_core(
    p_pharmacy_id,v_item.item_code,v_item.item_name,v_identifier,
    coalesce(nullif(v_item.category,''),nullif(v_capture->>'category','')),
    (v_capture->>'quantity')::integer,(v_capture->>'expiry_month')::integer,(v_capture->>'expiry_year')::integer,
    v_worker,nullif(v_capture->>'batch_no',''),nullif(v_capture->>'sample_serial',''),
    nullif(v_capture->>'device_id',''),upper(v_capture->>'source'),'CAPTURE');
  if v_ack.state_id is null or v_ack.event_id is null then raise exception 'Expiry inventory acknowledgement was not created'; end if;

  update public.pharmflow_needs_review_v2
     set status='RESOLVED',resolved_by=auth.uid(),resolved_item_code=v_item.item_code,
         resolved_item_name=v_item.item_name,resolved_at=clock_timestamp(),
         resolution_transaction_id=p_operation_id::text,updated_at=clock_timestamp()
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY' and status='PENDING';
  if not found then raise exception 'Expiry review changed before resolution was committed'; end if;

  insert into public.pharmflow_expiry_review_resolution_audit_v1
    (pharmacy_id,review_id,operation_id,identifier_display,identifier_key,item_code,item_name,mapping_id,mapping_created,
     expiry_state_id,expiry_event_id,performed_by)
  values(p_pharmacy_id,p_review_id,p_operation_id,v_identifier,v_key,v_item.item_code,v_item.item_name,v_mapping.id,
    v_mapping_created,v_ack.state_id,v_ack.event_id,auth.uid());

  return jsonb_build_object('success',true,'review_id',p_review_id,'item_code',v_item.item_code,
    'item_name',v_item.item_name,'operation_id',p_operation_id::text,'already_resolved',false,
    'state_id',v_ack.state_id,'event_id',v_ack.event_id,'scope','PHARMACY','photo_cleanup_queued',true,
    'mapping_created',v_mapping_created);
end;
$$;

revoke all on function public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text) from public, anon;
grant execute on function public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text) to authenticated;

commit;

-- Read-only verification:
-- select pg_get_function_result('public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)'::regprocedure),
--        has_function_privilege('authenticated','public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)','execute'),
--        has_function_privilege('anon','public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)','execute');
-- select count(*) from public.pharmflow_expiry_review_resolution_audit_v1;
