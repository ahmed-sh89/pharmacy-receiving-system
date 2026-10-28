-- PREPARED ONLY. After explicit rollback approval and UI rollback, never run automatically.
-- Target zznoshzcyxmtwfbznjyr; removes only the new read-only export RPC.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE f record;
BEGIN
 SELECT p.*,pg_get_userbyid(p.proowner) owner_name INTO f FROM pg_proc p WHERE p.oid=to_regprocedure('public.owner_export_global_items_page_v1(text,text,integer)');
 IF NOT FOUND THEN RAISE EXCEPTION 'Export function absent: inspect rollback state';END IF;
 IF md5(f.prosrc) IS DISTINCT FROM '787f48593a68ae2c46aa46f5cedf185a' OR f.owner_name IS DISTINCT FROM 'postgres' OR f.prosecdef IS DISTINCT FROM true
 OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[] THEN RAISE EXCEPTION 'Export function drift: STOP';END IF;
END $guard$;
DROP FUNCTION public.owner_export_global_items_page_v1(text,text,integer);
COMMIT;
