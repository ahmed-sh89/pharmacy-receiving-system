CREATE OR REPLACE FUNCTION public.set_pharmacy_needs_review_quantity(p_pharmacy_id uuid, p_review_id uuid, p_pending_quantity integer)
 RETURNS TABLE(review_id uuid, pending_quantity integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_q integer:=greatest(coalesce(p_pending_quantity,1),1);
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'set_pharmacy_needs_review_quantity');

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 return query
 update public.pharmflow_needs_review_v1 r
 set pending_quantity=v_q,updated_at=now()
 where r.id=p_review_id and r.pharmacy_id=p_pharmacy_id and r.status='PENDING' and r.workflow='RECEIVING'
 returning r.id,r.pending_quantity,r.updated_at;
 if not found then raise exception 'Pending review item not found'; end if;
end $function$
;
REVOKE ALL ON FUNCTION public.set_pharmacy_needs_review_quantity(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_pharmacy_needs_review_quantity(uuid,uuid,integer) TO authenticated;
;

