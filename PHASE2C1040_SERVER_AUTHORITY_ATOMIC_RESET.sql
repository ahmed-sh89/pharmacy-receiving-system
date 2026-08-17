-- ============================================================
-- PharmFlow Phase 2C.10.4.0
-- SERVER AUTHORITY + ATOMIC RESET GENERATION FENCE
-- Production-safe migration. Does NOT touch Global GTIN, Returns Archive,
-- finalized Historical Data, users, or other pharmacies.
-- ============================================================

alter table public.pharmflow_active_order_manifest_v1
    add column if not exists workspace_generation bigint not null default 0;

-- Current generation + manifest are now one authority boundary.
create or replace function public.save_pharmflow_active_order_manifest_v3(
    p_pharmacy_id uuid,
    p_manifest jsonb,
    p_expected_generation bigint
)
returns table(revision bigint, updated_at timestamptz, order_files integer, order_items integer, workspace_generation bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_files integer; v_items integer; v_generation bigint;
begin
    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
    insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation) values(p_pharmacy_id,0) on conflict(pharmacy_id) do nothing;
    select g.generation into v_generation from public.pharmflow_workspace_generation_v1 g where g.pharmacy_id=p_pharmacy_id for update;
    if coalesce(p_expected_generation,-1) <> coalesce(v_generation,0) then raise exception 'STALE_WORKSPACE_GENERATION'; end if;
    v_files:=jsonb_array_length(coalesce(p_manifest->'orderFiles','[]'::jsonb));
    v_items:=jsonb_array_length(coalesce(p_manifest->'orderData','[]'::jsonb));
    if v_files<=0 or v_items<=0 then raise exception 'Active Order Manifest requires orderFiles and orderData'; end if;
    insert into public.pharmflow_active_order_manifest_v1(pharmacy_id,manifest,revision,updated_at,updated_by,workspace_generation)
    values(p_pharmacy_id,p_manifest,1,now(),auth.uid(),v_generation)
    on conflict(pharmacy_id) do update set manifest=excluded.manifest, revision=public.pharmflow_active_order_manifest_v1.revision+1,
        updated_at=now(),updated_by=auth.uid(),workspace_generation=v_generation;
    return query select m.revision,m.updated_at,
      jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
      jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),m.workspace_generation
      from public.pharmflow_active_order_manifest_v1 m where m.pharmacy_id=p_pharmacy_id;
end; $$;

create or replace function public.get_pharmflow_active_order_manifest_v3(p_pharmacy_id uuid)
returns table(manifest jsonb, revision bigint, updated_at timestamptz, order_files integer, order_items integer, workspace_generation bigint)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
    return query select m.manifest,m.revision,m.updated_at,
      jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
      jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),m.workspace_generation
      from public.pharmflow_active_order_manifest_v1 m where m.pharmacy_id=p_pharmacy_id;
end; $$;

-- Reset is ONE database transaction. If any statement fails, NOTHING is reset.
create or replace function public.atomic_reset_pharmflow_current_workspace_v3(p_pharmacy_id uuid,p_confirmation text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_generation bigint; v_orders bigint:=0; v_sources bigint:=0; v_manifest bigint:=0; v_receiving bigint:=0;
begin
    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
    if upper(trim(coalesce(p_confirmation,'')))<>'RESET CURRENT WORKSPACE' then raise exception 'Invalid reset confirmation'; end if;
    insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation,reset_at,reset_by,updated_at)
      values(p_pharmacy_id,1,now(),auth.uid(),now())
      on conflict(pharmacy_id) do update set generation=public.pharmflow_workspace_generation_v1.generation+1,reset_at=now(),reset_by=auth.uid(),updated_at=now()
      returning generation into v_generation;
    delete from public.pharmflow_order_source_items s using public.pharmflow_orders o
      where s.pharmacy_id=p_pharmacy_id and o.pharmacy_id=p_pharmacy_id
      and upper(trim(s.order_number))=upper(trim(o.order_number))
      and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');
    get diagnostics v_sources=row_count;
    delete from public.pharmflow_orders o where o.pharmacy_id=p_pharmacy_id
      and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');
    get diagnostics v_orders=row_count;
    delete from public.pharmflow_active_order_manifest_v1 where pharmacy_id=p_pharmacy_id;
    get diagnostics v_manifest=row_count;
    delete from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id;
    get diagnostics v_receiving=row_count;
    perform public.clear_pharmflow_cloud_workspace(p_pharmacy_id);
    return jsonb_build_object('success',true,'generation',v_generation,'active_orders_deleted',v_orders,
      'source_rows_deleted',v_sources,'manifest_rows_deleted',v_manifest,'receiving_transactions_deleted',v_receiving,
      'reset_at',now());
end; $$;

revoke all on function public.save_pharmflow_active_order_manifest_v3(uuid,jsonb,bigint) from public,anon;
revoke all on function public.get_pharmflow_active_order_manifest_v3(uuid) from public,anon;
revoke all on function public.atomic_reset_pharmflow_current_workspace_v3(uuid,text) from public,anon;
grant execute on function public.save_pharmflow_active_order_manifest_v3(uuid,jsonb,bigint) to authenticated;
grant execute on function public.get_pharmflow_active_order_manifest_v3(uuid) to authenticated;
grant execute on function public.atomic_reset_pharmflow_current_workspace_v3(uuid,text) to authenticated;
select pg_notify('pgrst','reload schema');
