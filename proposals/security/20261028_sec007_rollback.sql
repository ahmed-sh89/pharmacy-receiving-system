-- Recorded pre-change Staging definition. Reopens the revoked-token window.
-- Apply only under separately approved incident rollback after fresh review.
CREATE OR REPLACE FUNCTION pharmflow_auth_private.password_change_complete()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'auth'
AS $function$
 SELECT EXISTS (
  SELECT 1 FROM auth.users u
  WHERE u.id=auth.uid()
   AND coalesce(u.raw_app_meta_data->>'pharmflow_must_change_password','false')<>'true'
 );
$function$;
