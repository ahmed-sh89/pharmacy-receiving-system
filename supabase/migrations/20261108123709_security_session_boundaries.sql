-- Security 2026-11-08: function-only changes; no operational data, RLS or existing ACL changes.
-- Run atomically. Known source hashes prevent overwriting drift. Optional legacy contracts stay absent.
CREATE OR REPLACE FUNCTION public.pharmflow_has_live_session_v1()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, auth
AS $function$
BEGIN
 RETURN auth.uid() IS NOT NULL
 AND coalesce((auth.jwt()->>'exp')::numeric,0)>extract(epoch FROM now())
 AND EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.id=nullif(auth.jwt()->>'session_id','')::uuid AND s.user_id=auth.uid()
 AND (s.not_after IS NULL OR s.not_after>now()));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $function$;
REVOKE ALL ON FUNCTION public.pharmflow_has_live_session_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pharmflow_has_live_session_v1() TO authenticated;

DO $guard$ BEGIN
 IF to_regprocedure('public.is_system_owner()') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.is_system_owner()'::regprocedure)) NOT IN ('9682d90232cbc3ec9b777e24237ab775') THEN RAISE EXCEPTION 'Security baseline drift: is_system_owner'; END IF;
 EXECUTE $candidate$CREATE OR REPLACE FUNCTION public.is_system_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT pharmflow_auth_private.password_change_complete() AND (exists (
        select 1 from public.system_owners o
        where o.user_id = (select auth.uid())
    ));
$function$;$candidate$;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.medryvo_is_system_owner()') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.medryvo_is_system_owner()'::regprocedure)) NOT IN ('59026a8aa805408014d2b3ca8717f4b2') THEN RAISE EXCEPTION 'Security baseline drift: medryvo_is_system_owner'; END IF;
 EXECUTE $candidate$CREATE OR REPLACE FUNCTION public.medryvo_is_system_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
 SELECT pharmflow_auth_private.password_change_complete() AND (exists(
        select 1
        from public.system_owners so
        where so.user_id = auth.uid()
    ));
$function$;$candidate$;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.is_pharmacy_member(uuid)') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.is_pharmacy_member(uuid)'::regprocedure)) NOT IN ('55fa22bf6f99fb2f3c30a138d7d04047') THEN RAISE EXCEPTION 'Security baseline drift: is_pharmacy_member'; END IF;
 EXECUTE $candidate$CREATE OR REPLACE FUNCTION public.is_pharmacy_member(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT pharmflow_auth_private.password_change_complete() AND (public.is_system_owner() or exists (
        select 1
        from public.pharmacy_members m
        join public.pharmacies p on p.id = m.pharmacy_id
        where m.pharmacy_id = p_pharmacy_id
          and m.user_id = auth.uid()
          and m.active = true
          and p.status = 'active'
    ));
$function$;$candidate$;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.is_pharmacy_admin(uuid)') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.is_pharmacy_admin(uuid)'::regprocedure)) NOT IN ('c1c335586703076ee2f8bd56ca1378a8') THEN RAISE EXCEPTION 'Security baseline drift: is_pharmacy_admin'; END IF;
 EXECUTE $candidate$CREATE OR REPLACE FUNCTION public.is_pharmacy_admin(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT pharmflow_auth_private.password_change_complete() AND (public.is_system_owner() or exists (
        select 1
        from public.pharmacy_members m
        join public.pharmacies p on p.id = m.pharmacy_id
        where m.pharmacy_id = p_pharmacy_id
          and m.user_id = auth.uid()
          and m.role = 'admin'
          and m.active = true
          and p.status = 'active'
    ));
$function$;$candidate$;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.pharmflow_can_access_pharmacy(uuid)') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.pharmflow_can_access_pharmacy(uuid)'::regprocedure)) NOT IN ('78311b1e4a3d4bbef08881bb0561e750','9c2eb164ef9bfaa152de25145f90fb98') THEN RAISE EXCEPTION 'Security baseline drift: pharmflow_can_access_pharmacy'; END IF;
 EXECUTE $candidate$CREATE OR REPLACE FUNCTION public.pharmflow_can_access_pharmacy(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL AND public.is_pharmacy_member(p_pharmacy_id);
$function$;$candidate$;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.pharmflow_is_member(uuid)') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.pharmflow_is_member(uuid)'::regprocedure)) NOT IN ('ef3a3b7dfeb11283c599eacc69987ae0','f30be681c404675f3d4171377fb8450c') THEN RAISE EXCEPTION 'Security baseline drift: pharmflow_is_member'; END IF;
 EXECUTE $candidate$CREATE OR REPLACE FUNCTION public.pharmflow_is_member(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT auth.uid() IS NOT NULL AND public.is_pharmacy_member(p_pharmacy_id);
$function$;$candidate$;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.pharmflow_manifest_member_v2(uuid)') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.pharmflow_manifest_member_v2(uuid)'::regprocedure)) NOT IN ('b29a5fa86c0212736113360bef16da25','f14b5c3b9ebc8a0b9f1c724362731bab') THEN RAISE EXCEPTION 'Security baseline drift: pharmflow_manifest_member_v2'; END IF;
 EXECUTE $candidate$CREATE OR REPLACE FUNCTION public.pharmflow_manifest_member_v2(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT auth.uid() IS NOT NULL AND public.is_pharmacy_member(p_pharmacy_id);
$function$;$candidate$;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.pharmflow_receiving_member_v2(uuid)') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.pharmflow_receiving_member_v2(uuid)'::regprocedure)) NOT IN ('20f5a7f8ea4f159837fba9f67827490d','73f0c4e0f1a245af8f5ed9abea6d12ed') THEN RAISE EXCEPTION 'Security baseline drift: pharmflow_receiving_member_v2'; END IF;
 EXECUTE $candidate$CREATE OR REPLACE FUNCTION public.pharmflow_receiving_member_v2(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT auth.uid() IS NOT NULL AND public.is_pharmacy_member(p_pharmacy_id);
$function$;$candidate$;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.get_global_master_gtin_page(integer,integer)') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.get_global_master_gtin_page(integer,integer)'::regprocedure)) NOT IN ('04b06eba3062b392bb2eac5a0b1b4d35') THEN RAISE EXCEPTION 'Security baseline drift: get_global_master_gtin_page'; END IF;
 EXECUTE $candidate$CREATE OR REPLACE FUNCTION public.get_global_master_gtin_page(p_offset integer DEFAULT 0, p_limit integer DEFAULT 1000)
 RETURNS TABLE(item_code text, gtin text, item_name text, category text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'get_global_master_gtin_page');
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    return query
    select g.item_code,g.gtin,g.item_name,g.category
    from public.pharmflow_global_gtin_v1 g
    order by g.id
    offset greatest(coalesce(p_offset,0),0)
    limit least(greatest(coalesce(p_limit,1000),1),2000);
end $function$;$candidate$;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.bootstrap_system_owner(text,text)') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.bootstrap_system_owner(text,text)'::regprocedure)) NOT IN ('9b2041e011a92ca6278b04dbccdfaa2f') THEN RAISE EXCEPTION 'Security baseline drift: bootstrap_system_owner'; END IF;
 EXECUTE $candidate$CREATE OR REPLACE FUNCTION public.bootstrap_system_owner(p_pharmacy_name text, p_pharmacy_code text)
 RETURNS TABLE(pharmacy_id uuid, pharmacy_code text, pharmacy_name text, system_role text, member_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_user uuid := auth.uid();
    v_existing_owner uuid;
    v_pharmacy uuid;
    v_code text;
BEGIN
 IF NOT pharmflow_auth_private.password_change_complete() THEN RAISE EXCEPTION 'PHARMFLOW_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
    if v_user is null then
        raise exception 'Authentication required';
    end if;

    -- Prevent two browsers from winning first-owner setup at the same time.
    perform pg_advisory_xact_lock(hashtext('medryvo_bootstrap_system_owner'));

    select so.user_id
      into v_existing_owner
      from public.system_owners so
      order by so.created_at asc
      limit 1;

    if v_existing_owner is not null and v_existing_owner <> v_user then
        raise exception 'System owner is already configured';
    end if;

    if nullif(trim(p_pharmacy_name),'') is null then
        raise exception 'Pharmacy name is required';
    end if;

    v_code := upper(regexp_replace(coalesce(p_pharmacy_code,''), '[^A-Za-z0-9_-]+', '', 'g'));
    if length(v_code) < 3 then
        raise exception 'Pharmacy code must be at least 3 characters';
    end if;

    -- Owner record can safely be retried by the SAME authenticated user.
    insert into public.system_owners(user_id)
    values (v_user)
    on conflict (user_id) do nothing;

    -- If this same Owner already has an admin pharmacy membership, return it.
    select p.id
      into v_pharmacy
      from public.pharmacy_members pm
      join public.pharmacies p on p.id = pm.pharmacy_id
     where pm.user_id = v_user
       and pm.role = 'admin'
     order by pm.created_at asc
     limit 1;

    if v_pharmacy is null then
        insert into public.pharmacies(
            code, name, active, status, approved_at, approved_by
        )
        values (
            v_code, trim(p_pharmacy_name), true, 'active', now(), v_user
        )
        on conflict (code) do update
        set name = excluded.name,
            active = true,
            status = 'active',
            approved_at = coalesce(public.pharmacies.approved_at, now()),
            approved_by = coalesce(public.pharmacies.approved_by, v_user),
            updated_at = now()
        returning id into v_pharmacy;

        insert into public.pharmacy_members(pharmacy_id, user_id, role, active)
        values (v_pharmacy, v_user, 'admin', true)
        on conflict (pharmacy_id, user_id) do update
        set role = 'admin', active = true;
    end if;

    return query
    select p.id,
           p.code,
           p.name,
           'owner'::text,
           'admin'::text
      from public.pharmacies p
     where p.id = v_pharmacy;
end;
$function$;$candidate$;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.redeem_pharmacy_invite(uuid)') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.redeem_pharmacy_invite(uuid)'::regprocedure)) NOT IN ('19709d54549f0b6b30fc6bde9af4ff36','635c1e01bbe84b4d02bddd0bfb73f5ab') THEN RAISE EXCEPTION 'Security baseline drift: redeem_pharmacy_invite'; END IF;
 EXECUTE $candidate$CREATE OR REPLACE FUNCTION public.redeem_pharmacy_invite(p_invite_token uuid)
 RETURNS TABLE(pharmacy_id uuid, pharmacy_code text, pharmacy_name text, member_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_user uuid := auth.uid();
    v_email text;
    v_inv public.pharmacy_invitations%rowtype;
BEGIN
 IF NOT pharmflow_auth_private.password_change_complete() THEN RAISE EXCEPTION 'PHARMFLOW_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
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
$function$;$candidate$;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.sync_pharmacy_active_status()') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.sync_pharmacy_active_status()'::regprocedure))<>'83ff8c9b8141f1d9263d3525e3431867' THEN RAISE EXCEPTION 'Security baseline drift: sync_pharmacy_active_status'; END IF;
 ALTER FUNCTION public.sync_pharmacy_active_status() SET search_path TO pg_catalog, public;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.touch_updated_at()') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.touch_updated_at()'::regprocedure))<>'4e76ccb1fa6dc6a079bbc0a8ee1ef0f7' THEN RAISE EXCEPTION 'Security baseline drift: touch_updated_at'; END IF;
 ALTER FUNCTION public.touch_updated_at() SET search_path TO pg_catalog, public;
 END IF;
END $guard$;

DO $guard$ BEGIN
 IF to_regprocedure('public.update_session_timestamp()') IS NOT NULL THEN
 IF md5(pg_get_functiondef('public.update_session_timestamp()'::regprocedure))<>'fd82686f1c825c85437f82ed8b4f98ae' THEN RAISE EXCEPTION 'Security baseline drift: update_session_timestamp'; END IF;
 ALTER FUNCTION public.update_session_timestamp() SET search_path TO pg_catalog, public;
 END IF;
END $guard$;
