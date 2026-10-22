-- REVIEW DRAFT ONLY. DO NOT EXECUTE without separate Product Owner SQL approval.
-- Additive contracts; existing mappings, audits and v2/v3 entry points remain intact.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.pharmflow_receiving_item_code_v1(p_code text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v text:=upper(regexp_replace(replace(regexp_replace(coalesce(p_code,''),'^''+',''),chr(160),''),'\s+','','g'));
BEGIN
 IF v ~ '^\d+\.0+$' THEN v:=regexp_replace(v,'\.0+$',''); END IF;
 IF v ~ '^\d+$' THEN v:=regexp_replace(v,'^0+(?=\d)',''); END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.pharmflow_receiving_item_code_v1(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.learn_pharmflow_existing_identifier_v3(
 p_operation_id uuid,p_pharmacy_id uuid,p_identifier_display text,p_item_code text,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='3s' AS $$
DECLARE
 v_code text:=btrim(coalesce(p_item_code,''));
 v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
 v_local public.pharmflow_pharmacy_gtin_v1%rowtype;
 v_global public.pharmflow_global_item_identifiers_v2%rowtype;
 v_item public.pharmflow_global_items_v2%rowtype;
 v_result jsonb; v_audit record; v_completed_operation boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR NOT public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy ADMIN access required'; END IF;
 IF p_operation_id IS NULL OR v_key='' OR v_code='' OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Operation, identifier, Master code and reason required'; END IF;
 -- Match the supplied authoritative Master code exactly. Order normalization never changes identifier keys.
 SELECT * INTO v_item FROM public.pharmflow_global_items_v2 WHERE item_code=v_code FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Existing Global Master item required; use the separate Group-validated creation contract'; END IF;
 -- Low-volume administration only. These locks also exclude legacy writers that do not share advisory locks.
 -- One lock order for scope checks; conflicts time out rather than silently remapping an identifier.
 LOCK TABLE public.pharmflow_pharmacy_gtin_v1 IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.pharmflow_global_item_identifiers_v2 IN SHARE ROW EXCLUSIVE MODE;
 FOR v_audit IN
   SELECT identifier_key,new_item_code,action FROM public.pharmflow_identifier_mapping_audit_v1 WHERE operation_id=p_operation_id
   UNION ALL
   SELECT identifier_key,new_item_code,action FROM public.pharmflow_pharmacy_identifier_mapping_audit_v2 WHERE operation_id=p_operation_id AND pharmacy_id=p_pharmacy_id
 LOOP
   v_completed_operation:=true;
   IF v_audit.identifier_key<>v_key OR v_audit.new_item_code IS DISTINCT FROM v_code OR v_audit.action<>'ADD' THEN RAISE EXCEPTION 'Operation ID input mismatch'; END IF;
 END LOOP;
 SELECT * INTO v_local FROM public.pharmflow_pharmacy_gtin_v1 WHERE pharmacy_id=p_pharmacy_id AND identifier_key=v_key FOR UPDATE;
 IF FOUND THEN
   IF v_local.item_code<>v_code THEN RAISE EXCEPTION 'Identifier conflicts with an existing Pharmacy override'; END IF;
   -- Preserve an intentional override, including one differing from a lower-priority Global mapping.
   v_result:=jsonb_build_object('mappingScope','PHARMACY','identifierId',v_local.id,'mappingRevision',v_local.mapping_revision);
 ELSE
   SELECT * INTO v_global FROM public.pharmflow_global_item_identifiers_v2 WHERE identifier_key=v_key FOR UPDATE;
   IF FOUND AND v_global.item_code<>v_code THEN RAISE EXCEPTION 'Identifier conflicts with an existing Global mapping'; END IF;
   IF v_global.id IS NOT NULL THEN
     v_result:=jsonb_build_object('mappingScope','GLOBAL','identifierId',v_global.id,'mappingRevision',v_global.mapping_revision);
   ELSIF v_completed_operation THEN
     RAISE EXCEPTION 'Completed mapping operation cannot recreate a removed mapping; resolve again';
   ELSIF public.pharmflow_is_reference_master_admin_v1() THEN
     v_result:=public.add_pharmflow_global_identifier_v2(p_operation_id,p_identifier_display,v_code,p_reason)||jsonb_build_object('mappingScope','GLOBAL');
   ELSE
     v_result:=public.add_pharmflow_pharmacy_identifier_v2(p_operation_id,p_pharmacy_id,p_identifier_display,v_code,v_item.item_name,p_reason)||jsonb_build_object('mappingScope','PHARMACY');
   END IF;
 END IF;
 RETURN v_result||jsonb_build_object('success',true,'itemCode',v_item.item_code,'itemName',v_item.item_name,'groupName',v_item.group_name,
   'identifierDisplay',btrim(p_identifier_display),'identifierKey',v_key,'globalItemCreated',false);
END $$;
REVOKE ALL ON FUNCTION public.learn_pharmflow_existing_identifier_v3(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.learn_pharmflow_existing_identifier_v3(uuid,uuid,text,text,text) TO authenticated;

CREATE FUNCTION public.append_pharmflow_learned_transaction_v4(
 p_pharmacy_id uuid,p_transaction_id text,p_order_number text,p_item_code text,p_item_name text,p_gtin text,
 p_quantity integer,p_source text,p_device_id text,p_occurred_at timestamptz,p_payload jsonb,
 p_mapping_id uuid,p_mapping_revision bigint,p_mapping_scope text
) RETURNS TABLE(acknowledged boolean,inserted boolean,authoritative_received bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='3s' AS $$
DECLARE
 v_scope text:=upper(btrim(coalesce(p_mapping_scope,'')));
 v_key text:=public.pharmflow_identifier_key_v2(p_gtin);
 v_kind text; v_existing public.pharmflow_receiving_transactions_v1%rowtype;
 v_mapping_id uuid; v_revision bigint; v_code text; v_ack record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_pharmacy_member(p_pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy access required'; END IF;
 IF v_scope NOT IN ('GLOBAL','PHARMACY') OR p_mapping_id IS NULL OR coalesce(p_mapping_revision,0)<=0
   OR coalesce(p_quantity,0)<=0 OR v_key='' OR nullif(btrim(p_transaction_id),'') IS NULL OR nullif(btrim(p_order_number),'') IS NULL THEN RAISE EXCEPTION 'Valid scoped learned receipt required'; END IF;
 v_kind:=CASE WHEN v_scope='GLOBAL' THEN 'GLOBAL_LEARNED' ELSE 'PHARMACY_LEARNED' END;
 IF (p_payload#>>'{gtinResolution,kind}') IS DISTINCT FROM v_kind
   OR (p_payload#>>'{gtinResolution,mappingId}') IS DISTINCT FROM p_mapping_id::text
   OR (p_payload#>>'{gtinResolution,mappingRevision}') IS DISTINCT FROM p_mapping_revision::text
   OR public.pharmflow_identifier_key_v2(p_payload#>>'{gtinResolution,identifierKey}')<>v_key
   OR public.pharmflow_receiving_item_code_v1(p_payload#>>'{gtinResolution,resolvedItemCode}') IS DISTINCT FROM public.pharmflow_receiving_item_code_v1(p_item_code) THEN RAISE EXCEPTION 'Learned receipt provenance mismatch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||btrim(p_order_number)||'|'||btrim(p_item_code),0));
 -- An acknowledged historical receipt remains retryable after a later mapping revision/removal.
 SELECT * INTO v_existing FROM public.pharmflow_receiving_transactions_v1 WHERE pharmacy_id=p_pharmacy_id AND transaction_id=btrim(p_transaction_id);
 IF FOUND THEN
   IF v_existing.order_number IS DISTINCT FROM btrim(p_order_number) OR v_existing.item_code IS DISTINCT FROM btrim(p_item_code)
     OR v_existing.quantity IS DISTINCT FROM p_quantity OR public.pharmflow_identifier_key_v2(v_existing.gtin)<>v_key
     OR (v_existing.payload#>'{gtinResolution}') IS DISTINCT FROM (p_payload#>'{gtinResolution}')
     OR coalesce(v_existing.payload->>'manual','false') IS DISTINCT FROM coalesce(p_payload->>'manual','false') THEN RAISE EXCEPTION 'Transaction ID input mismatch'; END IF;
   RETURN QUERY SELECT true,false,coalesce(sum(t.quantity),0)::bigint FROM public.pharmflow_receiving_transactions_v1 t WHERE t.pharmacy_id=p_pharmacy_id AND t.order_number=btrim(p_order_number) AND t.item_code=btrim(p_item_code);
   RETURN;
 END IF;
 PERFORM 1 FROM public.pharmflow_orders WHERE pharmacy_id=p_pharmacy_id AND order_number=btrim(p_order_number) AND status='uploaded' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Target Order unavailable'; END IF;
 LOCK TABLE public.pharmflow_pharmacy_gtin_v1 IN SHARE MODE;
 LOCK TABLE public.pharmflow_global_item_identifiers_v2 IN SHARE MODE;
 SELECT id,mapping_revision,item_code INTO v_mapping_id,v_revision,v_code FROM public.pharmflow_pharmacy_gtin_v1 WHERE pharmacy_id=p_pharmacy_id AND identifier_key=v_key;
 IF v_scope='GLOBAL' THEN
   -- A concurrently added Pharmacy override always wins; never receive against a lower-priority mapping.
   IF v_mapping_id IS NOT NULL THEN RAISE EXCEPTION 'Pharmacy override now exists; resolve identifier again'; END IF;
   SELECT id,mapping_revision,item_code INTO v_mapping_id,v_revision,v_code FROM public.pharmflow_global_item_identifiers_v2 WHERE identifier_key=v_key;
 END IF;
 IF v_mapping_id IS DISTINCT FROM p_mapping_id OR v_revision IS DISTINCT FROM p_mapping_revision OR public.pharmflow_receiving_item_code_v1(v_code) IS DISTINCT FROM public.pharmflow_receiving_item_code_v1(p_item_code) THEN RAISE EXCEPTION 'Mapping changed; resolve identifier again'; END IF;
 SELECT * INTO v_ack FROM public.append_pharmflow_receiving_action_v4(p_pharmacy_id,p_transaction_id,p_order_number,p_item_code,p_item_name,p_gtin,p_quantity,p_source,p_device_id,p_occurred_at,p_payload);
 SELECT * INTO v_existing FROM public.pharmflow_receiving_transactions_v1 WHERE pharmacy_id=p_pharmacy_id AND transaction_id=btrim(p_transaction_id);
 IF (v_existing.payload#>'{gtinResolution}') IS DISTINCT FROM (p_payload#>'{gtinResolution}') THEN RAISE EXCEPTION 'Concurrent receipt provenance mismatch'; END IF;
 RETURN QUERY SELECT v_ack.acknowledged,v_ack.inserted,v_ack.authoritative_received;
END $$;
REVOKE ALL ON FUNCTION public.append_pharmflow_learned_transaction_v4(uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_pharmflow_learned_transaction_v4(uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb,uuid,bigint,text) TO authenticated;
-- Quick Add composes existing Settings creation + learning + receipts in ONE transaction.
-- No new mapping/item implementation, no new operation table, no client-side receipt replay.
CREATE FUNCTION public.quick_add_pharmflow_order_item_v1(
 p_operation_id uuid,p_pharmacy_id uuid,p_source_order text,p_work_scope_order_numbers text[],
 p_item_code text,p_item_name text,p_group_name text,p_identifier_display text,p_quantity integer,
 p_allow_over_receiving boolean DEFAULT false,p_capture jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='3s' AS $$
DECLARE
 v_scope text[];v_request jsonb;v_base text:='QUICK_ADD_V1:'||p_operation_id::text;
 v_first public.pharmflow_receiving_transactions_v1%rowtype;
 v_item public.pharmflow_global_items_v2%rowtype;
 v_mapping jsonb;v_resolution jsonb;v_payload jsonb;v_ack record;v_receipts jsonb;
 v_matches text[];v_created boolean:=false;v_ordered numeric;v_received bigint;
 v_code text:=public.pharmflow_receiving_item_code_v1(p_item_code);
 v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
BEGIN
 IF auth.uid() IS NULL OR NOT public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy ADMIN permission is required to link an identifier'; END IF;
 IF p_operation_id IS NULL OR v_code='' OR nullif(btrim(p_item_name),'') IS NULL OR v_key='' OR coalesce(p_quantity,0)<1 THEN RAISE EXCEPTION 'Operation, selected Order item, identifier and positive quantity required'; END IF;
 IF jsonb_typeof(coalesce(p_capture,'{}'::jsonb))<>'object' OR octet_length(coalesce(p_capture,'{}'::jsonb)::text)>32768 THEN RAISE EXCEPTION 'Invalid scan capture'; END IF;
 SELECT coalesce(array_agg(DISTINCT btrim(o) ORDER BY btrim(o)),ARRAY[]::text[]) INTO v_scope FROM unnest(coalesce(p_work_scope_order_numbers,ARRAY[]::text[])) o WHERE btrim(coalesce(o,''))<>'';
 IF NOT coalesce(btrim(p_source_order)=ANY(v_scope),false) THEN RAISE EXCEPTION 'Selected row Order must belong to original work scope'; END IF;
 v_request:=jsonb_build_object('sourceOrder',btrim(p_source_order),'scope',to_jsonb(v_scope),'itemCode',btrim(p_item_code),'itemName',btrim(p_item_name),
   'group',btrim(coalesce(p_group_name,'')),'identifierDisplay',btrim(p_identifier_display),'quantity',p_quantity,'allowOverReceiving',coalesce(p_allow_over_receiving,false),
   'capture',jsonb_build_object('lot',coalesce(p_capture->>'lot',''),'expiry',coalesce(p_capture->>'expiry',''),'serial',coalesce(p_capture->>'serial',''),'raw',coalesce(p_capture->>'raw',''),'deviceId',coalesce(p_capture->>'deviceId',''),'deviceType',upper(coalesce(p_capture->>'deviceType','PC')),'occurredAt',coalesce(p_capture->>'occurredAt','')));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||p_operation_id::text,61023));
 SELECT * INTO v_first FROM public.pharmflow_receiving_transactions_v1 WHERE pharmacy_id=p_pharmacy_id AND transaction_id=v_base;
 IF FOUND THEN
   IF (v_first.payload#>'{quickAdd,request}') IS DISTINCT FROM v_request OR v_first.quantity<>p_quantity
     OR v_first.order_number IS DISTINCT FROM btrim(p_source_order) OR public.pharmflow_receiving_item_code_v1(v_first.item_code)<>v_code
     OR public.pharmflow_identifier_key_v2(v_first.gtin)<>v_key THEN RAISE EXCEPTION 'Quick Add operation already used with different input'; END IF;
   RETURN jsonb_build_object('success',true,'idempotent',true,'pharmacyId',p_pharmacy_id,'operationId',p_operation_id,'receipts',jsonb_build_array(to_jsonb(v_first)));
 END IF;
 -- Scope headers and durable source data establish receiving context, never Master identity.
 PERFORM 1 FROM public.pharmflow_orders WHERE pharmacy_id=p_pharmacy_id AND order_number=ANY(v_scope) ORDER BY order_number FOR SHARE;
 IF EXISTS(SELECT 1 FROM unnest(v_scope) o WHERE NOT EXISTS(SELECT 1 FROM public.pharmflow_orders h WHERE h.pharmacy_id=p_pharmacy_id AND h.order_number=o AND h.status='uploaded')) THEN RAISE EXCEPTION 'Original selected Orders are unavailable'; END IF;
 PERFORM 1 FROM public.pharmflow_order_source_items s WHERE s.pharmacy_id=p_pharmacy_id AND s.order_number=btrim(p_source_order)
   AND public.pharmflow_receiving_item_code_v1(s.item_code)=v_code AND btrim(s.item_name)=btrim(p_item_name);
 IF NOT FOUND THEN RAISE EXCEPTION 'Selected Order row changed or is unavailable; select it again'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||btrim(p_source_order)||'|'||v_code,0));
 SELECT coalesce(sum(s.ordered_qty),0) INTO v_ordered FROM public.pharmflow_order_source_items s WHERE s.pharmacy_id=p_pharmacy_id AND s.order_number=btrim(p_source_order) AND public.pharmflow_receiving_item_code_v1(s.item_code)=v_code;
 SELECT coalesce(sum(t.quantity),0) INTO v_received FROM public.pharmflow_receiving_transactions_v1 t WHERE t.pharmacy_id=p_pharmacy_id AND t.order_number=btrim(p_source_order) AND public.pharmflow_receiving_item_code_v1(t.item_code)=v_code;
 IF NOT coalesce(p_allow_over_receiving,false) AND p_quantity>greatest(0,v_ordered-v_received) THEN RAISE EXCEPTION 'Quantity exceeds the selected Order remaining quantity'; END IF;
 -- All order/quantity validation precedes Master creation. These short administration locks
 -- also serialize legacy Settings writers which do not share the new advisory key.
 LOCK TABLE public.pharmflow_pharmacy_gtin_v1 IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.pharmflow_global_item_identifiers_v2 IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.pharmflow_global_items_v2 IN SHARE ROW EXCLUSIVE MODE;
 SELECT array_agg(x.item_code ORDER BY x.item_code) INTO v_matches FROM
   (SELECT gi.item_code FROM public.pharmflow_global_items_v2 gi WHERE public.pharmflow_receiving_item_code_v1(gi.item_code)=v_code LIMIT 2) x;
 IF cardinality(v_matches)>1 THEN RAISE EXCEPTION 'Canonical Item Code is ambiguous in Global Master; ask a Global Master administrator'; END IF;
 IF coalesce(cardinality(v_matches),0)=0 THEN
   -- Mapping permission is NOT Global item-creation permission.
   IF NOT public.pharmflow_is_reference_master_admin_v1() THEN
     RETURN jsonb_build_object('success',false,'code','GLOBAL_CREATION_PERMISSION_REQUIRED','message','Global Master creation permission required. Save for Review or ask a Global Master administrator.');
   END IF;
   IF public.pharmflow_normalize_main_group_v1(p_group_name) IS NULL THEN RAISE EXCEPTION 'Select one of the approved Groups to create the item'; END IF;
   IF EXISTS(SELECT 1 FROM public.pharmflow_pharmacy_gtin_v1 g WHERE g.pharmacy_id=p_pharmacy_id AND g.identifier_key=v_key) THEN RAISE EXCEPTION 'Identifier is now recognized for this pharmacy. Return to Receiving and scan again.'; END IF;
   -- Reuse the exact Settings contract, including its canonical Group and Global-write checks.
   -- This contract necessarily creates a Global mapping; it is invoked ONLY with Global creation/write permission.
   PERFORM public.create_pharmflow_global_item_v2(p_operation_id,v_code,btrim(p_item_name),p_group_name,NULL,NULL,p_identifier_display,'Receiving Order Quick Add');
   SELECT * INTO v_item FROM public.pharmflow_global_items_v2 WHERE item_code=v_code;
   v_created:=true;
 ELSE
   SELECT * INTO v_item FROM public.pharmflow_global_items_v2 WHERE item_code=v_matches[1];
   -- Existing Master name/Group are authoritative and never overwritten from an Order.
 END IF;
 v_mapping:=public.learn_pharmflow_existing_identifier_v3(p_operation_id,p_pharmacy_id,p_identifier_display,v_item.item_code,'Receiving Order Quick Add');
 v_resolution:=jsonb_build_object('contractVersion',4,'kind',CASE WHEN v_mapping->>'mappingScope'='GLOBAL' THEN 'GLOBAL_LEARNED' ELSE 'PHARMACY_LEARNED' END,
   'mappingId',v_mapping->>'identifierId','mappingRevision',v_mapping->'mappingRevision','identifierDisplay',v_mapping->>'identifierDisplay','identifierKey',v_mapping->>'identifierKey','resolvedItemCode',v_mapping->>'itemCode');
 v_payload:=jsonb_build_object('transactionId',v_base,'orderId',btrim(p_source_order),'selectedOrderNumber',btrim(p_source_order),'itemCode',v_code,'itemName',v_item.item_name,
   'gtin',btrim(p_identifier_display),'quantity',p_quantity,'manual',false,'source','SCANNER','deviceId',coalesce(p_capture->>'deviceId',''),'deviceType',upper(coalesce(p_capture->>'deviceType','PC')),'lot',coalesce(p_capture->>'lot',''),'expiry',coalesce(p_capture->>'expiry',''),'serial',coalesce(p_capture->>'serial',''),
   'gtinResolution',v_resolution,'quickAdd',jsonb_build_object('operationId',p_operation_id,'request',v_request,'masterCreated',v_created));
 SELECT * INTO v_ack FROM public.append_pharmflow_learned_transaction_v4(p_pharmacy_id,v_base,btrim(p_source_order),v_code,v_item.item_name,btrim(p_identifier_display),p_quantity,'SCANNER',coalesce(p_capture->>'deviceId',''),coalesce(nullif(p_capture->>'occurredAt','')::timestamptz,now()),v_payload,
   (v_mapping->>'identifierId')::uuid,(v_mapping->>'mappingRevision')::bigint,v_mapping->>'mappingScope');
 IF v_ack.acknowledged IS DISTINCT FROM true THEN RAISE EXCEPTION 'Quick Add receipt was not acknowledged'; END IF;
 SELECT jsonb_agg(to_jsonb(t)) INTO v_receipts FROM public.pharmflow_receiving_transactions_v1 t WHERE t.pharmacy_id=p_pharmacy_id AND t.transaction_id=v_base;
 RETURN jsonb_build_object('success',true,'idempotent',false,'pharmacyId',p_pharmacy_id,'operationId',p_operation_id,'masterCreated',v_created,'receipts',v_receipts);
 -- Any failure rolls back Master creation, mapping audit and Receiving receipt together.
END $$;
REVOKE ALL ON FUNCTION public.quick_add_pharmflow_order_item_v1(uuid,uuid,text,text[],text,text,text,text,integer,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quick_add_pharmflow_order_item_v1(uuid,uuid,text,text[],text,text,text,text,integer,boolean,jsonb) TO authenticated;

COMMIT;
