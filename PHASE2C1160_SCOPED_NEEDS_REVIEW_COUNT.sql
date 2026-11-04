-- PHASE 2C.11.6.0 — lightweight Needs Review count constrained to current Receiving order scope.
create or replace function public.count_pharmflow_needs_review_scope_v3(p_pharmacy_id uuid,p_workflow text default 'RECEIVING',p_order_numbers text[] default null)
returns integer language plpgsql stable security definer set search_path='public','pg_temp' as $$
declare v_count integer;
begin
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 select count(*)::integer into v_count from (
   select r.gtin,coalesce(r.order_number,''),r.review_reason
   from public.pharmflow_needs_review_v2 r
   where r.pharmacy_id=p_pharmacy_id and r.status='PENDING'
     and r.workflow=upper(trim(coalesce(p_workflow,'RECEIVING')))
     and coalesce(array_length(p_order_numbers,1),0)>0
     and r.order_number=any(p_order_numbers)
   group by r.gtin,coalesce(r.order_number,''),r.review_reason
 ) g;
 return coalesce(v_count,0);
end $$;