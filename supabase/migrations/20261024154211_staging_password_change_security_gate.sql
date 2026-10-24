-- Staging only. A current server-owned Auth flag gates all Data API business routes.
CREATE SCHEMA pharmflow_auth_private;
REVOKE ALL ON SCHEMA pharmflow_auth_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA pharmflow_auth_private TO authenticated;
CREATE FUNCTION pharmflow_auth_private.password_change_complete()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, auth
AS $fn$
 SELECT EXISTS (
  SELECT 1 FROM auth.users u
  WHERE u.id=auth.uid()
   AND coalesce(u.raw_app_meta_data->>'pharmflow_must_change_password','false')<>'true'
 );
$fn$;
REVOKE ALL ON FUNCTION pharmflow_auth_private.password_change_complete() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION pharmflow_auth_private.password_change_complete() TO authenticated;

CREATE FUNCTION public.pharmflow_password_change_request_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $fn$
DECLARE request_path text:=regexp_replace(coalesce(current_setting('request.path',true),''),'^/','');
BEGIN
 IF auth.uid() IS NULL THEN RETURN; END IF;
 -- Exact identity/bootstrap reads and signed-session cleanup only.
 -- Password replacement and logout use Auth/Edge endpoints, not business RPCs.
 IF request_path=ANY(ARRAY[
  'rpc/get_public_setup_status','rpc/get_my_app_context',
  'rpc/get_my_pharmacy_registration','rpc/close_pharmflow_expiry_auth_session_v1'
 ]) THEN RETURN; END IF;
 IF NOT pharmflow_auth_private.password_change_complete() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PASSWORD_CHANGE_REQUIRED',
   HINT='Replace the temporary password before accessing business data.';
 END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.pharmflow_password_change_request_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pharmflow_password_change_request_guard() TO anon,authenticated,service_role;

-- Restrictive policies cannot be ORed away by existing permissive policies.
CREATE POLICY pharmflow_password_change_gate ON public.pharmflow_expiry_current_state_v1
 AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT pharmflow_auth_private.password_change_complete()))
 WITH CHECK ((SELECT pharmflow_auth_private.password_change_complete()));
CREATE POLICY pharmflow_password_change_gate ON public.pharmflow_expiry_events_v1
 AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT pharmflow_auth_private.password_change_complete()))
 WITH CHECK ((SELECT pharmflow_auth_private.password_change_complete()));
CREATE POLICY pharmflow_password_change_gate ON storage.objects
 AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT pharmflow_auth_private.password_change_complete()))
 WITH CHECK ((SELECT pharmflow_auth_private.password_change_complete()));

DO $check$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles r,unnest(coalesce(r.rolconfig,ARRAY[]::text[])) c
   WHERE r.rolname='authenticator' AND c LIKE 'pgrst.db_pre_request=%') THEN
  RAISE EXCEPTION 'Existing request hook requires explicit composition; refusing to replace it';
 END IF;
END;
$check$;
ALTER ROLE authenticator SET pgrst.db_pre_request='public.pharmflow_password_change_request_guard';
NOTIFY pgrst,'reload config';
