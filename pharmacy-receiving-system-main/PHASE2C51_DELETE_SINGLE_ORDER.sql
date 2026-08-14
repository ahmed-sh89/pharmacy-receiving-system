-- PharmFlow Phase 2C.5.1 — delete one finalized order, pharmacy-scoped.
-- Does NOT touch Global GTIN, users, other pharmacies, or Returns Archive.
create or replace function public.delete_pharmflow_order_complete(p_pharmacy_id uuid,p_order_number text,p_confirmation text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_order text:=upper(trim(coalesce(p_order_number,'')));
begin
  if v_order='' or upper(trim(coalesce(p_confirmation,'')))<>v_order then raise exception 'Order confirmation does not match'; end if;
  -- source rows first, then registry. These are the authoritative cloud records introduced in 2C.2.
  delete from public.pharmflow_order_source_items where pharmacy_id=p_pharmacy_id and upper(trim(order_number))=v_order;
  delete from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and upper(trim(order_number))=v_order;
  return true;
end; $$;
revoke all on function public.delete_pharmflow_order_complete(uuid,text,text) from public;
grant execute on function public.delete_pharmflow_order_complete(uuid,text,text) to authenticated;
