CREATE OR REPLACE FUNCTION public.owner_create_pharmacy(p_name text, p_code text, p_admin_email text)
 RETURNS TABLE(pharmacy_id uuid, pharmacy_code text, pharmacy_name text, admin_email text, invite_token uuid, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_user uuid := auth.uid();
    v_pharmacy uuid;
    v_code text;
    v_token uuid;
    v_exp timestamptz;
begin
    if v_user is null or not public.is_system_owner() then
        raise exception 'Owner permission required';
    end if;

    if nullif(trim(p_name),'') is null then
        raise exception 'Pharmacy name is required';
    end if;
    if nullif(trim(p_admin_email),'') is null then
        raise exception 'Admin email is required';
    end if;

    v_code := upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9_-]+', '', 'g'));
    if length(v_code) < 3 then
        raise exception 'Pharmacy code must be at least 3 characters';
    end if;

    insert into public.pharmacies(code, name)
    values (v_code, trim(p_name))
    returning id into v_pharmacy;

    insert into public.pharmacy_invitations(pharmacy_id,email,role,created_by)
    values (v_pharmacy, lower(trim(p_admin_email)), 'admin', v_user)
    returning pharmacy_invitations.invite_token, pharmacy_invitations.expires_at into v_token, v_exp;

    return query
    select v_pharmacy, v_code, trim(p_name), lower(trim(p_admin_email)), v_token, v_exp;
end;
$function$
;
