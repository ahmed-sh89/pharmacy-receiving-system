-- ============================================================
-- PharmFlow Phase 2C.10.5.5
-- RUNTIME ROOT CLEANUP — RESET V4
-- No storage.objects DML. Review media is deleted by JS Storage API first.
-- ============================================================

create or replace function public.atomic_reset_pharmflow_current_workspace_v4(
    p_pharmacy_id uuid,
    p_confirmation text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $$
declare
    v_generation bigint;
    v_orders bigint:=0;
    v_sources bigint:=0;
    v_manifest bigint:=0;
    v_receiving bigint:=0;
    v_reviews bigint:=0;
begin
    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if upper(trim(coalesce(p_confirmation,''))) <> 'RESET CURRENT WORKSPACE' then
        raise exception 'Invalid reset confirmation';
    end if;

    insert into public.pharmflow_workspace_generation_v1(
        pharmacy_id,generation,reset_at,reset_by,updated_at
    )
    values(p_pharmacy_id,1,now(),auth.uid(),now())
    on conflict(pharmacy_id) do update
    set generation=public.pharmflow_workspace_generation_v1.generation+1,
        reset_at=now(),reset_by=auth.uid(),updated_at=now()
    returning generation into v_generation;

    delete from public.pharmflow_order_source_items s
    using public.pharmflow_orders o
    where s.pharmacy_id=p_pharmacy_id
      and o.pharmacy_id=p_pharmacy_id
      and upper(trim(s.order_number))=upper(trim(o.order_number))
      and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');
    get diagnostics v_sources=row_count;

    delete from public.pharmflow_orders
    where pharmacy_id=p_pharmacy_id
      and lower(trim(coalesce(status,'uploaded'))) not in ('received','finalized','closed');
    get diagnostics v_orders=row_count;

    delete from public.pharmflow_active_order_manifest_v1
    where pharmacy_id=p_pharmacy_id;
    get diagnostics v_manifest=row_count;

    delete from public.pharmflow_receiving_transactions_v1
    where pharmacy_id=p_pharmacy_id;
    get diagnostics v_receiving=row_count;

    update public.pharmflow_needs_review_v2
       set status='DELETED',photo_path=null,updated_at=now()
     where pharmacy_id=p_pharmacy_id
       and workflow='RECEIVING'
       and status='PENDING';
    get diagnostics v_reviews=row_count;

    perform public.clear_pharmflow_cloud_workspace(p_pharmacy_id);

    return jsonb_build_object(
        'success',true,
        'generation',v_generation,
        'active_orders_deleted',v_orders,
        'source_rows_deleted',v_sources,
        'manifest_rows_deleted',v_manifest,
        'receiving_transactions_deleted',v_receiving,
        'needs_review_deleted',v_reviews,
        'reset_at',now()
    );
end;
$$;

revoke all on function public.atomic_reset_pharmflow_current_workspace_v4(uuid,text)
from public,anon;

grant execute on function public.atomic_reset_pharmflow_current_workspace_v4(uuid,text)
to authenticated;

select pg_notify('pgrst','reload schema');
