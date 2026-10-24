-- Staging-only Auth parity. Production baseline bd20065f0a2c7bb44861df88e1d021225e7c9725.
-- Additive dependencies only; existing membership/Expiry/Receiving guards are untouched.
ALTER TABLE public.pharmacies ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.pharmacies ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

CREATE TABLE public.pharmacy_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
 email text NOT NULL,
 role text NOT NULL CHECK (role IN ('admin','staff')),
 invite_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
 used_at timestamptz,
 used_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.pharmacy_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_invitations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.medryvo_is_system_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
    select exists(
        select 1
        from public.system_owners so
        where so.user_id = auth.uid()
    );
$function$;

REVOKE ALL ON FUNCTION public.medryvo_is_system_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.medryvo_is_system_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    insert into public.profiles(user_id, email, display_name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,''), '@', 1))
    )
    on conflict (user_id) do update
    set email = excluded.email;
    return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_pharmacy_registration_v2(p_requested_pharmacy_code text)
 RETURNS TABLE(request_id uuid, request_status text, pharmacy_code text, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
    v_user uuid := auth.uid();
    v_email text;
    v_code text;
    v_request uuid;
    v_submitted timestamptz;
begin
    if v_user is null then raise exception 'Authentication required'; end if;
    if public.is_system_owner() then raise exception 'System Owner does not need public pharmacy registration'; end if;

    if exists (
        select 1 from public.pharmacy_members m
        join public.pharmacies p on p.id=m.pharmacy_id
        where m.user_id=v_user and m.active=true and p.status='active'
    ) then
        raise exception 'This account already belongs to an active pharmacy';
    end if;

    v_code := upper(regexp_replace(coalesce(p_requested_pharmacy_code,''),'[^A-Za-z0-9_-]+','','g'));
    if length(v_code) < 3 then raise exception 'Pharmacy code must be at least 3 characters'; end if;

    select lower(email) into v_email from auth.users where id=v_user;
    if v_email is null then raise exception 'Authenticated email was not found'; end if;

    if exists (
        select 1 from public.pharmacy_registration_requests r
        where r.applicant_user_id=v_user and r.status in ('pending','approved')
    ) then
        raise exception 'A registration request already exists for this account';
    end if;

    select r.id into v_request
    from public.pharmacy_registration_requests r
    where r.applicant_user_id=v_user and r.status='rejected'
    order by r.submitted_at desc limit 1;

    if v_request is not null then
        update public.pharmacy_registration_requests
        set applicant_email=v_email,
            applicant_name=null,
            requested_pharmacy_name='Pending owner assignment',
            requested_pharmacy_code=v_code,
            status='pending', submitted_at=now(),
            reviewed_at=null, reviewed_by=null, review_note=null, pharmacy_id=null
        where id=v_request
        returning pharmacy_registration_requests.submitted_at into v_submitted;
    else
        insert into public.pharmacy_registration_requests(
            applicant_user_id,applicant_email,applicant_name,requested_pharmacy_name,requested_pharmacy_code
        ) values (
            v_user,v_email,null,'Pending owner assignment',v_code
        ) returning id, pharmacy_registration_requests.submitted_at into v_request,v_submitted;
    end if;

    return query select v_request,'pending'::text,v_code,v_submitted;
end;
$function$;

REVOKE ALL ON FUNCTION public.submit_pharmacy_registration_v2(p_requested_pharmacy_code text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_pharmacy_registration_v2(p_requested_pharmacy_code text) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_list_pharmacy_registrations(p_status text DEFAULT NULL::text)
 RETURNS TABLE(request_id uuid, applicant_user_id uuid, applicant_email text, applicant_name text, pharmacy_name text, pharmacy_code text, request_status text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, review_note text, pharmacy_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    if auth.uid() is null or not public.is_system_owner() then
        raise exception 'System Owner permission required';
    end if;

    return query
    select
        r.id,
        r.applicant_user_id,
        r.applicant_email,
        r.applicant_name,
        r.requested_pharmacy_name,
        r.requested_pharmacy_code,
        r.status,
        r.submitted_at,
        r.reviewed_at,
        r.review_note,
        r.pharmacy_id
    from public.pharmacy_registration_requests r
    where p_status is null
       or lower(r.status) = lower(p_status)
    order by
        case when r.status = 'pending' then 0 else 1 end,
        r.submitted_at desc;
end;
$function$;

REVOKE ALL ON FUNCTION public.owner_list_pharmacy_registrations(p_status text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_list_pharmacy_registrations(p_status text) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_review_pharmacy_registration_v2(p_request_id uuid, p_decision text, p_official_pharmacy_name text DEFAULT NULL::text, p_official_pharmacy_code text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS TABLE(request_id uuid, request_status text, pharmacy_id uuid, pharmacy_code text, pharmacy_name text, admin_user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
    v_owner uuid := auth.uid();
    v_decision text := lower(trim(coalesce(p_decision,'')));
    v_req public.pharmacy_registration_requests%rowtype;
    v_pharmacy uuid;
    v_code text;
    v_name text;
begin
    if v_owner is null or not public.is_system_owner() then raise exception 'System Owner permission required'; end if;
    if v_decision not in ('approve','reject') then raise exception 'Decision must be approve or reject'; end if;

    select r.* into v_req
    from public.pharmacy_registration_requests r
    where r.id=p_request_id for update;
    if not found then raise exception 'Registration request not found'; end if;
    if v_req.status <> 'pending' then raise exception 'Only pending requests can be reviewed'; end if;

    if v_decision='reject' then
        update public.pharmacy_registration_requests
        set status='rejected',reviewed_at=now(),reviewed_by=v_owner,review_note=nullif(trim(p_note),'')
        where id=p_request_id;
        return query select v_req.id,'rejected'::text,null::uuid,v_req.requested_pharmacy_code,null::text,v_req.applicant_user_id;
        return;
    end if;

    v_name := nullif(trim(p_official_pharmacy_name),'');
    v_code := upper(regexp_replace(coalesce(p_official_pharmacy_code,''),'[^A-Za-z0-9_-]+','','g'));
    if v_name is null then raise exception 'Official pharmacy name is required'; end if;
    if length(v_code)<3 then raise exception 'Official pharmacy code must be at least 3 characters'; end if;
    if exists(select 1 from public.pharmacies p where upper(p.code)=v_code) then
        raise exception 'Official pharmacy code is already in use';
    end if;

    insert into public.pharmacies(code,name,status,active,approved_at,approved_by)
    values(v_code,v_name,'active',true,now(),v_owner)
    returning id into v_pharmacy;

    insert into public.pharmacy_members(pharmacy_id,user_id,role,active)
    values(v_pharmacy,v_req.applicant_user_id,'admin',true)
    on conflict (pharmacy_id,user_id)
    do update set role='admin',active=true;

    update public.pharmacy_registration_requests
    set status='approved',reviewed_at=now(),reviewed_by=v_owner,
        review_note=nullif(trim(p_note),''),pharmacy_id=v_pharmacy,
        requested_pharmacy_name=v_name
    where id=p_request_id;

    return query select v_req.id,'approved'::text,v_pharmacy,v_code,v_name,v_req.applicant_user_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.owner_review_pharmacy_registration_v2(p_request_id uuid, p_decision text, p_official_pharmacy_name text, p_official_pharmacy_code text, p_note text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_review_pharmacy_registration_v2(p_request_id uuid, p_decision text, p_official_pharmacy_name text, p_official_pharmacy_code text, p_note text) TO authenticated;

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
    returning invite_token, pharmacy_invitations.expires_at into v_token, v_exp;

    return query
    select v_pharmacy, v_code, trim(p_name), lower(trim(p_admin_email)), v_token, v_exp;
end;
$function$;

REVOKE ALL ON FUNCTION public.owner_create_pharmacy(p_name text, p_code text, p_admin_email text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_create_pharmacy(p_name text, p_code text, p_admin_email text) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_assign_pharmacy_admin(p_pharmacy_id uuid, p_email text)
 RETURNS TABLE(pharmacy_id uuid, admin_email text, assignment_status text, admin_user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_email text := lower(trim(p_email));
    v_user_id uuid;
BEGIN
    IF NOT public.medryvo_is_system_owner() THEN
        RAISE EXCEPTION 'System Owner access required';
    END IF;

    IF p_pharmacy_id IS NULL
       OR NOT EXISTS (
            SELECT 1
            FROM public.pharmacies p
            WHERE p.id = p_pharmacy_id
       ) THEN
        RAISE EXCEPTION 'Pharmacy not found';
    END IF;

    IF v_email IS NULL OR position('@' in v_email) = 0 THEN
        RAISE EXCEPTION 'Valid ADMIN email is required';
    END IF;

    SELECT u.id
    INTO v_user_id
    FROM auth.users u
    WHERE lower(u.email) = v_email
    LIMIT 1;

    UPDATE public.pharmacy_members pm
    SET active = false
    WHERE pm.pharmacy_id = p_pharmacy_id
      AND pm.role = 'admin'
      AND pm.active = true
      AND NOT EXISTS (
          SELECT 1
          FROM public.system_owners so
          WHERE so.user_id = pm.user_id
      )
      AND (v_user_id IS NULL OR pm.user_id <> v_user_id);

    INSERT INTO public.pharmacy_admin_assignments (
        pharmacy_id,
        email,
        status,
        assigned_by,
        assigned_at,
        claimed_by,
        claimed_at
    )
    VALUES (
        p_pharmacy_id,
        v_email,
        CASE WHEN v_user_id IS NULL THEN 'pending' ELSE 'claimed' END,
        auth.uid(),
        now(),
        v_user_id,
        CASE WHEN v_user_id IS NULL THEN NULL ELSE now() END
    )
    ON CONFLICT ON CONSTRAINT pharmacy_admin_assignments_pharmacy_id_key
    DO UPDATE SET
        email = EXCLUDED.email,
        status = EXCLUDED.status,
        assigned_by = EXCLUDED.assigned_by,
        assigned_at = now(),
        claimed_by = EXCLUDED.claimed_by,
        claimed_at = EXCLUDED.claimed_at;

    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.profiles (
            user_id,
            email,
            display_name
        )
        VALUES (
            v_user_id,
            v_email,
            COALESCE(
                (
                    SELECT u.raw_user_meta_data->>'display_name'
                    FROM auth.users u
                    WHERE u.id = v_user_id
                ),
                split_part(v_email,'@',1)
            )
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
            email = EXCLUDED.email,
            updated_at = now();

        INSERT INTO public.pharmacy_members (
            pharmacy_id,
            user_id,
            role,
            active
        )
        VALUES (
            p_pharmacy_id,
            v_user_id,
            'admin',
            true
        )
        ON CONFLICT (pharmacy_id,user_id)
        DO UPDATE SET
            role = 'admin',
            active = true;
    END IF;

    RETURN QUERY
    SELECT
        p_pharmacy_id,
        v_email,
        CASE WHEN v_user_id IS NULL THEN 'pending' ELSE 'active' END,
        v_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_assign_pharmacy_admin(p_pharmacy_id uuid, p_email text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_assign_pharmacy_admin(p_pharmacy_id uuid, p_email text) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_pharmacy_invite(p_invite_token uuid)
 RETURNS TABLE(pharmacy_id uuid, pharmacy_code text, pharmacy_name text, member_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_user uuid := auth.uid();
    v_email text;
    v_inv public.pharmacy_invitations%rowtype;
begin
    if v_user is null then
        raise exception 'Authentication required';
    end if;

    select lower(email) into v_email from auth.users where id = v_user;

    select * into v_inv
    from public.pharmacy_invitations i
    where i.invite_token = p_invite_token
      and i.used_at is null
      and i.expires_at > now()
    for update;

    if not found then
        raise exception 'Invitation is invalid, expired, or already used';
    end if;

    if lower(v_inv.email) <> v_email then
        raise exception 'Invitation email does not match signed-in account';
    end if;

    insert into public.pharmacy_members(pharmacy_id,user_id,role,active)
    values (v_inv.pharmacy_id, v_user, v_inv.role, true)
    on conflict (pharmacy_id,user_id) do update
    set role = excluded.role, active = true;

    update public.pharmacy_invitations
    set used_at = now(), used_by = v_user
    where id = v_inv.id;

    return query
    select p.id, p.code, p.name, v_inv.role
    from public.pharmacies p
    where p.id = v_inv.pharmacy_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.redeem_pharmacy_invite(p_invite_token uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_pharmacy_invite(p_invite_token uuid) TO authenticated;

CREATE TRIGGER prs_on_auth_user_created_v1 AFTER INSERT OR UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
