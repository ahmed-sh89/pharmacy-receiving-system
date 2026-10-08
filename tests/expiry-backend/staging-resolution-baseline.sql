-- Staging fixture only: existing Production resolution contract, copied read-only.
CREATE OR REPLACE FUNCTION public.resolve_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text, p_resolution_type text, p_resolution_transaction_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_type text := upper(trim(coalesce(p_resolution_type,'')));
begin
    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if v_type not in ('LINK_ORDER_ITEM','ADD_UNORDERED') then
        raise exception 'Invalid resolution type';
    end if;

    update public.pharmflow_needs_review_v2
       set status = 'RESOLVED',
           resolved_item_code = trim(coalesce(p_item_code,'')),
           resolved_item_name = trim(coalesce(p_item_name,'')),
           resolution_type = v_type,
           resolution_transaction_id = nullif(trim(coalesce(p_resolution_transaction_id,'')),''),
           resolved_by = auth.uid(),
           resolved_at = now(),
           updated_at = now()
     where id = p_review_id
       and pharmacy_id = p_pharmacy_id
       and status = 'PENDING';

    return found;
end;
$function$
;
revoke all on function public.resolve_pharmflow_needs_review_v2(uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.resolve_pharmflow_needs_review_v2(uuid,uuid,text,text,text,text) to authenticated;

