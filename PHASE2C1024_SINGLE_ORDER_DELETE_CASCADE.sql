-- ============================================================
-- PharmFlow Phase 2C.10.2.4
-- Single finalized order deletion: cloud-authoritative full cascade.
-- Run ONCE in Supabase SQL Editor before testing this build.
--
-- Deletes ONLY the selected pharmacy/order from:
--   1) finalized cloud archive payload
--   2) immutable original uploaded-order source rows
--   3) order lifecycle registry
--
-- Does NOT touch Global GTIN Master, Returns Archive, users,
-- active unrelated orders, or other pharmacies.
-- ============================================================

create or replace function public.delete_pharmflow_order_complete(
    p_pharmacy_id uuid,
    p_order_number text,
    p_confirmation text
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
    v_order text:=upper(trim(coalesce(p_order_number,'')));
begin
    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if v_order='' or upper(trim(coalesce(p_confirmation,'')))<>v_order then
        raise exception 'Order confirmation does not match';
    end if;

    -- Remove the finalized archive row itself. This was missing in 2C.5.1.
    delete from public.pharmflow_finalized_archives_v1 a
    where a.pharmacy_id=p_pharmacy_id
      and exists (
          select 1
          from unnest(coalesce(a.order_numbers,'{}'::text[])) n
          where upper(trim(n))=v_order
      );

    -- Item Transfer authoritative source.
    delete from public.pharmflow_order_source_items
    where pharmacy_id=p_pharmacy_id
      and upper(trim(order_number))=v_order;

    -- Duplicate-upload / lifecycle registry.
    delete from public.pharmflow_orders
    where pharmacy_id=p_pharmacy_id
      and upper(trim(order_number))=v_order;

    return true;
end;
$$;

revoke all on function public.delete_pharmflow_order_complete(uuid,text,text)
from public,anon;

grant execute on function public.delete_pharmflow_order_complete(uuid,text,text)
to authenticated;

select pg_notify('pgrst','reload schema');
