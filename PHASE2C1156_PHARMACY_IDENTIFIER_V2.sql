-- PharmFlow Phase 2C.11.5.6 — additive pharmacy-scoped identifier extension.
-- Existing pharmflow_pharmacy_gtin_v1 rows and public legacy contracts remain
-- available.  Identifier display/key semantics are deliberately text-safe.

begin;

-- Fail before changing the table if the planned key backfill is ambiguous.
do $$
begin
  if exists (
    select 1
      from public.pharmflow_pharmacy_gtin_v1
     group by pharmacy_id, upper(btrim(gtin))
    having count(*) > 1
  ) then
    raise exception 'Unsafe pharmacy identifier backfill: duplicate pharmacy_id/identifier_key values exist';
  end if;
end $$;

alter table public.pharmflow_pharmacy_gtin_v1
  add column if not exists identifier_display text,
  add column if not exists identifier_key text;

update public.pharmflow_pharmacy_gtin_v1
   set identifier_display = btrim(gtin),
       identifier_key = upper(btrim(gtin))
 where identifier_display is null
    or identifier_key is null;

do $$
begin
  if exists (
    select 1 from public.pharmflow_pharmacy_gtin_v1
     where btrim(coalesce(identifier_display,'')) = ''
        or btrim(coalesce(identifier_key,'')) = ''
  ) then
    raise exception 'Unsafe pharmacy identifier backfill: blank identifier values exist';
  end if;
end $$;

alter table public.pharmflow_pharmacy_gtin_v1
  alter column identifier_display set not null,
  alter column identifier_key set not null;

create unique index if not exists pharmflow_pharmacy_gtin_v1_pharmacy_identifier_key_key
  on public.pharmflow_pharmacy_gtin_v1(pharmacy_id, identifier_key);

-- Legacy numeric callers still write gtin. Keep the additive V2 columns in
-- sync without rewriting the original legacy column or its unique key.
create or replace function public.sync_pharmflow_pharmacy_identifier_v2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.identifier_display := btrim(coalesce(new.identifier_display, new.gtin, ''));
  new.identifier_key := public.pharmflow_identifier_key_v2(new.identifier_display);
  if new.identifier_display = '' then
    raise exception 'Identifier is required';
  end if;
  if btrim(coalesce(new.gtin,'')) = '' then
    new.gtin := new.identifier_display;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_pharmflow_pharmacy_identifier_v2 on public.pharmflow_pharmacy_gtin_v1;
create trigger trg_sync_pharmflow_pharmacy_identifier_v2
before insert or update of gtin, identifier_display
on public.pharmflow_pharmacy_gtin_v1
for each row execute function public.sync_pharmflow_pharmacy_identifier_v2();

create table if not exists public.pharmflow_pharmacy_identifier_mapping_audit_v2 (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  operation_id uuid not null,
  action text not null check (action in ('ADD','CORRECT','REMOVE')),
  identifier_display text not null,
  identifier_key text not null,
  mapping_id uuid,
  old_item_code text,
  new_item_code text,
  reason text not null,
  result jsonb not null,
  performed_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (pharmacy_id, operation_id)
);
create index if not exists idx_pharmflow_pharmacy_identifier_mapping_audit_v2_lookup
  on public.pharmflow_pharmacy_identifier_mapping_audit_v2(pharmacy_id, identifier_key, created_at desc);
alter table public.pharmflow_pharmacy_identifier_mapping_audit_v2 enable row level security;

create or replace function public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.pharmacy_members pm
         join public.pharmacies p on p.id = pm.pharmacy_id
        where pm.pharmacy_id = p_pharmacy_id
          and pm.user_id = auth.uid()
          and pm.active is true
          and lower(coalesce(pm.role,'')) = 'admin'
          and p.status = 'active'
     );
$$;

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
  v_pharmacy_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_global_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_item public.pharmflow_global_items_v2%rowtype;
begin
  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
    raise exception 'Pharmacy access required';
  end if;
  if v_key = '' then
    raise exception 'Identifier is required';
  end if;

  select * into v_pharmacy_mapping
    from public.pharmflow_pharmacy_gtin_v1
   where pharmacy_id = p_pharmacy_id
     and identifier_key = v_key;
  if v_pharmacy_mapping.id is not null then
    return jsonb_build_object(
      'found', true, 'source', 'PHARMACY_V2', 'mappingScope', 'PHARMACY',
      'identifierId', v_pharmacy_mapping.id,
      'mappingRevision', v_pharmacy_mapping.mapping_revision,
      'identifierDisplay', v_pharmacy_mapping.identifier_display,
      'identifierKey', v_pharmacy_mapping.identifier_key,
      'itemCode', v_pharmacy_mapping.item_code,
      'itemName', v_pharmacy_mapping.item_name
    );
  end if;

  select * into v_global_mapping
    from public.pharmflow_global_item_identifiers_v2
   where identifier_key = v_key;
  if v_global_mapping.id is null then
    return jsonb_build_object('found', false, 'identifierDisplay', btrim(p_identifier_display), 'identifierKey', v_key);
  end if;
  select * into v_item from public.pharmflow_global_items_v2 where item_code = v_global_mapping.item_code;
  return jsonb_build_object(
    'found', true, 'source', 'GLOBAL_V2', 'mappingScope', 'GLOBAL',
    'identifierId', v_global_mapping.id, 'mappingRevision', v_global_mapping.mapping_revision,
    'identifierDisplay', v_global_mapping.identifier_display, 'identifierKey', v_global_mapping.identifier_key,
    'itemCode', v_item.item_code, 'itemName', v_item.item_name,
    'groupName', v_item.group_name, 'category', v_item.category, 'subCategory', v_item.sub_category
  );
end;
$$;

create or replace function public.add_pharmflow_pharmacy_identifier_v2(
  p_operation_id uuid, p_pharmacy_id uuid, p_identifier_display text,
  p_item_code text, p_item_name text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display text := btrim(coalesce(p_identifier_display,''));
  v_key text := public.pharmflow_identifier_key_v2(p_identifier_display);
  v_code text := btrim(coalesce(p_item_code,''));
  v_name text := btrim(coalesce(p_item_name,''));
  v_reason text := btrim(coalesce(p_reason,''));
  v_existing_audit public.pharmflow_pharmacy_identifier_mapping_audit_v2%rowtype;
  v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_result jsonb;
begin
  if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access is required'; end if;
  if p_operation_id is null or v_display='' or v_key='' or v_code='' or v_name='' or v_reason='' then raise exception 'Operation, identifier, Item Code, Item Name and reason are required'; end if;
  select * into v_existing_audit from public.pharmflow_pharmacy_identifier_mapping_audit_v2 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
  if v_existing_audit.id is not null then
    if v_existing_audit.action<>'ADD' or v_existing_audit.identifier_key<>v_key or coalesce(v_existing_audit.new_item_code,'')<>v_code then raise exception 'Operation ID was already used with different pharmacy mapping input'; end if;
    return v_existing_audit.result;
  end if;
  select * into v_mapping from public.pharmflow_pharmacy_gtin_v1 where pharmacy_id=p_pharmacy_id and identifier_key=v_key for update;
  if v_mapping.id is not null and v_mapping.item_code<>v_code then raise exception 'Identifier conflict: this pharmacy already mapped this identifier to Item Code %',v_mapping.item_code; end if;
  if v_mapping.id is null then
    insert into public.pharmflow_pharmacy_gtin_v1(pharmacy_id,gtin,identifier_display,identifier_key,item_code,item_name,source,created_by,updated_by)
    values(p_pharmacy_id,v_display,v_display,v_key,v_code,v_name,'PHARMACY_LEARNED',auth.uid(),auth.uid()) returning * into v_mapping;
  end if;
  v_result:=jsonb_build_object('success',true,'scope','PHARMACY','action','ADD','identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'itemCode',v_mapping.item_code,'itemName',v_mapping.item_name);
  insert into public.pharmflow_pharmacy_identifier_mapping_audit_v2(pharmacy_id,operation_id,action,identifier_display,identifier_key,mapping_id,new_item_code,reason,result)
  values(p_pharmacy_id,p_operation_id,'ADD',v_display,v_key,v_mapping.id,v_code,v_reason,v_result);
  return v_result;
end;
$$;

create or replace function public.correct_pharmflow_pharmacy_identifier_v2(
  p_operation_id uuid, p_pharmacy_id uuid, p_identifier_id uuid,
  p_expected_mapping_revision bigint, p_new_item_code text, p_new_item_name text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := btrim(coalesce(p_new_item_code,'')); v_name text := btrim(coalesce(p_new_item_name,'')); v_reason text := btrim(coalesce(p_reason,''));
  v_audit public.pharmflow_pharmacy_identifier_mapping_audit_v2%rowtype; v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype; v_old_item_code text; v_result jsonb;
begin
  if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access is required'; end if;
  if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_code='' or v_name='' or v_reason='' then raise exception 'Operation, mapping, revision, Item Code, Item Name and reason are required'; end if;
  select * into v_audit from public.pharmflow_pharmacy_identifier_mapping_audit_v2 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
  if v_audit.id is not null then
    if v_audit.action<>'CORRECT' or v_audit.mapping_id<>p_identifier_id or coalesce(v_audit.new_item_code,'')<>v_code then raise exception 'Operation ID was already used with different pharmacy mapping input'; end if;
    return v_audit.result;
  end if;
  select * into v_mapping from public.pharmflow_pharmacy_gtin_v1 where pharmacy_id=p_pharmacy_id and id=p_identifier_id for update;
  if v_mapping.id is null then raise exception 'Pharmacy identifier mapping not found'; end if;
  if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Pharmacy identifier mapping changed; reload before correcting'; end if;
  v_old_item_code:=v_mapping.item_code;
  update public.pharmflow_pharmacy_gtin_v1 set item_code=v_code,item_name=v_name,updated_by=auth.uid(),updated_at=now(),mapping_revision=mapping_revision+1 where id=v_mapping.id returning * into v_mapping;
  v_result:=jsonb_build_object('success',true,'scope','PHARMACY','action','CORRECT','identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'itemCode',v_mapping.item_code,'itemName',v_mapping.item_name);
  insert into public.pharmflow_pharmacy_identifier_mapping_audit_v2(pharmacy_id,operation_id,action,identifier_display,identifier_key,mapping_id,old_item_code,new_item_code,reason,result)
  values(p_pharmacy_id,p_operation_id,'CORRECT',v_mapping.identifier_display,v_mapping.identifier_key,v_mapping.id,v_old_item_code,v_code,v_reason,v_result);
  return v_result;
end;
$$;

create or replace function public.remove_pharmflow_pharmacy_identifier_v2(
  p_operation_id uuid, p_pharmacy_id uuid, p_identifier_id uuid,
  p_expected_mapping_revision bigint, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := btrim(coalesce(p_reason,'')); v_audit public.pharmflow_pharmacy_identifier_mapping_audit_v2%rowtype;
  v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype; v_result jsonb;
begin
  if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access is required'; end if;
  if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_reason='' then raise exception 'Operation, mapping, revision and reason are required'; end if;
  select * into v_audit from public.pharmflow_pharmacy_identifier_mapping_audit_v2 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
  if v_audit.id is not null then
    if v_audit.action<>'REMOVE' or v_audit.mapping_id<>p_identifier_id then raise exception 'Operation ID was already used with different pharmacy mapping input'; end if;
    return v_audit.result;
  end if;
  select * into v_mapping from public.pharmflow_pharmacy_gtin_v1 where pharmacy_id=p_pharmacy_id and id=p_identifier_id for update;
  if v_mapping.id is null then raise exception 'Pharmacy identifier mapping not found'; end if;
  if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Pharmacy identifier mapping changed; reload before removing'; end if;
  v_result:=jsonb_build_object('success',true,'scope','PHARMACY','action','REMOVE','identifierId',v_mapping.id,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'itemCode',v_mapping.item_code);
  delete from public.pharmflow_pharmacy_gtin_v1 where id=v_mapping.id;
  insert into public.pharmflow_pharmacy_identifier_mapping_audit_v2(pharmacy_id,operation_id,action,identifier_display,identifier_key,mapping_id,old_item_code,reason,result)
  values(p_pharmacy_id,p_operation_id,'REMOVE',v_mapping.identifier_display,v_mapping.identifier_key,v_mapping.id,v_mapping.item_code,v_reason,v_result);
  return v_result;
end;
$$;

-- Retains the public receiving RPC signature. Only identifier matching changes:
-- exact text key, revision and payload provenance are now validated instead of
-- a digits-only GTIN. Quantity and transaction-idempotency semantics are unchanged.
create or replace function public.append_pharmflow_learned_transaction_v3(
  p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text,
  p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text,
  p_occurred_at timestamptz, p_payload jsonb, p_mapping_id uuid, p_mapping_revision bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identifier_display text := btrim(coalesce(p_gtin,''));
  v_identifier_key text := public.pharmflow_identifier_key_v2(p_gtin);
  v_item_code text := trim(coalesce(p_item_code,''));
  v_transaction_id text := trim(coalesce(p_transaction_id,''));
  v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_existing public.pharmflow_receiving_transactions_v1%rowtype;
begin
  if not public.pharmflow_gtin_lifecycle_member_v3(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  if v_transaction_id='' or v_identifier_key='' or v_item_code='' or p_mapping_id is null or coalesce(p_mapping_revision,0)<=0 or coalesce(p_quantity,0)<=0 then raise exception 'Valid transaction, learned mapping, item, identifier and positive quantity are required'; end if;
  lock table public.pharmflow_pharmacy_gtin_v1 in share mode;
  select * into v_mapping from public.pharmflow_pharmacy_gtin_v1 g where g.pharmacy_id=p_pharmacy_id and g.id=p_mapping_id and g.mapping_revision=p_mapping_revision and g.identifier_key=v_identifier_key and upper(trim(g.item_code))=upper(v_item_code) for share;
  if v_mapping.id is null then raise exception 'Learned mapping changed; resolve the identifier again'; end if;
  if coalesce(p_payload #>> '{gtinResolution,kind}','')<>'PHARMACY_LEARNED' or coalesce(p_payload #>> '{gtinResolution,mappingId}','')<>p_mapping_id::text or coalesce(p_payload #>> '{gtinResolution,mappingRevision}','')<>p_mapping_revision::text or public.pharmflow_identifier_key_v2(coalesce(p_payload #>> '{gtinResolution,identifierKey}',p_payload #>> '{gtinResolution,normalizedGtin}',''))<>v_identifier_key or upper(trim(coalesce(p_payload #>> '{gtinResolution,resolvedItemCode}','')))<>upper(v_item_code) then raise exception 'Learned transaction provenance does not match the authoritative mapping'; end if;
  insert into public.pharmflow_receiving_transactions_v1(pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload,created_by)
  values(p_pharmacy_id,v_transaction_id,nullif(trim(coalesce(p_order_number,'')),''),v_item_code,coalesce(p_item_name,''),v_identifier_display,p_quantity,coalesce(p_source,'SCANNER'),coalesce(p_device_id,''),coalesce(p_occurred_at,now()),coalesce(p_payload,'{}'::jsonb),auth.uid()) on conflict(pharmacy_id,transaction_id) do nothing;
  if not found then
    select * into v_existing from public.pharmflow_receiving_transactions_v1 t where t.pharmacy_id=p_pharmacy_id and t.transaction_id=v_transaction_id;
    if v_existing.transaction_id is null or coalesce(v_existing.order_number,'')<>coalesce(nullif(trim(p_order_number),''),'') or upper(trim(v_existing.item_code))<>upper(v_item_code) or public.pharmflow_identifier_key_v2(v_existing.gtin)<>v_identifier_key or v_existing.quantity<>p_quantity or coalesce(v_existing.payload #>> '{gtinResolution,mappingId}','')<>p_mapping_id::text or coalesce(v_existing.payload #>> '{gtinResolution,mappingRevision}','')<>p_mapping_revision::text then raise exception 'Transaction ID already exists with different learned-scan data'; end if;
  end if;
  return true;
end;
$$;

revoke all on table public.pharmflow_pharmacy_identifier_mapping_audit_v2 from public, anon, authenticated;
revoke all on function public.add_pharmflow_pharmacy_identifier_v2(uuid,uuid,text,text,text,text) from public, anon;
revoke all on function public.correct_pharmflow_pharmacy_identifier_v2(uuid,uuid,uuid,bigint,text,text,text) from public, anon;
revoke all on function public.remove_pharmflow_pharmacy_identifier_v2(uuid,uuid,uuid,bigint,text) from public, anon;
grant execute on function public.add_pharmflow_pharmacy_identifier_v2(uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.correct_pharmflow_pharmacy_identifier_v2(uuid,uuid,uuid,bigint,text,text,text) to authenticated;
grant execute on function public.remove_pharmflow_pharmacy_identifier_v2(uuid,uuid,uuid,bigint,text) to authenticated;

commit;
