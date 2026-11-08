-- Permit only a boolean self-session probe before mandatory password completion.
-- No business endpoint is exempted; apply after security_session_boundaries.
DO $guard$ BEGIN
 IF to_regprocedure('public.pharmflow_has_live_session_v1()') IS NULL THEN RAISE EXCEPTION 'Apply security_session_boundaries first'; END IF;
 IF md5(pg_get_functiondef('public.pharmflow_password_change_request_guard()'::regprocedure))<>'d3952a921b4445b44d69b34fb3d0971f' THEN RAISE EXCEPTION 'Security baseline drift: request guard'; END IF;
 EXECUTE $candidate$CREATE OR REPLACE FUNCTION public.pharmflow_password_change_request_guard()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE request_path text:=regexp_replace(coalesce(current_setting('request.path',true),''),'^/','');
BEGIN
 IF auth.uid() IS NULL THEN RETURN; END IF;
 -- Exact identity/bootstrap reads and signed-session cleanup only.
 -- Password replacement and logout use Auth/Edge endpoints, not business RPCs.
 IF request_path=ANY(ARRAY[
  'rpc/get_public_setup_status','rpc/get_my_app_context','rpc/pharmflow_has_live_session_v1',
  'rpc/get_my_pharmacy_registration','rpc/close_pharmflow_expiry_auth_session_v1'
 ]) THEN RETURN; END IF;
 IF NOT pharmflow_auth_private.password_change_complete() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PASSWORD_CHANGE_REQUIRED',
   HINT='Replace the temporary password before accessing business data.';
 END IF;
END;
$function$;$candidate$;
END $guard$;
