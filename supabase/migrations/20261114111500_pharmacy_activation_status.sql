-- Keep operational pharmacy status and access rules intact. The owner view
-- derives first activation from the current admin's server-owned Auth metadata.
CREATE OR REPLACE FUNCTION public.owner_list_pharmacies()
 RETURNS TABLE(pharmacy_id uuid, pharmacy_code text, pharmacy_name text, active boolean, status text, created_at timestamp with time zone, approved_at timestamp with time zone, admin_user_id uuid, admin_email text, admin_name text, pending_admin_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
    if not public.is_system_owner() then
        raise exception 'System Owner access required';
    end if;

    return query
    select
        p.id,
        p.code,
        p.name,
        p.active,
        CASE WHEN p.active AND p.status='active'
            AND au.raw_app_meta_data->'pharmflow_initial_activation_pending'='true'::jsonb
        THEN 'pending_activation' ELSE p.status END,
        p.created_at,
        p.approved_at,
        au.id,
        coalesce(pr.email, au.email),
        pr.display_name,
        paa.email
    from public.pharmacies p
    left join lateral (
        select pm.user_id
        from public.pharmacy_members pm
        where pm.pharmacy_id = p.id
          and pm.role = 'admin'
          and pm.active = true
          and not exists (
              select 1 from public.system_owners so
              where so.user_id = pm.user_id
          )
        order by pm.created_at desc
        limit 1
    ) current_admin on true
    left join auth.users au on au.id = current_admin.user_id
    left join public.profiles pr on pr.user_id = current_admin.user_id
    left join public.pharmacy_admin_assignments paa
        on paa.pharmacy_id = p.id
       and paa.status = 'pending'
    order by p.created_at asc, p.name asc;
end;
$function$;

-- Let a live temporary-password session see its own deactivation status.
DO $migration$
DECLARE definition text := pg_get_functiondef('public.pharmflow_password_change_request_guard()'::regprocedure);
BEGIN
 IF position('''rpc/get_my_pharmacy_access_status_v1''' in definition)>0 THEN RETURN; END IF;
 IF position('''rpc/pharmflow_has_live_session_v1''' in definition)=0 THEN
  RAISE EXCEPTION 'Unexpected password-change request guard';
 END IF;
 EXECUTE replace(definition, '''rpc/pharmflow_has_live_session_v1''',
  '''rpc/pharmflow_has_live_session_v1'',''rpc/get_my_pharmacy_access_status_v1''');
END;
$migration$;
