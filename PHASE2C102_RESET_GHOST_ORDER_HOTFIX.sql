-- ============================================================
-- PharmFlow Phase 2C.10.2 — Reset / Ghost Active Order Hotfix
-- Current workspace only. Does NOT delete finalized history,
-- Global GTIN Master, Returns Archive, users, or other pharmacies.
-- ============================================================

create or replace function public.discard_all_pharmflow_active_orders(
    p_pharmacy_id uuid,
    p_confirmation text
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if upper(trim(coalesce(p_confirmation,''))) <> 'RESET CURRENT WORKSPACE' then
        raise exception 'Invalid reset confirmation';
    end if;

    -- Remove source rows only for unfinished orders. Finalized/received history
    -- remains protected and untouched.
    delete from public.pharmflow_order_source_items s
    using public.pharmflow_orders o
    where s.pharmacy_id=p_pharmacy_id
      and o.pharmacy_id=p_pharmacy_id
      and upper(trim(s.order_number))=upper(trim(o.order_number))
      and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    delete from public.pharmflow_orders o
    where o.pharmacy_id=p_pharmacy_id
      and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    return true;
end;
$$;

revoke all on function public.discard_all_pharmflow_active_orders(uuid,text) from public,anon;
grant execute on function public.discard_all_pharmflow_active_orders(uuid,text) to authenticated;

select pg_notify('pgrst','reload schema');
