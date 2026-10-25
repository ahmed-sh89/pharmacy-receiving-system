CREATE OR REPLACE FUNCTION public.save_pharmflow_finalized_archive(p_pharmacy_id uuid, p_archive_id text, p_order_numbers text[], p_closed_at timestamp with time zone, p_archive_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_finalized_archive');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if nullif(trim(coalesce(p_archive_id,'')),'') is null then
        raise exception 'Archive id is required';
    end if;

    insert into public.pharmflow_finalized_archives_v1(
        pharmacy_id, archive_id, order_numbers, closed_at,
        archive_payload, created_by
    )
    values(
        p_pharmacy_id,
        trim(p_archive_id),
        coalesce(p_order_numbers,'{}'::text[]),
        coalesce(p_closed_at,now()),
        coalesce(p_archive_payload,'{}'::jsonb),
        auth.uid()
    )
    on conflict(pharmacy_id,archive_id)
    do update set
        order_numbers=excluded.order_numbers,
        closed_at=excluded.closed_at,
        archive_payload=excluded.archive_payload;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.save_pharmflow_finalized_archive(uuid,text,text[],timestamp with time zone,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_finalized_archive(uuid,text,text[],timestamp with time zone,jsonb) TO authenticated;
;

