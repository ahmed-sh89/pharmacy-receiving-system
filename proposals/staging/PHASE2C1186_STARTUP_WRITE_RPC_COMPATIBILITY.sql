-- PHASE2C1186 — Staging-only Receiving / Active Order Manifest write RPCs.
-- Restores the exact repository-approved contracts absent from Staging.
-- Project: tovkcakucyagvbzvlnks ONLY. No data backfill or row mutations.
-- Destructive manifest clearing/reset and order-source maintenance RPCs are
-- intentionally excluded; this migration restores only non-destructive writes.

begin;

do $$
begin
  if to_regclass('public.pharmflow_active_order_manifest_v1') is null
     or to_regclass('public.pharmflow_workspace_generation_v1') is null
     or to_regclass('public.pharmflow_cloud_workspaces') is null
     or to_regclass('public.pharmflow_receiving_transactions_v1') is null
     or to_regprocedure('public.pharmflow_manifest_member_v2(uuid)') is null
     or to_regprocedure('public.pharmflow_receiving_member_v2(uuid)') is null
     or to_regprocedure('public.pharmflow_can_access_pharmacy(uuid)') is null
     or to_regprocedure('public.save_pharmflow_cloud_workspace(uuid,jsonb,text)') is null then
    raise exception 'Required Staging workspace tables or membership contracts are missing';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='pharmflow_active_order_manifest_v1' and column_name='workspace_generation' and data_type='bigint')
     or (select count(*) from information_schema.columns where table_schema='public' and table_name='pharmflow_workspace_generation_v1' and column_name in ('pharmacy_id','generation'))<>2
     or (select count(*) from information_schema.columns where table_schema='public' and table_name='pharmflow_cloud_workspaces' and column_name in ('pharmacy_id','workspace','updated_by','device_id'))<>4
     or (select count(*) from information_schema.columns where table_schema='public' and table_name='pharmflow_receiving_transactions_v1' and column_name in ('pharmacy_id','transaction_id','item_code','payload','created_by'))<>5 then
    raise exception 'Staging workspace/ledger table columns differ from the approved RPC contracts';
  end if;
  if has_table_privilege('anon','public.pharmflow_active_order_manifest_v1','INSERT')
     or has_table_privilege('authenticated','public.pharmflow_active_order_manifest_v1','INSERT')
     or has_table_privilege('anon','public.pharmflow_cloud_workspaces','INSERT')
     or has_table_privilege('authenticated','public.pharmflow_cloud_workspaces','INSERT')
     or has_table_privilege('anon','public.pharmflow_receiving_transactions_v1','INSERT')
     or has_table_privilege('authenticated','public.pharmflow_receiving_transactions_v1','INSERT') then
    raise exception 'Direct API table writes are granted; stop and inspect Staging before restoring RPCs';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_pharmflow_cloud_workspace_guarded','save_pharmflow_active_order_manifest_v3','append_pharmflow_cloud_transaction_v2')) then
    raise exception 'One or more target RPC names already exist; compare exact signatures before applying';
  end if;
end $$;

create or replace function public.save_pharmflow_cloud_workspace_guarded(
  p_pharmacy_id uuid,
  p_workspace jsonb,
  p_device_id text,
  p_expected_generation bigint
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_generation bigint;
begin
  if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then
    raise exception 'Pharmacy access required';
  end if;
  insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation)
  values(p_pharmacy_id,0) on conflict(pharmacy_id) do nothing;
  select generation into v_generation from public.pharmflow_workspace_generation_v1
   where pharmacy_id=p_pharmacy_id for update;
  if coalesce(p_expected_generation,-1)<>coalesce(v_generation,0) then
    raise exception 'WORKSPACE_RESET_CONFLICT';
  end if;
  perform public.save_pharmflow_cloud_workspace(p_pharmacy_id,p_workspace,p_device_id);
  return true;
end;
$$;

create or replace function public.save_pharmflow_active_order_manifest_v3(
  p_pharmacy_id uuid,
  p_manifest jsonb,
  p_expected_generation bigint
)
returns table(revision bigint,updated_at timestamptz,order_files integer,order_items integer,workspace_generation bigint)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_files integer; v_items integer; v_generation bigint;
begin
  if public.pharmflow_manifest_member_v2(p_pharmacy_id) is not true then
    raise exception 'Pharmacy access required';
  end if;
  insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation)
  values(p_pharmacy_id,0) on conflict(pharmacy_id) do nothing;
  select g.generation into v_generation from public.pharmflow_workspace_generation_v1 g
   where g.pharmacy_id=p_pharmacy_id for update;
  if coalesce(p_expected_generation,-1)<>coalesce(v_generation,0) then
    raise exception 'STALE_WORKSPACE_GENERATION';
  end if;
  v_files:=jsonb_array_length(coalesce(p_manifest->'orderFiles','[]'::jsonb));
  v_items:=jsonb_array_length(coalesce(p_manifest->'orderData','[]'::jsonb));
  if v_files<=0 or v_items<=0 then
    raise exception 'Active Order Manifest requires orderFiles and orderData';
  end if;
  insert into public.pharmflow_active_order_manifest_v1(pharmacy_id,manifest,revision,updated_at,updated_by,workspace_generation)
  values(p_pharmacy_id,p_manifest,1,now(),auth.uid(),v_generation)
  on conflict(pharmacy_id) do update set manifest=excluded.manifest,
    revision=public.pharmflow_active_order_manifest_v1.revision+1,
    updated_at=now(),updated_by=auth.uid(),workspace_generation=v_generation;
  return query select m.revision,m.updated_at,
    jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
    jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),m.workspace_generation
    from public.pharmflow_active_order_manifest_v1 m where m.pharmacy_id=p_pharmacy_id;
end;
$$;

create or replace function public.append_pharmflow_cloud_transaction_v2(
  p_pharmacy_id uuid,p_transaction_id text,p_order_number text,p_item_code text,
  p_item_name text,p_gtin text,p_quantity integer,p_source text,p_device_id text,
  p_occurred_at timestamptz,p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if public.pharmflow_receiving_member_v2(p_pharmacy_id) is not true then
    raise exception 'Pharmacy access required';
  end if;
  if nullif(trim(coalesce(p_transaction_id,'')),'') is null then raise exception 'Transaction ID required'; end if;
  if nullif(trim(coalesce(p_item_code,'')),'') is null then raise exception 'Item Code required'; end if;
  insert into public.pharmflow_receiving_transactions_v1(
    pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload,created_by
  ) values(
    p_pharmacy_id,trim(p_transaction_id),nullif(trim(coalesce(p_order_number,'')),''),trim(p_item_code),
    coalesce(p_item_name,''),coalesce(p_gtin,''),coalesce(p_quantity,0),coalesce(p_source,'RECEIVING'),
    coalesce(p_device_id,''),coalesce(p_occurred_at,now()),coalesce(p_payload,'{}'::jsonb),auth.uid()
  ) on conflict(pharmacy_id,transaction_id) do nothing;
  return true;
end;
$$;

revoke all on function public.save_pharmflow_cloud_workspace_guarded(uuid,jsonb,text,bigint) from public,anon,authenticated;
revoke all on function public.save_pharmflow_active_order_manifest_v3(uuid,jsonb,bigint) from public,anon,authenticated;
revoke all on function public.append_pharmflow_cloud_transaction_v2(uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.save_pharmflow_cloud_workspace_guarded(uuid,jsonb,text,bigint) to authenticated;
grant execute on function public.save_pharmflow_active_order_manifest_v3(uuid,jsonb,bigint) to authenticated;
grant execute on function public.append_pharmflow_cloud_transaction_v2(uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
