-- OWNER-002. Staging only. Read-only export; no operational/schema identity changes.
CREATE FUNCTION public.owner_export_global_items_page_v1(p_kind text, p_after text DEFAULT '', p_limit integer DEFAULT 750)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_rows jsonb; v_items bigint; v_identifiers bigint; v_version text; v_limit integer:=least(greatest(coalesce(p_limit,750),1),1000);
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_system_owner() OR NOT pharmflow_auth_private.password_change_complete() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='System Owner permission and live session required';
 END IF;
 IF p_kind NOT IN ('Items','Identifiers') OR p_kind IS NULL THEN RAISE EXCEPTION 'Invalid export sheet'; END IF;
 -- A content fingerprint detects edits/deletes/replacements between pages,
 -- including mutations that fail to advance updated_at. Never emit a mixed file.
 SELECT count(*),md5(coalesce(string_agg(md5(row_to_json(i)::text),'' ORDER BY i.item_code),'')) INTO v_items,v_version FROM public.pharmflow_global_items_v2 i;
 SELECT count(*),v_version||':'||md5(coalesce(string_agg(md5(row_to_json(i)::text),'' ORDER BY i.id),'')) INTO v_identifiers,v_version FROM public.pharmflow_global_item_identifiers_v2 i;
 IF p_kind='Items' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.item_code),'[]'::jsonb) INTO v_rows FROM (
   SELECT i.item_code,i.item_name,i.group_name,i.category,i.sub_category,
    (SELECT count(*) FROM public.pharmflow_global_item_identifiers_v2 d WHERE d.item_code=i.item_code) identifier_count
   FROM public.pharmflow_global_items_v2 i WHERE i.item_code>coalesce(p_after,'') ORDER BY i.item_code LIMIT v_limit
  ) r;
 ELSE
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) INTO v_rows FROM (
   SELECT d.id,d.item_code,d.identifier_display FROM public.pharmflow_global_item_identifiers_v2 d
   WHERE p_after IS NULL OR p_after='' OR d.id>p_after::uuid ORDER BY d.id LIMIT v_limit
  ) r;
 END IF;
 RETURN jsonb_build_object('rows',v_rows,'items',v_items,'identifiers',v_identifiers,'version',v_version);
END $fn$;
REVOKE ALL ON FUNCTION public.owner_export_global_items_page_v1(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_export_global_items_page_v1(text,text,integer) TO authenticated;
