-- SEC-007: preserve password restriction and require the caller's live Auth session.
-- Staging tested. Production execution requires separate release authorization.
DO $preflight$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='pharmflow_auth_private.password_change_complete()'::regprocedure) <> 'e9b53d68c5d32ec04a70409383af5e5f' THEN
  RAISE EXCEPTION 'SEC-007 baseline changed; stop for review';
 END IF;
END $preflight$;
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
   AND coalesce((auth.jwt()->>'exp')::numeric,0)>extract(epoch from now())
   AND EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.id=nullif(auth.jwt()->>'session_id','')::uuid
     AND s.user_id=u.id
     AND (s.not_after IS NULL OR s.not_after>now())
   )
 );
$function$;
