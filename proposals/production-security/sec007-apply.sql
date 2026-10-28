-- PREPARED ONLY. Explicit Production approval required; execute this file alone.
-- Atomic replacement; preserves owner/ACL, no grants, no data changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $guard$
DECLARE p record;
BEGIN
 SELECT f.*, pg_get_userbyid(f.proowner) owner_name, l.lanname INTO p
 FROM pg_proc f JOIN pg_language l ON l.oid=f.prolang
 WHERE f.oid=to_regprocedure('pharmflow_auth_private.password_change_complete()');
 IF NOT FOUND THEN RAISE EXCEPTION 'SEC-007 missing function'; END IF;
 IF md5(p.prosrc) IS DISTINCT FROM 'e9b53d68c5d32ec04a70409383af5e5f'
 OR p.owner_name IS DISTINCT FROM 'postgres'
 OR p.proacl IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'::aclitem[]
 OR p.prosecdef IS DISTINCT FROM true OR p.provolatile IS DISTINCT FROM 's'
 OR p.lanname IS DISTINCT FROM 'sql' OR p.prorettype <> 'boolean'::regtype
 OR p.proretset OR p.pronargs <> 0
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, auth']::text[]
 THEN RAISE EXCEPTION 'SEC-007 body/owner/ACL/signature/config drift; STOP'; END IF;
END $guard$;
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
$function$
;
DO $guard$
DECLARE p record;
BEGIN
 SELECT f.*, pg_get_userbyid(f.proowner) owner_name, l.lanname INTO p
 FROM pg_proc f JOIN pg_language l ON l.oid=f.prolang
 WHERE f.oid=to_regprocedure('pharmflow_auth_private.password_change_complete()');
 IF NOT FOUND THEN RAISE EXCEPTION 'SEC-007 missing function'; END IF;
 IF md5(p.prosrc) IS DISTINCT FROM '99bda52f1b8577ac07f5c0d81bdbd8f7'
 OR p.owner_name IS DISTINCT FROM 'postgres'
 OR p.proacl IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'::aclitem[]
 OR p.prosecdef IS DISTINCT FROM true OR p.provolatile IS DISTINCT FROM 's'
 OR p.lanname IS DISTINCT FROM 'sql' OR p.prorettype <> 'boolean'::regtype
 OR p.proretset OR p.pronargs <> 0
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, auth']::text[]
 THEN RAISE EXCEPTION 'SEC-007 body/owner/ACL/signature/config drift; STOP'; END IF;
END $guard$;
COMMIT;
