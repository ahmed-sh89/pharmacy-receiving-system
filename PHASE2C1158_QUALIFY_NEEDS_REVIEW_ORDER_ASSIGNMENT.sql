-- PHASE2C1158 — qualify Needs Review order assignment references.
-- Root cause: RETURNS TABLE output variable order_number collided with
-- unqualified pharmflow_orders.order_number in PHASE2C1157.
-- This migration was already applied to the live Supabase project during
-- Test verification; this file records the verified database state in source.

create or replace function public.assign_pharmflow_needs_review_order_v1(
 p_pharmacy_id uuid,p_review_id uuid,p_order_number text
) returns table(success boolean,order_number text)
language plpgsql security definer set search_path='public','pg_temp' as $$
declare
 v_review public.pharmflow_needs_review_v2%rowtype;
 v_order text:=btrim(coalesce(p_order_number,''));
begin
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
   raise exception 'Pharmacy admin access required';
 end if;

 select r.* into v_review
 from public.pharmflow_needs_review_v2 as r
 where r.id=p_review_id and r.pharmacy_id=p_pharmacy_id
 for update;

 if v_review.id is null or v_review.status<>'PENDING' then
   raise exception 'Needs Review case is unavailable';
 end if;

 if nullif(v_order,'') is null
    or not (v_order=any(coalesce(v_review.work_scope_order_numbers,array[]::text[]))) then
   raise exception 'Order is outside the captured Receiving work scope';
 end if;

 if not exists(
   select 1
   from public.pharmflow_orders as o
   where o.pharmacy_id=p_pharmacy_id
     and o.order_number=v_order
     and o.status='uploaded'
 ) then
   raise exception 'Selected Order is unavailable';
 end if;

 update public.pharmflow_needs_review_v2 as r
 set order_number=v_order,
     order_name=v_order,
     updated_at=now(),
     resolution_block_code=null,
     resolution_block_detail=null
 where r.id=v_review.id;

 return query select true,v_order;
end $$;

revoke all on function public.assign_pharmflow_needs_review_order_v1(uuid,uuid,text) from public,anon;
grant execute on function public.assign_pharmflow_needs_review_order_v1(uuid,uuid,text) to authenticated;
