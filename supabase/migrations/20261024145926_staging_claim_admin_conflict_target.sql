CREATE OR REPLACE FUNCTION public.claim_pharmacy_admin_assignment()
 RETURNS TABLE(pharmacy_id uuid, pharmacy_code text, pharmacy_name text, member_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
    v_user_id uuid := auth.uid();
    v_email text;
    v_assignment public.pharmacy_admin_assignments%rowtype;
begin
    if v_user_id is null then raise exception 'Authentication required'; end if;

    select lower(u.email) into v_email from auth.users u where u.id = v_user_id;
    if v_email is null then raise exception 'Authenticated user email not found'; end if;

    select paa.* into v_assignment
    from public.pharmacy_admin_assignments paa
    where lower(paa.email) = v_email
      and (paa.status = 'pending' or (paa.status = 'claimed' and paa.claimed_by = v_user_id))
    order by paa.assigned_at desc
    limit 1
    for update;
    if not found then return; end if;

    if not exists (
        select 1 from public.pharmacies p
        where p.id = v_assignment.pharmacy_id and p.active = true and p.status = 'active'
    ) then raise exception 'Assigned pharmacy is not active'; end if;

    update public.pharmacy_members pm
    set active = false
    where pm.pharmacy_id = v_assignment.pharmacy_id
      and pm.role = 'admin' and pm.active = true and pm.user_id <> v_user_id
      and not exists (select 1 from public.system_owners so where so.user_id = pm.user_id);

    insert into public.profiles (user_id, email, display_name)
    values (
        v_user_id,
        v_email,
        coalesce((select u.raw_user_meta_data->>'display_name' from auth.users u where u.id = v_user_id),
                 split_part(v_email, '@', 1))
    )
    on conflict on constraint profiles_pkey do update
        set email = excluded.email,
            display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
            updated_at = now();

    insert into public.pharmacy_members (pharmacy_id, user_id, role, active)
    values (v_assignment.pharmacy_id, v_user_id, 'admin', true)
    on conflict on constraint pharmacy_members_pkey do update set role = 'admin', active = true;

    update public.pharmacy_admin_assignments
    set status = 'claimed', claimed_by = v_user_id, claimed_at = coalesce(claimed_at, now())
    where id = v_assignment.id;

    return query
    select p.id, p.code, p.name, 'admin'::text
    from public.pharmacies p where p.id = v_assignment.pharmacy_id;
end;
$function$;
