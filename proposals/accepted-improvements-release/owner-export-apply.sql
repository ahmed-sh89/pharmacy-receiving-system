-- PREPARED ONLY: explicit Production approval required. Target zznoshzcyxmtwfbznjyr.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE f record;
BEGIN
 SELECT p.*,pg_get_userbyid(p.proowner) owner_name INTO f FROM pg_proc p WHERE p.oid=to_regprocedure('pharmflow_auth_private.password_change_complete()');
 IF NOT FOUND OR md5(f.prosrc) IS DISTINCT FROM '99bda52f1b8577ac07f5c0d81bdbd8f7' OR f.owner_name IS DISTINCT FROM 'postgres'
 OR f.proacl IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'::aclitem[]
 OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, auth']::text[] THEN RAISE EXCEPTION 'SEC-007 drift: STOP';END IF;
 IF to_regprocedure('public.owner_export_global_items_page_v2(text,text,integer,text)') IS NOT NULL OR exists(select 1 from pg_namespace where nspname='pharmflow_export_private') THEN RAISE EXCEPTION 'Export V2 already exists: inspect deployment state';END IF;
 -- Fail closed on dependencies actually consumed by the exporter.
 IF to_regprocedure('public.is_system_owner()') IS NULL THEN RAISE EXCEPTION 'Owner guard missing: STOP';END IF;
 IF EXISTS (
   SELECT 1 FROM (VALUES
    ('pharmflow_global_items_v2','item_code','text'),('pharmflow_global_items_v2','item_name','text'),
    ('pharmflow_global_items_v2','group_name','text'),('pharmflow_global_items_v2','category','text'),('pharmflow_global_items_v2','sub_category','text'),
    ('pharmflow_global_item_identifiers_v2','id','uuid'),('pharmflow_global_item_identifiers_v2','item_code','text'),('pharmflow_global_item_identifiers_v2','identifier_display','text')
   ) required(table_name,column_name,data_type)
   LEFT JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name=required.table_name AND c.column_name=required.column_name
   WHERE c.data_type IS DISTINCT FROM required.data_type
 ) THEN RAISE EXCEPTION 'Master column/type drift: STOP';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index x JOIN pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=x.indkey[0]
   WHERE x.indrelid='public.pharmflow_global_items_v2'::regclass AND x.indisprimary AND x.indnkeyatts=1 AND a.attname='item_code')
 OR NOT EXISTS(SELECT 1 FROM pg_index x JOIN pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=x.indkey[0]
   WHERE x.indrelid='public.pharmflow_global_item_identifiers_v2'::regclass AND x.indisprimary AND x.indnkeyatts=1 AND a.attname='id')
 OR NOT EXISTS(SELECT 1 FROM pg_index x JOIN pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=x.indkey[0]
   WHERE x.indrelid='public.pharmflow_global_item_identifiers_v2'::regclass AND x.indisvalid AND x.indpred IS NULL AND a.attname='item_code')
 THEN RAISE EXCEPTION 'Master pagination/index dependency drift: STOP';END IF;
END $guard$;
-- Owner export V2: monotonic transactional revision; export itself stays read-only.
-- Production proposal only: apply after explicit approval and successful live preflight.
CREATE SCHEMA pharmflow_export_private;
REVOKE ALL ON SCHEMA pharmflow_export_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE pharmflow_export_private.master_revision(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),revision bigint NOT NULL CHECK(revision>0));
ALTER TABLE pharmflow_export_private.master_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pharmflow_export_private.master_revision FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO pharmflow_export_private.master_revision VALUES(true,1);
CREATE FUNCTION pharmflow_export_private.bump_master_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 UPDATE pharmflow_export_private.master_revision SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'Master export revision unavailable';END IF;
 RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION pharmflow_export_private.bump_master_revision() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER pharmflow_export_revision_items AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.pharmflow_global_items_v2 FOR EACH STATEMENT EXECUTE FUNCTION pharmflow_export_private.bump_master_revision();
CREATE TRIGGER pharmflow_export_revision_identifiers AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.pharmflow_global_item_identifiers_v2 FOR EACH STATEMENT EXECUTE FUNCTION pharmflow_export_private.bump_master_revision();
CREATE FUNCTION public.owner_export_global_items_page_v2(p_kind text,p_after text DEFAULT '',p_limit integer DEFAULT 750,p_version text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_rows jsonb;v_version text;v_meta jsonb:='{}';v_limit integer:=least(greatest(coalesce(p_limit,750),1),1000);
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_system_owner() OR NOT pharmflow_auth_private.password_change_complete() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='System Owner permission and live session required';
 END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('Items','Identifiers') THEN RAISE EXCEPTION 'Invalid export sheet';END IF;
 -- STABLE uses one request snapshot for revision, counts and page contents.
 SELECT 'MASTER_V2:'||revision::text INTO v_version FROM pharmflow_export_private.master_revision WHERE singleton;
 IF v_version IS NULL THEN RAISE EXCEPTION 'Master export revision unavailable';END IF;
 IF p_version IS NULL THEN
  IF p_kind<>'Items' OR coalesce(p_after,'')<>'' THEN RAISE EXCEPTION 'Export must start with Items';END IF;
  SELECT jsonb_build_object('items',(select count(*) from public.pharmflow_global_items_v2),'identifiers',(select count(*) from public.pharmflow_global_item_identifiers_v2)) INTO v_meta;
 ELSIF p_version IS DISTINCT FROM v_version THEN RAISE EXCEPTION 'Global Items changed during export. Please download again.';
 END IF;
 IF p_kind='Items' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.item_code),'[]') INTO v_rows FROM (
   SELECT i.item_code,i.item_name,i.group_name,i.category,i.sub_category,(select count(*) from public.pharmflow_global_item_identifiers_v2 d where d.item_code=i.item_code) identifier_count
   FROM public.pharmflow_global_items_v2 i WHERE i.item_code>coalesce(p_after,'') ORDER BY i.item_code LIMIT v_limit
  ) r;
 ELSE
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') INTO v_rows FROM (
   SELECT d.id,d.item_code,d.identifier_display FROM public.pharmflow_global_item_identifiers_v2 d
   WHERE nullif(p_after,'') IS NULL OR d.id>nullif(p_after,'')::uuid ORDER BY d.id LIMIT v_limit
  ) r;
 END IF;
 RETURN jsonb_build_object('rows',v_rows,'version',v_version)||v_meta;
END $fn$;
REVOKE ALL ON FUNCTION public.owner_export_global_items_page_v2(text,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_export_global_items_page_v2(text,text,integer,text) TO authenticated;

COMMIT;
