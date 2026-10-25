-- Additive read contract. Existing history RPCs, records, policies and ACLs stay unchanged.
CREATE OR REPLACE FUNCTION public.list_pharmflow_handheld_receiving_history_v1(
 p_pharmacy_id uuid, p_device_id text,
 p_before_created_at timestamptz DEFAULT NULL, p_before_review_id uuid DEFAULT NULL,
 p_limit integer DEFAULT 10
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
 v_manifest jsonb; v_orders text[] := '{}'; v_limit integer;
 v_rows jsonb; v_page jsonb; v_unknown bigint; v_more boolean;
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_handheld_receiving_history_v1',NULL);
 IF auth.uid() IS NULL OR NOT public.is_pharmacy_member(p_pharmacy_id) THEN
  RAISE EXCEPTION 'Pharmacy access required' USING ERRCODE='42501';
 END IF;
 IF nullif(btrim(p_device_id),'') IS NULL OR length(p_device_id)>200 THEN RAISE EXCEPTION 'Device context required'; END IF;
 IF (p_before_created_at IS NULL) <> (p_before_review_id IS NULL) THEN RAISE EXCEPTION 'Complete history cursor required'; END IF;
 v_limit := greatest(1,least(coalesce(p_limit,10),100));
 SELECT m.manifest INTO v_manifest FROM public.pharmflow_active_order_manifest_v1 m WHERE m.pharmacy_id=p_pharmacy_id;
 -- Mirror the existing computer-controlled Handheld assignment intersection.
 IF v_manifest->'handheldScopeConfigured' = 'true'::jsonb THEN
  SELECT coalesce(array_agg(DISTINCT a.code ORDER BY a.code),'{}'::text[]) INTO v_orders
  FROM (SELECT upper(regexp_replace(btrim(x),'\s','','g')) code
        FROM jsonb_array_elements_text(coalesce(v_manifest->'handheldOrderNumbers','[]'::jsonb)) x) a
  WHERE a.code<>'' AND EXISTS (
   SELECT 1 FROM jsonb_array_elements(coalesce(v_manifest->'orderFiles','[]'::jsonb)) f
   WHERE upper(regexp_replace(btrim(coalesce(nullif(f->>'documentId',''),f->>'orderNumber','')),'\s','','g'))=a.code
  );
 END IF;
 SELECT count(*) INTO v_unknown FROM public.pharmflow_needs_review_v2 r
 WHERE r.pharmacy_id=p_pharmacy_id AND r.workflow='RECEIVING' AND r.device_id=p_device_id
 AND nullif(btrim(r.order_number),'') IS NULL
 AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(r.work_scope_order_numbers,'{}'::text[])) s WHERE nullif(btrim(s),'') IS NOT NULL);
 SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY page.created_at DESC,page.review_id DESC),'[]'::jsonb) INTO v_rows
 FROM (
  SELECT r.id AS review_id,r.workflow,coalesce(r.session_id,'') AS session_id,
   coalesce(r.order_number,'') AS order_number,coalesce(r.order_name,'') AS order_name,
   r.gtin,coalesce(r.raw_barcode,'') AS raw_barcode,r.pending_quantity,r.review_reason,
   coalesce(r.master_item_code_hint,'') AS master_item_code_hint,coalesce(r.master_item_name_hint,'') AS master_item_name_hint,
   r.photo_path,r.source,coalesce(r.device_id,'') AS device_id,r.status,
   coalesce(r.resolved_item_code,'') AS resolved_item_code,coalesce(r.resolved_item_name,'') AS resolved_item_name,
   coalesce(r.resolution_type,'') AS resolution_type,coalesce(r.resolution_transaction_id,'') AS resolution_transaction_id,
   r.created_at,r.updated_at,r.resolved_at,r.work_scope_order_numbers,
   coalesce(r.identifier_display,r.gtin) AS identifier_display
  FROM public.pharmflow_needs_review_v2 r
  WHERE r.pharmacy_id=p_pharmacy_id AND r.workflow='RECEIVING' AND r.device_id=p_device_id
   AND (upper(regexp_replace(btrim(coalesce(r.order_number,'')),'\s','','g'))=ANY(v_orders)
    OR EXISTS (SELECT 1 FROM unnest(coalesce(r.work_scope_order_numbers,'{}'::text[])) s
       WHERE upper(regexp_replace(btrim(s),'\s','','g'))=ANY(v_orders)))
   AND (p_before_created_at IS NULL OR (r.created_at,r.id)<(p_before_created_at,p_before_review_id))
  ORDER BY r.created_at DESC,r.id DESC LIMIT v_limit+1
 ) page;
 v_more := jsonb_array_length(v_rows)>v_limit;
 SELECT coalesce(jsonb_agg(e.value ORDER BY e.ordinality),'[]'::jsonb) INTO v_page
 FROM jsonb_array_elements(v_rows) WITH ORDINALITY e(value,ordinality) WHERE e.ordinality<=v_limit;
 RETURN jsonb_build_object('rows',v_page,'assigned_orders',v_orders,'indeterminate_count',v_unknown,
  'has_more',v_more,'next_cursor',CASE WHEN v_more THEN jsonb_build_object('created_at',v_page->-1->'created_at','review_id',v_page->-1->'review_id') ELSE NULL END);
END;
$function$;
REVOKE ALL ON FUNCTION public.list_pharmflow_handheld_receiving_history_v1(uuid,text,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_handheld_receiving_history_v1(uuid,text,timestamptz,uuid,integer) TO authenticated;
COMMENT ON FUNCTION public.list_pharmflow_handheld_receiving_history_v1(uuid,text,timestamptz,uuid,integer)
IS 'Read-only assigned-order Receiving review history; original captured scope; created_at/id descending keyset pagination; no record mutations.';
