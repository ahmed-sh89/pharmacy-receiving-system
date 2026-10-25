CREATE OR REPLACE FUNCTION public.get_pharmflow_workspace_generation(p_pharmacy_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_generation bigint;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_workspace_generation');
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    if pharmflow_auth_private.module_allowed(p_pharmacy_id,'RECEIVING',true) then
      insert into public.pharmflow_workspace_generation_v1(pharmacy_id, generation)
      values (p_pharmacy_id, 0) on conflict (pharmacy_id) do nothing;
    end if;
    select generation into v_generation
    from public.pharmflow_workspace_generation_v1 where pharmacy_id = p_pharmacy_id;
    return coalesce(v_generation, 0);
end;
$function$;