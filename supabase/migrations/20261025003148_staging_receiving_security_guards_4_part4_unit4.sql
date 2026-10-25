CREATE OR REPLACE FUNCTION public.verify_pharmflow_historical_state_v2(p_pharmacy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_historical_orders bigint;
    v_archives bigint;
    v_active_orders bigint;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'verify_pharmflow_historical_state_v2');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    select count(*) into v_historical_orders
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed');

    select count(*) into v_archives
      from public.pharmflow_finalized_archives_v1 a
     where a.pharmacy_id=p_pharmacy_id;

    select count(*) into v_active_orders
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    return jsonb_build_object(
        'pharmacy_id',p_pharmacy_id,
        'historical_orders_remaining',v_historical_orders,
        'finalized_archives_remaining',v_archives,
        'active_orders_present',v_active_orders,
        'historical_data_empty',(v_historical_orders=0 and v_archives=0)
    );
end;
$function$
;
REVOKE ALL ON FUNCTION public.verify_pharmflow_historical_state_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pharmflow_historical_state_v2(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
;

