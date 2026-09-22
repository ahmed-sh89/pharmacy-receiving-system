-- PHASE2C1152 — Additive identifier foundation (Stage 1 only)
-- Production safety: additive objects only. No legacy rows, Receiving data,
-- historical data, Returns Archive, auth, or existing RPCs are modified.
-- This transaction deliberately aborts if the audited Global Master baseline
-- has changed, preventing an uncontrolled partial backfill.

begin;

create or replace function public.pharmflow_identifier_key_v2(p_identifier_display text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select upper(btrim(coalesce(p_identifier_display, '')))
$$;

create table public.pharmflow_global_items_v2 (
  item_code text primary key check (btrim(item_code) <> ''),
  item_name text not null check (btrim(item_name) <> ''),
  group_name text,
  category text,
  sub_category text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table public.pharmflow_global_item_identifiers_v2 (
  id uuid primary key default gen_random_uuid(),
  item_code text not null references public.pharmflow_global_items_v2(item_code) on delete restrict,
  identifier_display text not null check (identifier_display = btrim(identifier_display) and identifier_display <> ''),
  identifier_key text not null check (identifier_key <> ''),
  mapping_revision bigint not null default 1 check (mapping_revision > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint pharmflow_global_item_identifiers_v2_identifier_key_uq unique (identifier_key),
  constraint pharmflow_global_item_identifiers_v2_item_identifier_uq unique (item_code, identifier_key),
  constraint pharmflow_global_item_identifiers_v2_key_matches_display_ck
    check (identifier_key = public.pharmflow_identifier_key_v2(identifier_display))
);

create index pharmflow_global_item_identifiers_v2_item_code_idx
  on public.pharmflow_global_item_identifiers_v2(item_code);

create table public.pharmflow_identifier_migration_conflicts_v1 (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_row_id text not null,
  identifier_display text not null,
  identifier_key text not null,
  candidate_item_codes jsonb not null,
  conflict_type text not null check (conflict_type in ('GLOBAL_MULTI_ITEM', 'LEGACY_MULTI_ITEM', 'LEGACY_VS_GLOBAL', 'LEGACY_SCOPE_REVIEW')),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING', 'RESOLVED', 'DISMISSED')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  constraint pharmflow_identifier_migration_conflicts_v1_source_uq unique (source_table, source_row_id)
);

create table public.pharmflow_identifier_mapping_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  action text not null check (action in ('ADD', 'CORRECT', 'REMOVE')),
  identifier_id uuid references public.pharmflow_global_item_identifiers_v2(id) on delete set null,
  identifier_display text not null,
  identifier_key text not null,
  old_item_code text,
  new_item_code text,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid not null references auth.users(id),
  performed_at timestamptz not null default now()
);

alter table public.pharmflow_needs_review_v2
  add column identifier_display text,
  add column identifier_key text,
  add column resolution_block_code text,
  add column resolution_block_detail text;

create index pharmflow_needs_review_v2_identifier_key_idx
  on public.pharmflow_needs_review_v2(pharmacy_id, identifier_key)
  where status = 'PENDING';

alter table public.pharmflow_global_items_v2 enable row level security;
alter table public.pharmflow_global_item_identifiers_v2 enable row level security;
alter table public.pharmflow_identifier_migration_conflicts_v1 enable row level security;
alter table public.pharmflow_identifier_mapping_audit_v1 enable row level security;

-- No direct browser table access. The narrowly scoped RPCs below are the API.
revoke all on table public.pharmflow_global_items_v2 from anon, authenticated;
revoke all on table public.pharmflow_global_item_identifiers_v2 from anon, authenticated;
revoke all on table public.pharmflow_identifier_migration_conflicts_v1 from anon, authenticated;
revoke all on table public.pharmflow_identifier_mapping_audit_v1 from anon, authenticated;

do $$
declare
  v_global_rows bigint;
  v_global_keys bigint;
  v_conflicts bigint;
begin
  select count(*), count(distinct public.pharmflow_identifier_key_v2(gtin))
    into v_global_rows, v_global_keys
    from public.pharmflow_global_gtin_v1;

  select count(*) into v_conflicts
  from (
    select public.pharmflow_identifier_key_v2(gtin)
    from public.pharmflow_global_gtin_v1
    group by public.pharmflow_identifier_key_v2(gtin)
    having count(distinct btrim(item_code)) > 1
  ) x;

  if v_global_rows <> 52792 or v_global_keys <> 51860 or v_conflicts <> 164 then
    raise exception using message = format(
      'Identifier foundation baseline changed (rows=%s, unique_keys=%s, conflicts=%s); migration aborted',
      v_global_rows, v_global_keys, v_conflicts
    );
  end if;
end $$;

insert into public.pharmflow_global_items_v2 (
  item_code, item_name, group_name, category, sub_category
)
select distinct on (btrim(g.item_code))
  btrim(g.item_code), btrim(g.item_name), nullif(btrim(g.group_name), ''),
  nullif(btrim(g.category), ''), nullif(btrim(g.sub_category), '')
from public.pharmflow_global_gtin_v1 g
order by btrim(g.item_code), g.id;

insert into public.pharmflow_global_item_identifiers_v2 (
  item_code, identifier_display, identifier_key
)
select btrim(g.item_code), btrim(g.gtin), public.pharmflow_identifier_key_v2(g.gtin)
from public.pharmflow_global_gtin_v1 g
where not exists (
  select 1
  from public.pharmflow_global_gtin_v1 conflict
  where public.pharmflow_identifier_key_v2(conflict.gtin) = public.pharmflow_identifier_key_v2(g.gtin)
    and btrim(conflict.item_code) <> btrim(g.item_code)
);

insert into public.pharmflow_identifier_migration_conflicts_v1 (
  source_table, source_row_id, identifier_display, identifier_key,
  candidate_item_codes, conflict_type, details
)
select
  'pharmflow_global_gtin_v1',
  public.pharmflow_identifier_key_v2(g.gtin),
  min(btrim(g.gtin)),
  public.pharmflow_identifier_key_v2(g.gtin),
  jsonb_agg(distinct btrim(g.item_code) order by btrim(g.item_code)),
  'GLOBAL_MULTI_ITEM',
  jsonb_build_object('sourceRowCount', count(*))
from public.pharmflow_global_gtin_v1 g
group by public.pharmflow_identifier_key_v2(g.gtin)
having count(distinct btrim(g.item_code)) > 1;

do $$
declare
  v_items bigint;
  v_identifiers bigint;
  v_conflicts bigint;
begin
  select count(*) into v_items from public.pharmflow_global_items_v2;
  select count(*) into v_identifiers from public.pharmflow_global_item_identifiers_v2;
  select count(*) into v_conflicts from public.pharmflow_identifier_migration_conflicts_v1
    where source_table = 'pharmflow_global_gtin_v1' and conflict_type = 'GLOBAL_MULTI_ITEM';

  if v_items <> 52792 or v_identifiers <> 51696 or v_conflicts <> 164 then
    raise exception using message = format(
      'Identifier foundation backfill mismatch (items=%s, identifiers=%s, conflicts=%s); migration aborted',
      v_items, v_identifiers, v_conflicts
    );
  end if;
end $$;

create or replace function public.resolve_pharmflow_identifier_v2(
  p_pharmacy_id uuid,
  p_identifier_display text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := public.pharmflow_identifier_key_v2(p_identifier_display);
  v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_item public.pharmflow_global_items_v2%rowtype;
begin
  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
    raise exception 'Pharmacy access required';
  end if;
  if v_key = '' then
    raise exception 'Identifier is required';
  end if;
  select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where identifier_key = v_key;
  if v_mapping.id is null then return jsonb_build_object('found', false, 'identifierDisplay', btrim(p_identifier_display), 'identifierKey', v_key); end if;
  select * into v_item from public.pharmflow_global_items_v2 where item_code = v_mapping.item_code;
  return jsonb_build_object(
    'found', true, 'source', 'GLOBAL_V2', 'identifierId', v_mapping.id,
    'mappingRevision', v_mapping.mapping_revision, 'identifierDisplay', v_mapping.identifier_display,
    'identifierKey', v_mapping.identifier_key, 'itemCode', v_item.item_code,
    'itemName', v_item.item_name, 'groupName', v_item.group_name,
    'category', v_item.category, 'subCategory', v_item.sub_category
  );
end $$;

create or replace function public.search_pharmflow_global_items_v2(p_query text, p_limit integer default 50)
returns table(item_code text, item_name text, group_name text, category text, sub_category text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.item_code, i.item_name, i.group_name, i.category, i.sub_category
  from public.pharmflow_global_items_v2 i
  where auth.uid() is not null
    and (btrim(coalesce(p_query,'')) = ''
      or i.item_code ilike '%' || btrim(p_query) || '%'
      or i.item_name ilike '%' || btrim(p_query) || '%')
  order by i.item_code
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.add_pharmflow_global_identifier_v2(
  p_operation_id uuid, p_identifier_display text, p_item_code text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display text := btrim(coalesce(p_identifier_display,''));
  v_key text := public.pharmflow_identifier_key_v2(p_identifier_display);
  v_item_code text := btrim(coalesce(p_item_code,''));
  v_reason text := btrim(coalesce(p_reason,''));
  v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
begin
  if auth.uid() is null or not public.is_system_owner() then raise exception 'System Owner permission required'; end if;
  if p_operation_id is null or v_key='' or v_item_code='' or v_reason='' then raise exception 'Operation, identifier, item and reason are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 1152));
  select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where identifier_key=v_key for update;
  if v_mapping.id is not null and v_mapping.item_code <> v_item_code then raise exception 'Identifier is already mapped to another Item Code'; end if;
  if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_item_code) then raise exception 'Global Item Code does not exist'; end if;
  if v_mapping.id is null then
    insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by)
    values(v_item_code,v_display,v_key,auth.uid(),auth.uid()) returning * into v_mapping;
  end if;
  insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
  values(p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_mapping.item_code,v_reason,auth.uid())
  on conflict (operation_id) do nothing;
  return jsonb_build_object('success',true,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'itemCode',v_mapping.item_code);
end $$;

create or replace function public.correct_pharmflow_global_identifier_v2(
  p_operation_id uuid, p_identifier_id uuid, p_expected_mapping_revision bigint, p_new_item_code text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_old_item_code text;
  v_new_item_code text := btrim(coalesce(p_new_item_code,''));
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not public.is_system_owner() then raise exception 'System Owner permission required'; end if;
  if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_new_item_code='' or v_reason='' then raise exception 'Operation, identifier, revision, item and reason are required'; end if;
  select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id for update;
  if v_mapping.id is null then raise exception 'Identifier mapping is missing'; end if;
  if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Identifier mapping changed; refresh before correcting'; end if;
  if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_new_item_code) then raise exception 'Global Item Code does not exist'; end if;
  v_old_item_code:=v_mapping.item_code;
  update public.pharmflow_global_item_identifiers_v2 set item_code=v_new_item_code,mapping_revision=mapping_revision+1,updated_at=now(),updated_by=auth.uid() where id=v_mapping.id returning * into v_mapping;
  insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
  values(p_operation_id,'CORRECT',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,v_old_item_code,v_mapping.item_code,v_reason,auth.uid());
  return jsonb_build_object('success',true,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'itemCode',v_mapping.item_code);
end $$;

create or replace function public.remove_pharmflow_global_identifier_v2(
  p_operation_id uuid, p_identifier_id uuid, p_expected_mapping_revision bigint, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not public.is_system_owner() then raise exception 'System Owner permission required'; end if;
  if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_reason='' then raise exception 'Operation, identifier, revision and reason are required'; end if;
  select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id for update;
  if v_mapping.id is null then raise exception 'Identifier mapping is missing'; end if;
  if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Identifier mapping changed; refresh before removing'; end if;
  insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
  values(p_operation_id,'REMOVE',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,v_mapping.item_code,null,v_reason,auth.uid());
  delete from public.pharmflow_global_item_identifiers_v2 where id=v_mapping.id;
  return jsonb_build_object('success',true,'removedIdentifierId',v_mapping.id,'itemCode',v_mapping.item_code);
end $$;

create or replace function public.create_pharmflow_needs_review_v3(
  p_pharmacy_id uuid, p_workflow text, p_identifier_display text, p_raw_barcode text default null,
  p_session_id text default null, p_order_number text default null, p_order_name text default null,
  p_review_reason text default 'UNKNOWN_GTIN', p_master_item_code_hint text default null,
  p_master_item_name_hint text default null, p_source text default 'HANDHELD', p_device_id text default null
)
returns table(review_id uuid, pending_quantity integer, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display text := btrim(coalesce(p_identifier_display,''));
  v_key text := public.pharmflow_identifier_key_v2(p_identifier_display);
  v_id uuid;
  v_time timestamptz;
begin
  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  if v_key='' then raise exception 'Identifier is required'; end if;
  if upper(trim(coalesce(p_workflow,'RECEIVING'))) <> 'RECEIVING' then raise exception 'Invalid workflow'; end if;
  if upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))) not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason'; end if;
  if upper(btrim(coalesce(p_source,'HANDHELD'))) not in ('HANDHELD','PC') then raise exception 'Invalid source'; end if;
  insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,session_id,order_number,order_name,gtin,raw_barcode,identifier_display,identifier_key,pending_quantity,review_reason,master_item_code_hint,master_item_name_hint,source,device_id,created_by)
  values(p_pharmacy_id,'RECEIVING',nullif(btrim(coalesce(p_session_id,'')),''),nullif(btrim(coalesce(p_order_number,'')),''),nullif(btrim(coalesce(p_order_name,'')),''),v_display,nullif(p_raw_barcode,''),v_display,v_key,1,upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),nullif(btrim(coalesce(p_master_item_code_hint,'')),''),nullif(btrim(coalesce(p_master_item_name_hint,'')),''),upper(btrim(coalesce(p_source,'HANDHELD'))),nullif(btrim(coalesce(p_device_id,'')),''),auth.uid()) returning id,pharmflow_needs_review_v2.created_at into v_id,v_time;
  return query select v_id,1,v_time;
end $$;

create or replace function public.resolve_pharmflow_needs_review_v3(
  p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text,
  p_resolution_type text, p_resolution_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_order_status text;
  v_item_code text := btrim(coalesce(p_item_code,''));
begin
  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
  select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id for update;
  if v_review.id is null then raise exception 'Needs Review case is unavailable'; end if;
  if v_review.status <> 'PENDING' then raise exception 'Needs Review case is no longer pending'; end if;
  if nullif(btrim(coalesce(v_review.order_number,'')),'') is null then
    update public.pharmflow_needs_review_v2 set resolution_block_code='ORIGINAL_ORDER_UNAVAILABLE',resolution_block_detail='The case has no original Receiving order.',updated_at=now() where id=v_review.id;
    return jsonb_build_object('success',false,'blocked',true,'code','ORIGINAL_ORDER_UNAVAILABLE');
  end if;
  select status into v_order_status from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and order_number=v_review.order_number;
  if v_order_status is distinct from 'uploaded' then
    update public.pharmflow_needs_review_v2 set resolution_block_code='ORIGINAL_ORDER_UNAVAILABLE',resolution_block_detail='The original order is finalized, inactive, or unavailable.',updated_at=now() where id=v_review.id;
    return jsonb_build_object('success',false,'blocked',true,'code','ORIGINAL_ORDER_UNAVAILABLE','orderNumber',v_review.order_number);
  end if;
  if v_item_code='' or not exists(select 1 from public.pharmflow_order_source_items where pharmacy_id=p_pharmacy_id and order_number=v_review.order_number and item_code=v_item_code) then
    update public.pharmflow_needs_review_v2 set resolution_block_code='ITEM_NOT_IN_ORIGINAL_ORDER',resolution_block_detail='The selected item is not in the case original order.',updated_at=now() where id=v_review.id;
    return jsonb_build_object('success',false,'blocked',true,'code','ITEM_NOT_IN_ORIGINAL_ORDER','orderNumber',v_review.order_number);
  end if;
  if upper(btrim(coalesce(p_resolution_type,''))) <> 'LINK_ORDER_ITEM'
     or nullif(btrim(coalesce(p_resolution_transaction_id,'')),'') is null then
    update public.pharmflow_needs_review_v2 set resolution_block_code='RECEIVING_TRANSACTION_REQUIRED',resolution_block_detail='Resolution requires a Receiving transaction attributed to the original order.',updated_at=now() where id=v_review.id;
    return jsonb_build_object('success',false,'blocked',true,'code','RECEIVING_TRANSACTION_REQUIRED','orderNumber',v_review.order_number);
  end if;
  if not exists(
    select 1 from public.pharmflow_receiving_transactions_v1 t
    where t.pharmacy_id=p_pharmacy_id and t.transaction_id=btrim(p_resolution_transaction_id)
      and t.order_number=v_review.order_number and t.item_code=v_item_code and t.quantity>0
  ) then
    update public.pharmflow_needs_review_v2 set resolution_block_code='RECEIVING_TRANSACTION_ORDER_MISMATCH',resolution_block_detail='The supplied Receiving transaction does not belong to the original order and selected item.',updated_at=now() where id=v_review.id;
    return jsonb_build_object('success',false,'blocked',true,'code','RECEIVING_TRANSACTION_ORDER_MISMATCH','orderNumber',v_review.order_number);
  end if;
  update public.pharmflow_needs_review_v2
     set status='RESOLVED',resolved_item_code=v_item_code,resolved_item_name=btrim(coalesce(p_item_name,'')),resolution_type='LINK_ORDER_ITEM',resolution_transaction_id=btrim(p_resolution_transaction_id),resolved_by=auth.uid(),resolved_at=now(),resolution_block_code=null,resolution_block_detail=null,updated_at=now()
   where id=v_review.id;
  return jsonb_build_object('success',true,'orderNumber',v_review.order_number);
end $$;

revoke all on function public.resolve_pharmflow_identifier_v2(uuid,text) from public;
revoke all on function public.search_pharmflow_global_items_v2(text,integer) from public;
revoke all on function public.add_pharmflow_global_identifier_v2(uuid,text,text,text) from public;
revoke all on function public.correct_pharmflow_global_identifier_v2(uuid,uuid,bigint,text,text) from public;
revoke all on function public.remove_pharmflow_global_identifier_v2(uuid,uuid,bigint,text) from public;
revoke all on function public.create_pharmflow_needs_review_v3(uuid,text,text,text,text,text,text,text,text,text,text,text) from public;
revoke all on function public.resolve_pharmflow_needs_review_v3(uuid,uuid,text,text,text,text) from public;
grant execute on function public.resolve_pharmflow_identifier_v2(uuid,text) to authenticated;
grant execute on function public.search_pharmflow_global_items_v2(text,integer) to authenticated;
grant execute on function public.add_pharmflow_global_identifier_v2(uuid,text,text,text) to authenticated;
grant execute on function public.correct_pharmflow_global_identifier_v2(uuid,uuid,bigint,text,text) to authenticated;
grant execute on function public.remove_pharmflow_global_identifier_v2(uuid,uuid,bigint,text) to authenticated;
grant execute on function public.create_pharmflow_needs_review_v3(uuid,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.resolve_pharmflow_needs_review_v3(uuid,uuid,text,text,text,text) to authenticated;

commit;
