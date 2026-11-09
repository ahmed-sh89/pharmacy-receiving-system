-- Additive Staging candidate. Existing entry points and source snapshots are unchanged.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE SCHEMA pharmflow_receiving_admin_private;
REVOKE ALL ON SCHEMA pharmflow_receiving_admin_private FROM PUBLIC,anon,authenticated;
CREATE TABLE pharmflow_receiving_admin_private.requests (
 pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id), operation_id uuid NOT NULL,
 actor uuid NOT NULL, kind text NOT NULL, request jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(pharmacy_id,operation_id)
);
ALTER TABLE pharmflow_receiving_admin_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pharmflow_receiving_admin_private.requests FROM PUBLIC,anon,authenticated;

-- Read projection of the current authoritative manifest; never browser-supplied identity.
CREATE FUNCTION public.get_pharmflow_workspace_identifiers_v1(p_pharmacy_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_rows jsonb;
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_workspace_identifiers_v1');
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',false,'get_pharmflow_workspace_identifiers_v1');
 WITH codes AS (
 SELECT public.pharmflow_receiving_item_code_v1(x->>'itemCode') code,
 min(x->>'itemName') name, sum(coalesce((x->>'orderedQty')::numeric,0)) qty,
 jsonb_agg(x->'orderNumbers') memberships
 FROM public.pharmflow_active_order_manifest_v1 m,
 LATERAL jsonb_array_elements(coalesce(m.manifest->'orderData','[]')) x
 WHERE m.pharmacy_id=p_pharmacy_id AND coalesce((m.manifest->>'active')::boolean,false)
 GROUP BY 1), items AS (
 SELECT c.*, (SELECT count(*) FROM public.pharmflow_global_items_v2 g WHERE public.pharmflow_receiving_item_code_v1(g.item_code)=c.code) matches,
 (SELECT to_jsonb(g) FROM public.pharmflow_global_items_v2 g WHERE public.pharmflow_receiving_item_code_v1(g.item_code)=c.code ORDER BY g.item_code LIMIT 1) master
 FROM codes c)
 SELECT coalesce(jsonb_agg(jsonb_build_object('itemCode',i.code,'itemName',i.name,'orderedQty',i.qty,'orderMemberships',i.memberships,
 'exists',i.matches=1,'conflict',i.matches>1,'groupName',i.master->>'group_name',
 'identifiers',coalesce((SELECT jsonb_agg(g.identifier_display ORDER BY g.identifier_display) FROM public.pharmflow_global_item_identifiers_v2 g
 WHERE g.item_code=i.master->>'item_code' AND NOT EXISTS(SELECT 1 FROM public.pharmflow_pharmacy_gtin_v1 p WHERE p.pharmacy_id=p_pharmacy_id AND p.identifier_key=g.identifier_key AND public.pharmflow_receiving_item_code_v1(p.item_code)<>i.code)),'[]'::jsonb)
 ||coalesce((SELECT jsonb_agg(p.identifier_display ORDER BY p.identifier_display) FROM public.pharmflow_pharmacy_gtin_v1 p WHERE p.pharmacy_id=p_pharmacy_id AND public.pharmflow_receiving_item_code_v1(p.item_code)=i.code),'[]'::jsonb)) ORDER BY i.code),'[]'::jsonb) INTO v_rows FROM items i;
 RETURN jsonb_build_object('pharmacyId',p_pharmacy_id,'rows',v_rows);
END $$;
REVOKE ALL ON FUNCTION public.get_pharmflow_workspace_identifiers_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_workspace_identifiers_v1(uuid) TO authenticated;

-- Shared creation/linking service. Caller already holds short administration locks.
CREATE FUNCTION pharmflow_receiving_admin_private.map_order_item(pid uuid,row_data jsonb,identifier text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE code text:=public.pharmflow_receiving_item_code_v1(row_data->>'itemCode');
 matches text[]; item public.pharmflow_global_items_v2%rowtype; mapping jsonb;
 key text:=public.pharmflow_identifier_key_v2(identifier); op uuid:=gen_random_uuid();
BEGIN
 IF code='' OR key='' OR nullif(btrim(row_data->>'itemName'),'') IS NULL THEN RAISE EXCEPTION 'Item and barcode required'; END IF;
 -- Durable source rows and current active manifest must both prove this selection.
 PERFORM 1 FROM public.pharmflow_orders h JOIN public.pharmflow_order_source_items s
 ON s.pharmacy_id=h.pharmacy_id AND s.order_number=h.order_number
 JOIN public.pharmflow_active_order_manifest_v1 m ON m.pharmacy_id=h.pharmacy_id
 WHERE h.pharmacy_id=pid AND h.status='uploaded'
 AND (nullif(row_data->>'sourceOrder','') IS NULL OR h.order_number=row_data->>'sourceOrder')
 AND public.pharmflow_receiving_item_code_v1(s.item_code)=code AND btrim(s.item_name)=btrim(row_data->>'itemName')
 AND coalesce((m.manifest->>'active')::boolean,false)
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(m.manifest->'orderData','[]')) x
 WHERE public.pharmflow_receiving_item_code_v1(x->>'itemCode')=code AND (x->'orderNumbers') ? h.order_number);
 IF NOT FOUND THEN RAISE EXCEPTION 'Original Active Order item changed or is unavailable: %',code; END IF;
 SELECT array_agg(g.item_code ORDER BY g.item_code) INTO matches FROM public.pharmflow_global_items_v2 g WHERE public.pharmflow_receiving_item_code_v1(g.item_code)=code;
 IF cardinality(matches)>1 THEN RAISE EXCEPTION 'Canonical Item Code conflict: %',code; END IF;
 IF EXISTS(SELECT 1 FROM public.pharmflow_pharmacy_gtin_v1 p WHERE p.pharmacy_id=pid AND p.identifier_key=key AND public.pharmflow_receiving_item_code_v1(p.item_code)<>code) THEN RAISE EXCEPTION 'Barcode conflicts with pharmacy mapping: %',identifier; END IF;
 IF coalesce(cardinality(matches),0)=0 THEN
  PERFORM public.create_pharmflow_global_item_v2(op,code,btrim(row_data->>'itemName'),row_data->>'groupName',NULL,NULL,identifier,'Receiving workspace mapping');
  SELECT * INTO item FROM public.pharmflow_global_items_v2 g WHERE g.item_code=code;
  SELECT jsonb_build_object('identifierId',g.id,'mappingRevision',g.mapping_revision) INTO mapping FROM public.pharmflow_global_item_identifiers_v2 g WHERE g.identifier_key=key;
 ELSE
  SELECT * INTO item FROM public.pharmflow_global_items_v2 g WHERE g.item_code=matches[1];
  mapping:=public.add_pharmflow_global_identifier_v2(op,identifier,item.item_code,'Receiving workspace mapping');
 END IF;
 -- A same-item pharmacy mapping has higher priority in Receiving.
 SELECT mapping||jsonb_build_object('identifierId',p.id,'mappingRevision',p.mapping_revision,'mappingScope','PHARMACY') INTO mapping
 FROM (SELECT 1) d LEFT JOIN public.pharmflow_pharmacy_gtin_v1 p ON p.pharmacy_id=pid AND p.identifier_key=key
 WHERE p.id IS NOT NULL;
 IF mapping IS NULL THEN
  SELECT jsonb_build_object('identifierId',g.id,'mappingRevision',g.mapping_revision,'mappingScope','GLOBAL') INTO mapping FROM public.pharmflow_global_item_identifiers_v2 g WHERE g.identifier_key=key;
 END IF;
 RETURN mapping||jsonb_build_object('success',true,'itemCode',item.item_code,'itemName',item.item_name,'groupName',item.group_name,'identifierKey',key,'identifierDisplay',btrim(identifier));
END $$;
REVOKE ALL ON FUNCTION pharmflow_receiving_admin_private.map_order_item(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.map_pharmflow_workspace_identifiers_v1(p_pharmacy_id uuid,p_operation_id uuid,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $$
DECLARE prior pharmflow_receiving_admin_private.requests%rowtype; row_data jsonb; results jsonb:='[]'; reply jsonb;
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'map_pharmflow_workspace_identifiers_v1',p_operation_id::text);
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'GLOBAL',true,'map_pharmflow_workspace_identifiers_v1',p_operation_id::text);
 IF auth.uid() IS NULL OR NOT public.is_pharmacy_admin(p_pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy admin required'; END IF;
 IF p_operation_id IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Select 1 to 500 mappings'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x GROUP BY public.pharmflow_identifier_key_v2(x->>'identifierDisplay') HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x GROUP BY public.pharmflow_receiving_item_code_v1(x->>'itemCode') HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate barcode or Item Code in submission'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||p_operation_id::text,61109));
 SELECT * INTO prior FROM pharmflow_receiving_admin_private.requests WHERE pharmacy_id=p_pharmacy_id AND operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.actor<>auth.uid() OR prior.kind<>'BULK' OR prior.request<>p_rows THEN RAISE EXCEPTION 'Operation ID input mismatch'; END IF;
  RETURN prior.result;
 END IF;
 PERFORM 1 FROM public.pharmflow_active_order_manifest_v1 WHERE pharmacy_id=p_pharmacy_id FOR SHARE;
 PERFORM 1 FROM public.pharmflow_orders WHERE pharmacy_id=p_pharmacy_id ORDER BY order_number FOR SHARE;
 LOCK TABLE public.pharmflow_pharmacy_gtin_v1 IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.pharmflow_global_item_identifiers_v2 IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.pharmflow_global_items_v2 IN SHARE ROW EXCLUSIVE MODE;
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  results:=results||jsonb_build_array(pharmflow_receiving_admin_private.map_order_item(p_pharmacy_id,row_data,row_data->>'identifierDisplay'));
 END LOOP;
 reply:=jsonb_build_object('success',true,'operationId',p_operation_id,'pharmacyId',p_pharmacy_id,'mappings',results);
 INSERT INTO pharmflow_receiving_admin_private.requests VALUES(p_pharmacy_id,p_operation_id,auth.uid(),'BULK',p_rows,reply,now());
 RETURN reply;
END $$;
REVOKE ALL ON FUNCTION public.map_pharmflow_workspace_identifiers_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.map_pharmflow_workspace_identifiers_v1(uuid,uuid,jsonb) TO authenticated;

CREATE FUNCTION public.quick_add_pharmflow_saved_review_v1(p_pharmacy_id uuid,p_operation_id uuid,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $$
DECLARE prior pharmflow_receiving_admin_private.requests%rowtype; r jsonb; a jsonb; review public.pharmflow_needs_review_v2%rowtype;
 mapping jsonb; intent jsonb; resolution jsonb; payload jsonb; ack record; receipts jsonb:='[]'; reply jsonb; base text; tx public.pharmflow_receiving_transactions_v1%rowtype;
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'quick_add_pharmflow_saved_review_v1',p_operation_id::text);
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'GLOBAL',true,'quick_add_pharmflow_saved_review_v1',p_operation_id::text);
 IF auth.uid() IS NULL OR NOT public.is_pharmacy_admin(p_pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy admin required'; END IF;
 IF p_operation_id IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid saved review selection'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x GROUP BY x->>'reviewId' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate review'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||p_operation_id::text,61109));
 SELECT * INTO prior FROM pharmflow_receiving_admin_private.requests WHERE pharmacy_id=p_pharmacy_id AND operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.actor<>auth.uid() OR prior.kind<>'REVIEW' OR prior.request<>p_rows THEN RAISE EXCEPTION 'Operation ID input mismatch'; END IF;
  RETURN prior.result;
 END IF;
 PERFORM 1 FROM public.pharmflow_active_order_manifest_v1 WHERE pharmacy_id=p_pharmacy_id FOR SHARE;
 PERFORM 1 FROM public.pharmflow_orders WHERE pharmacy_id=p_pharmacy_id ORDER BY order_number FOR SHARE;
 PERFORM 1 FROM public.pharmflow_needs_review_v2 WHERE pharmacy_id=p_pharmacy_id AND id IN(SELECT (x->>'reviewId')::uuid FROM jsonb_array_elements(p_rows) x) ORDER BY id FOR UPDATE;
 LOCK TABLE public.pharmflow_pharmacy_gtin_v1 IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.pharmflow_global_item_identifiers_v2 IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.pharmflow_global_items_v2 IN SHARE ROW EXCLUSIVE MODE;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  SELECT * INTO review FROM public.pharmflow_needs_review_v2 WHERE pharmacy_id=p_pharmacy_id AND id=(r->>'reviewId')::uuid;
  IF review.id IS NULL OR review.workflow<>'RECEIVING' OR review.status<>'PENDING' THEN RAISE EXCEPTION 'Pending Receiving review unavailable'; END IF;
  IF NOT coalesce((r->>'sourceOrder')=ANY(CASE WHEN cardinality(review.work_scope_order_numbers)>0 THEN review.work_scope_order_numbers ELSE ARRAY[review.order_number] END),false) THEN RAISE EXCEPTION 'Selected Order outside captured scope'; END IF;
  IF nullif(btrim(review.order_number),'') IS NOT NULL AND ((r->>'sourceOrder') IS DISTINCT FROM review.order_number OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'allocations') x WHERE x->>'orderNumber' IS DISTINCT FROM review.order_number)) THEN RAISE EXCEPTION 'Original assigned Order must be preserved'; END IF;
  base:='NEEDS_REVIEW_V2:'||review.id::text;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'allocations') WITH ORDINALITY x(value,n) WHERE value->>'transactionId'<>CASE WHEN jsonb_array_length(r->'allocations')=1 THEN base ELSE base||':A'||n::text END) THEN RAISE EXCEPTION 'Original review receipt IDs required'; END IF;
  mapping:=pharmflow_receiving_admin_private.map_order_item(p_pharmacy_id,r,coalesce(review.identifier_display,review.gtin));
  -- Preserve Order identity for manifest membership and finalizer equality.
  intent:=public.request_pharmflow_needs_review_resolution_v5(gen_random_uuid(),p_pharmacy_id,review.id,r->>'itemCode',r->>'itemName',base,r->'allocations');
  IF intent->>'status' NOT IN ('PENDING','RESOLVED') OR intent->>'status' IS NULL THEN RAISE EXCEPTION 'Review allocation blocked: %',intent; END IF;
  resolution:=mapping||jsonb_build_object('contractVersion',4,'kind',CASE WHEN mapping->>'mappingScope'='GLOBAL' THEN 'GLOBAL_LEARNED' ELSE 'PHARMACY_LEARNED' END,'mappingId',mapping->>'identifierId','resolvedItemCode',mapping->>'itemCode');
  FOR a IN SELECT value FROM jsonb_array_elements(r->'allocations') LOOP
   payload:=jsonb_build_object('transactionId',a->>'transactionId','orderId',a->>'orderNumber','selectedOrderNumber',a->>'orderNumber','itemCode',r->>'itemCode','itemName',r->>'itemName','gtin',coalesce(review.identifier_display,review.gtin),'quantity',(a->>'quantity')::integer,'manual',false,'source','SCANNER','gtinResolution',resolution,'savedReviewId',review.id);
   SELECT * INTO ack FROM public.append_pharmflow_learned_transaction_v4(p_pharmacy_id,a->>'transactionId',a->>'orderNumber',r->>'itemCode',r->>'itemName',coalesce(review.identifier_display,review.gtin),(a->>'quantity')::integer,'SCANNER',coalesce(review.device_id,''),now(),payload,(mapping->>'identifierId')::uuid,(mapping->>'mappingRevision')::bigint,mapping->>'mappingScope');
   IF ack.acknowledged IS DISTINCT FROM true THEN RAISE EXCEPTION 'Saved review receipt not acknowledged'; END IF;
   SELECT * INTO tx FROM public.pharmflow_receiving_transactions_v1 WHERE pharmacy_id=p_pharmacy_id AND transaction_id=a->>'transactionId';
   receipts:=receipts||jsonb_build_array(to_jsonb(tx));
  END LOOP;
  SELECT public.try_finalize_pharmflow_needs_review_resolution_intent_v2(i.id) INTO intent FROM public.pharmflow_needs_review_resolution_intents_v1 i WHERE i.pharmacy_id=p_pharmacy_id AND i.review_id=review.id;
  IF intent->>'status' IS DISTINCT FROM 'RESOLVED' THEN RAISE EXCEPTION 'Review confirmation unavailable'; END IF;
 END LOOP;
 reply:=jsonb_build_object('success',true,'status','RESOLVED','operationId',p_operation_id,'pharmacyId',p_pharmacy_id,'receipts',receipts);
 INSERT INTO pharmflow_receiving_admin_private.requests VALUES(p_pharmacy_id,p_operation_id,auth.uid(),'REVIEW',p_rows,reply,now());
 RETURN reply;
END $$;
REVOKE ALL ON FUNCTION public.quick_add_pharmflow_saved_review_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quick_add_pharmflow_saved_review_v1(uuid,uuid,jsonb) TO authenticated;
COMMIT;
