-- PROPOSED ONLY: approval required. Target: tovkcakucyagvbzvlnks.
-- No operational rows, users, passwords, sessions or tokens are copied.
-- Intentionally outside supabase/migrations to prevent automatic application.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $preflight$
BEGIN
 IF to_regprocedure('public.owner_update_pharmacy_identity_v1(uuid,text,text)') IS NOT NULL
 OR to_regprocedure('public.owner_list_pharmacies()') IS NOT NULL
 OR to_regclass('public.pharmflow_pharmacy_identity_audit_v1') IS NOT NULL THEN
   RAISE EXCEPTION 'Reviewed missing-object baseline changed; abort and re-audit (never run on Production)';
 END IF;
 IF to_regprocedure('public.is_system_owner()') IS NULL THEN RAISE EXCEPTION 'Owner authorization helper missing'; END IF;
 IF EXISTS(select 1 from public.pharmacies where code is null or name is null) THEN RAISE EXCEPTION 'Review missing Staging pharmacy identity separately'; END IF;
 IF EXISTS(select 1 from public.pharmacies group by upper(code) having count(*)>1) THEN RAISE EXCEPTION 'Review duplicate Staging codes separately'; END IF;
END;
$preflight$;
-- Existing rows retain NULL for historical dates that Staging never stored.
-- Defaults apply only to future inserts. No fabricated historical backfill.
ALTER TABLE public.pharmacies ADD COLUMN created_at timestamptz;
ALTER TABLE public.pharmacies ADD COLUMN updated_at timestamptz;
ALTER TABLE public.pharmacies ADD COLUMN approved_at timestamptz;
ALTER TABLE public.pharmacies ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.pharmacies ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.pharmacies ALTER COLUMN code SET NOT NULL;
ALTER TABLE public.pharmacies ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.pharmacies ADD CONSTRAINT pharmacies_account_code_unique UNIQUE(code);
CREATE TABLE public.pharmflow_pharmacy_identity_audit_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE RESTRICT,
 old_code text NOT NULL,new_code text NOT NULL,old_name text NOT NULL,new_name text NOT NULL,
 changed_by uuid NOT NULL REFERENCES auth.users(id),
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pharmflow_pharmacy_identity_audit_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmflow_pharmacy_identity_audit_v1 FROM PUBLIC,anon,authenticated;
-- Approved Production behavior: owner-only definer functions operate behind RLS.
-- Existing Staging is_system_owner is equivalent to Production medryvo helper;
-- use it directly instead of introducing another privileged wrapper.
CREATE FUNCTION public.owner_update_pharmacy_identity_v1(p_pharmacy_id uuid, p_official_pharmacy_name text, p_official_pharmacy_code text)
 RETURNS TABLE(pharmacy_id uuid, pharmacy_code text, pharmacy_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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

CREATE FUNCTION public.owner_list_pharmacies()
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
        p.status,
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

REVOKE ALL ON FUNCTION public.owner_update_pharmacy_identity_v1(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.owner_list_pharmacies() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_update_pharmacy_identity_v1(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_list_pharmacies() TO authenticated;
COMMIT;
