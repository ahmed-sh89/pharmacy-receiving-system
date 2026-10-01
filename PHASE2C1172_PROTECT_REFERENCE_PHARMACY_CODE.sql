-- PHASE2C1172 — protect the reference pharmacy code.
-- HHP084 may be renamed, but its protected code cannot be changed while Global Master authorization depends on it.

create or replace function public.owner_update_pharmacy_identity_v1(
    p_pharmacy_id uuid,
    p_official_pharmacy_name text,
    p_official_pharmacy_code text
)
returns table(pharmacy_id uuid, pharmacy_code text, pharmacy_name text)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
    v_owner uuid := auth.uid();
    v_old public.pharmacies%rowtype;
    v_name text := nullif(trim(p_official_pharmacy_name),'');
    v_code text := upper(regexp_replace(coalesce(p_official_pharmacy_code,''),'[^A-Za-z0-9_-]+','','g'));
begin
    if v_owner is null or not public.is_system_owner() then raise exception 'System Owner permission required'; end if;
    if v_name is null then raise exception 'Pharmacy name is required'; end if;
    if length(v_code)<3 then raise exception 'Pharmacy code must be at least 3 characters'; end if;

    select * into v_old from public.pharmacies where id=p_pharmacy_id for update;
    if not found then raise exception 'Pharmacy not found'; end if;

    if upper(btrim(coalesce(v_old.code,'')))='HHP084' and v_code<>'HHP084' then
        raise exception 'HHP084 is the protected reference pharmacy code and cannot be changed';
    end if;

    if exists(select 1 from public.pharmacies p where upper(p.code)=v_code and p.id<>p_pharmacy_id) then
        raise exception 'Pharmacy code is already in use';
    end if;

    update public.pharmacies
    set code=v_code,name=v_name,updated_at=now()
    where id=p_pharmacy_id;

    if v_old.code is distinct from v_code or v_old.name is distinct from v_name then
        insert into public.pharmflow_pharmacy_identity_audit_v1(
            pharmacy_id,old_code,new_code,old_name,new_name,changed_by
        ) values(p_pharmacy_id,v_old.code,v_code,v_old.name,v_name,v_owner);
    end if;

    return query select p_pharmacy_id,v_code,v_name;
end;
$function$;

revoke all on function public.owner_update_pharmacy_identity_v1(uuid,text,text) from public, anon;
grant execute on function public.owner_update_pharmacy_identity_v1(uuid,text,text) to authenticated;
