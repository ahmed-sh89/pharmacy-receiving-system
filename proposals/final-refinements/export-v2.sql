-- Owner export V2: monotonic transactional revision; export itself stays read-only.
-- Apply to Staging only in this work session. Production requires later approval.
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
CREATE TRIGGER pharmflow_export_revision_items BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.pharmflow_global_items_v2 FOR EACH STATEMENT EXECUTE FUNCTION pharmflow_export_private.bump_master_revision();
CREATE TRIGGER pharmflow_export_revision_identifiers BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.pharmflow_global_item_identifiers_v2 FOR EACH STATEMENT EXECUTE FUNCTION pharmflow_export_private.bump_master_revision();
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
