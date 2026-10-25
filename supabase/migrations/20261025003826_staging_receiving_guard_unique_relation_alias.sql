CREATE OR REPLACE FUNCTION public.delete_pharmacy_needs_review(p_pharmacy_id uuid, p_review_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,coalesce((select nr_compat.workflow from public.pharmflow_needs_review_v1 nr_compat where nr_compat.id=p_review_id and nr_compat.pharmacy_id=p_pharmacy_id),'RECEIVING'),true,'delete_pharmacy_needs_review');

 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 update public.pharmflow_needs_review_v1 set status='DELETED',updated_at=now() where id=p_review_id and pharmacy_id=p_pharmacy_id and status='PENDING';
 return found;
end $function$
;
REVOKE ALL ON FUNCTION public.delete_pharmacy_needs_review(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pharmacy_needs_review(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pharmacy_needs_review(uuid,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_pharmacy_needs_review(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.resolve_pharmacy_needs_review(p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text)
 RETURNS TABLE(review_id uuid, workflow text, gtin text, pending_quantity integer, expiry_month integer, expiry_year integer, worker_id uuid, captured_by_name text, device_id text, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.pharmflow_needs_review_v1%rowtype;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,coalesce((select nr_compat.workflow from public.pharmflow_needs_review_v1 nr_compat where nr_compat.id=p_review_id and nr_compat.pharmacy_id=p_pharmacy_id),'RECEIVING'),true,'resolve_pharmacy_needs_review');
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'resolve_pharmacy_needs_review');

 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 select * into r from public.pharmflow_needs_review_v1 where id=p_review_id and pharmacy_id=p_pharmacy_id and status='PENDING' for update;
 if not found then raise exception 'Review item not found'; end if;
 update public.pharmflow_needs_review_v1 set status='RESOLVED',resolved_item_code=trim(p_item_code),resolved_item_name=trim(p_item_name),resolved_by=auth.uid(),resolved_at=now(),updated_at=now() where id=p_review_id;
 return query select r.id,r.workflow,r.gtin,r.pending_quantity,r.expiry_month,r.expiry_year,r.worker_id,coalesce(r.captured_by_name,''),coalesce(r.device_id,''),r.source;
end $function$
;
REVOKE ALL ON FUNCTION public.resolve_pharmacy_needs_review(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pharmacy_needs_review(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pharmacy_needs_review(uuid,uuid,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_pharmacy_needs_review(uuid,uuid,text,text) TO service_role;
;

