-- REVIEW DRAFT ONLY. Preserve the existing intent table, history and receipt trigger.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.pharmflow_needs_review_resolution_intents_v1 ADD COLUMN receiving_request jsonb;
ALTER TABLE public.pharmflow_needs_review_resolution_intents_v1 DROP CONSTRAINT pharmflow_nr_resolution_intents_required_values;
ALTER TABLE public.pharmflow_needs_review_resolution_intents_v1 ADD CONSTRAINT pharmflow_nr_resolution_intents_required_values
 CHECK(btrim(transaction_id)<>'' AND btrim(item_code)<>'' AND resolution_type IN ('LINK_ORDER_ITEM','AUTO_ALLOCATED','ADD_UNORDERED'));

CREATE FUNCTION public.try_finalize_pharmflow_needs_review_resolution_intent_v3(p_intent_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='3s' AS $$
DECLARE
 v_intent public.pharmflow_needs_review_resolution_intents_v1%rowtype;
 v_review public.pharmflow_needs_review_v2%rowtype;
 v_tx public.pharmflow_receiving_transactions_v1%rowtype;
 v_identity jsonb;
 v_alloc jsonb; v_total bigint:=0; v_scope text[];
BEGIN
 -- Read ownership before locking or returning any intent contents. Receipt-trigger callers retain their JWT identity.
 SELECT * INTO v_intent FROM public.pharmflow_needs_review_resolution_intents_v1 WHERE id=p_intent_id;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_pharmacy_member(v_intent.pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy access required'; END IF;
 -- Lock order for new contracts: review, then intent. Legacy intents remain on their original finalizer.
 SELECT * INTO v_review FROM public.pharmflow_needs_review_v2 WHERE id=v_intent.review_id AND pharmacy_id=v_intent.pharmacy_id FOR UPDATE;
 SELECT * INTO v_intent FROM public.pharmflow_needs_review_resolution_intents_v1 WHERE id=p_intent_id FOR UPDATE;
 IF v_intent.receiving_request->>'version' IS DISTINCT FROM '6' THEN RAISE EXCEPTION 'Versioned Receiving intent required'; END IF;
 IF v_intent.status='RESOLVED' THEN RETURN jsonb_build_object('success',true,'status','RESOLVED','allocations',v_intent.allocations,'resolutionType',v_intent.resolution_type,'reviewId',v_intent.review_id); END IF;
 IF v_review.id IS NULL OR v_review.workflow<>'RECEIVING' OR v_review.status<>'PENDING' THEN RAISE EXCEPTION 'Pending Receiving review required'; END IF;
 IF v_intent.status<>'PENDING' THEN RAISE EXCEPTION 'Resolution intent is blocked'; END IF;
 IF v_review.pending_quantity<>(v_intent.receiving_request->>'quantity')::integer THEN RAISE EXCEPTION 'Review quantity changed after resolution request'; END IF;
 v_scope:=coalesce(v_review.work_scope_order_numbers,ARRAY[]::text[]);
 IF cardinality(v_scope)=0 AND v_review.order_number IS NOT NULL THEN v_scope:=ARRAY[v_review.order_number]; END IF;
 IF jsonb_typeof(v_intent.allocations) IS DISTINCT FROM 'array' OR jsonb_array_length(v_intent.allocations)=0 THEN RAISE EXCEPTION 'Invalid intent allocations'; END IF;
 FOR v_alloc IN SELECT value FROM jsonb_array_elements(v_intent.allocations) LOOP
   IF NOT coalesce((v_alloc->>'orderNumber')=ANY(v_scope),false) OR (v_alloc->>'quantity')::integer<=0 THEN RAISE EXCEPTION 'Allocation outside captured scope'; END IF;
   SELECT * INTO v_tx FROM public.pharmflow_receiving_transactions_v1 WHERE pharmacy_id=v_intent.pharmacy_id AND transaction_id=v_alloc->>'transactionId';
   IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'status','PENDING','allocations',v_intent.allocations,'resolutionType',v_intent.resolution_type,'reviewId',v_review.id); END IF;
   IF v_tx.order_number IS DISTINCT FROM v_alloc->>'orderNumber'
     OR public.pharmflow_receiving_item_code_v1(v_tx.item_code)<>public.pharmflow_receiving_item_code_v1(v_intent.item_code)
     OR v_tx.quantity IS DISTINCT FROM (v_alloc->>'quantity')::integer
     OR public.pharmflow_identifier_key_v2(v_tx.gtin) IS DISTINCT FROM v_review.identifier_key
     OR (v_intent.resolution_type='ADD_UNORDERED' AND coalesce(v_tx.payload->>'manual','false')<>'true') THEN RAISE EXCEPTION 'Receiving transaction does not match intent'; END IF;
   v_identity:=public.resolve_pharmflow_identifier_v2(v_intent.pharmacy_id,v_review.identifier_display);
   IF coalesce((v_identity->>'found')::boolean,false) IS NOT TRUE
     OR (v_tx.payload#>>'{gtinResolution,mappingId}') IS DISTINCT FROM (v_identity->>'identifierId')
     OR (v_tx.payload#>>'{gtinResolution,mappingRevision}') IS DISTINCT FROM (v_identity->>'mappingRevision')
     OR (v_tx.payload#>>'{gtinResolution,kind}') IS DISTINCT FROM (CASE WHEN v_identity->>'mappingScope'='GLOBAL' THEN 'GLOBAL_LEARNED' ELSE 'PHARMACY_LEARNED' END)
     OR (v_identity->>'itemCode') IS DISTINCT FROM v_intent.item_code THEN RAISE EXCEPTION 'Review receipt mapping provenance changed or is unavailable'; END IF;
   v_total:=v_total+v_tx.quantity;
 END LOOP;
 IF v_total<>v_review.pending_quantity THEN RAISE EXCEPTION 'Receipt quantity does not equal review quantity'; END IF;
 UPDATE public.pharmflow_needs_review_v2 SET status='RESOLVED',resolved_item_code=v_intent.item_code,resolved_item_name=v_intent.item_name,
   resolution_type=v_intent.resolution_type,resolution_transaction_id=v_intent.transaction_id,resolved_by=v_intent.requested_by,
   resolved_at=now(),updated_at=now(),resolution_block_code=NULL,resolution_block_detail=NULL WHERE id=v_review.id AND pharmacy_id=v_intent.pharmacy_id;
 UPDATE public.pharmflow_needs_review_resolution_intents_v1 SET status='RESOLVED',resolved_at=now(),last_checked_at=now(),updated_at=now() WHERE id=v_intent.id;
 RETURN jsonb_build_object('success',true,'status','RESOLVED','allocations',v_intent.allocations,'resolutionType',v_intent.resolution_type,'reviewId',v_review.id);
END $$;
REVOKE ALL ON FUNCTION public.try_finalize_pharmflow_needs_review_resolution_intent_v3(uuid) FROM PUBLIC,anon,authenticated;
-- Internal helper only: invoked by SECURITY DEFINER request/receipt dispatchers, never directly exposed.

CREATE FUNCTION public.request_pharmflow_needs_review_resolution_v6(
 p_operation_id uuid,p_pharmacy_id uuid,p_review_id uuid,p_item_code text,p_expected_quantity integer,
 p_target_order text DEFAULT NULL,p_allow_over_receiving boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='3s' AS $$
DECLARE
 v_review public.pharmflow_needs_review_v2%rowtype; v_intent public.pharmflow_needs_review_resolution_intents_v1%rowtype;
 v_item public.pharmflow_global_items_v2%rowtype;
 v_scope text[]; v_request jsonb; v_plan jsonb:='[]'::jsonb; v_alloc jsonb; v_request_id uuid;
 v_target text:=nullif(btrim(p_target_order),'');v_mode text;v_order text;v_candidates text[];
 v_left integer;v_take integer;v_ordered numeric;v_received bigint;v_reserved bigint;v_base text;v_index integer;v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy ADMIN access required'; END IF;
 IF p_operation_id IS NULL OR p_review_id IS NULL OR coalesce(p_expected_quantity,0)<1 THEN RAISE EXCEPTION 'Operation, review and positive expected quantity required'; END IF;
 SELECT * INTO v_item FROM public.pharmflow_global_items_v2 WHERE item_code=btrim(p_item_code) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Existing Global Master item required'; END IF;
 SELECT * INTO v_review FROM public.pharmflow_needs_review_v2 WHERE id=p_review_id AND pharmacy_id=p_pharmacy_id FOR UPDATE;
 IF NOT FOUND OR v_review.workflow<>'RECEIVING' THEN RAISE EXCEPTION 'Receiving review unavailable'; END IF;
 v_request:=jsonb_build_object('version',6,'itemCode',v_item.item_code,'quantity',p_expected_quantity,'targetOrder',v_target,'allowOverReceiving',coalesce(p_allow_over_receiving,false));
 SELECT review_id INTO v_request_id FROM public.pharmflow_needs_review_resolution_intents_v1 WHERE operation_id=p_operation_id;
 IF FOUND AND v_request_id<>p_review_id THEN RAISE EXCEPTION 'Operation ID reused for another review'; END IF;
 SELECT * INTO v_intent FROM public.pharmflow_needs_review_resolution_intents_v1 WHERE pharmacy_id=p_pharmacy_id AND review_id=p_review_id FOR UPDATE;
 IF FOUND THEN
   IF v_intent.receiving_request IS NULL THEN RAISE EXCEPTION 'Legacy resolution already in progress; allow its existing receipts to synchronize'; END IF;
   IF v_intent.receiving_request IS DISTINCT FROM v_request THEN RAISE EXCEPTION 'A different resolution was already requested'; END IF;
   -- Never replan against quantities changed by a partial previous receipt or a concurrent PC.
   RETURN public.try_finalize_pharmflow_needs_review_resolution_intent_v3(v_intent.id);
 END IF;
 IF v_review.status<>'PENDING' OR v_review.pending_quantity<>p_expected_quantity THEN RAISE EXCEPTION 'Pending quantity/status changed; refresh review'; END IF;
 v_scope:=coalesce(v_review.work_scope_order_numbers,ARRAY[]::text[]);
 IF cardinality(v_scope)=0 AND v_review.order_number IS NOT NULL THEN v_scope:=ARRAY[v_review.order_number]; END IF;
 IF cardinality(v_scope)=0 THEN RAISE EXCEPTION 'Original order scope unavailable'; END IF;
 -- Lock all captured order headers in deterministic order against concurrent finalization.
 PERFORM 1 FROM public.pharmflow_orders WHERE pharmacy_id=p_pharmacy_id AND order_number=ANY(v_scope) ORDER BY order_number FOR SHARE;
 IF EXISTS(SELECT 1 FROM unnest(v_scope) s WHERE NOT EXISTS(SELECT 1 FROM public.pharmflow_orders o WHERE o.pharmacy_id=p_pharmacy_id AND o.order_number=s AND o.status='uploaded')) THEN RAISE EXCEPTION 'Original order scope is no longer available'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(v_scope) o WHERE NOT EXISTS(SELECT 1 FROM public.pharmflow_order_source_items s WHERE s.pharmacy_id=p_pharmacy_id AND s.order_number=o)) THEN RAISE EXCEPTION 'Durable source rows unavailable for captured Order; cannot classify an Extra Item safely'; END IF;
 SELECT coalesce(array_agg(DISTINCT s.order_number ORDER BY s.order_number),ARRAY[]::text[]) INTO v_candidates
 FROM public.pharmflow_order_source_items s WHERE s.pharmacy_id=p_pharmacy_id AND s.order_number=ANY(v_scope)
 AND public.pharmflow_receiving_item_code_v1(s.item_code)=public.pharmflow_receiving_item_code_v1(v_item.item_code);
 v_base:='NEEDS_REVIEW_V2:'||p_review_id::text; v_left:=p_expected_quantity;
 IF cardinality(v_candidates)=0 THEN
   IF v_target IS NULL OR NOT coalesce(v_target=ANY(v_scope),false) THEN RAISE EXCEPTION 'Explicit Target Order inside captured scope required for Extra Item'; END IF;
   v_mode:='ADD_UNORDERED';v_plan:=jsonb_build_array(jsonb_build_object('orderNumber',v_target,'quantity',v_left,'transactionId',v_base));
 ELSE
   IF v_target IS NOT NULL THEN RAISE EXCEPTION 'In-order item cannot be silently redirected as an Extra Item'; END IF;
   v_mode:='AUTO_ALLOCATED';
   FOREACH v_order IN ARRAY v_candidates LOOP
     PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||v_order||'|'||public.pharmflow_receiving_item_code_v1(v_item.item_code),0));
     SELECT coalesce(sum(s.ordered_qty),0) INTO v_ordered FROM public.pharmflow_order_source_items s WHERE s.pharmacy_id=p_pharmacy_id AND s.order_number=v_order AND public.pharmflow_receiving_item_code_v1(s.item_code)=public.pharmflow_receiving_item_code_v1(v_item.item_code);
     SELECT coalesce(sum(t.quantity),0) INTO v_received FROM public.pharmflow_receiving_transactions_v1 t WHERE t.pharmacy_id=p_pharmacy_id AND t.order_number=v_order AND public.pharmflow_receiving_item_code_v1(t.item_code)=public.pharmflow_receiving_item_code_v1(v_item.item_code);
     SELECT coalesce(sum((a->>'quantity')::integer),0) INTO v_reserved
       FROM public.pharmflow_needs_review_resolution_intents_v1 i
       CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.allocations)='array' THEN i.allocations ELSE '[]'::jsonb END) a
       WHERE i.pharmacy_id=p_pharmacy_id AND i.status='PENDING'
         AND EXISTS(SELECT 1 FROM public.pharmflow_needs_review_v2 r WHERE r.id=i.review_id AND r.pharmacy_id=p_pharmacy_id AND r.status='PENDING')
         AND public.pharmflow_receiving_item_code_v1(i.item_code)=public.pharmflow_receiving_item_code_v1(v_item.item_code)
         AND a->>'orderNumber'=v_order
         AND NOT EXISTS(SELECT 1 FROM public.pharmflow_receiving_transactions_v1 t WHERE t.pharmacy_id=p_pharmacy_id AND t.transaction_id=a->>'transactionId');
     v_take:=least(v_left,greatest(0,floor(v_ordered-v_received-v_reserved))::integer);
     IF v_take>0 THEN v_plan:=v_plan||jsonb_build_array(jsonb_build_object('orderNumber',v_order,'quantity',v_take));v_left:=v_left-v_take; END IF;
   END LOOP;
   IF v_left>0 THEN
     IF NOT coalesce(p_allow_over_receiving,false) THEN RAISE EXCEPTION 'Quantity exceeds remaining captured Orders'; END IF;
     v_order:=v_candidates[cardinality(v_candidates)];
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_plan) a WHERE a->>'orderNumber'=v_order) THEN
       SELECT jsonb_agg(CASE WHEN a->>'orderNumber'=v_order THEN jsonb_set(a,'{quantity}',to_jsonb((a->>'quantity')::integer+v_left)) ELSE a END ORDER BY ord) INTO v_plan FROM jsonb_array_elements(v_plan) WITH ORDINALITY x(a,ord);
     ELSE v_plan:=v_plan||jsonb_build_array(jsonb_build_object('orderNumber',v_order,'quantity',v_left)); END IF;
   END IF;
   v_count:=jsonb_array_length(v_plan);
   SELECT jsonb_agg(a||jsonb_build_object('transactionId',CASE WHEN v_count=1 THEN v_base ELSE v_base||':A'||ord::text END) ORDER BY ord) INTO v_plan FROM jsonb_array_elements(v_plan) WITH ORDINALITY x(a,ord);
 END IF;
 INSERT INTO public.pharmflow_needs_review_resolution_intents_v1(operation_id,pharmacy_id,review_id,transaction_id,item_code,item_name,resolution_type,requested_by,allocations,receiving_request)
 VALUES(p_operation_id,p_pharmacy_id,p_review_id,v_base,v_item.item_code,v_item.item_name,v_mode,auth.uid(),v_plan,v_request) RETURNING * INTO v_intent;
 RETURN public.try_finalize_pharmflow_needs_review_resolution_intent_v3(v_intent.id);
END $$;
REVOKE ALL ON FUNCTION public.request_pharmflow_needs_review_resolution_v6(uuid,uuid,uuid,text,integer,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_pharmflow_needs_review_resolution_v6(uuid,uuid,uuid,text,integer,text,boolean) TO authenticated;

-- Existing signature, owner and grants retained; legacy body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.try_finalize_pharmflow_needs_review_resolution_intent_v1(p_intent_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_intent public.pharmflow_needs_review_resolution_intents_v1%rowtype;
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_transaction public.pharmflow_receiving_transactions_v1%rowtype;
  v_order_status text;
begin
  -- Route new contracts before legacy locking/authorization paths. The v3 helper verifies caller pharmacy membership.
  if exists(select 1 from public.pharmflow_needs_review_resolution_intents_v1 where id=p_intent_id and receiving_request->>'version'='6') then
    return public.try_finalize_pharmflow_needs_review_resolution_intent_v3(p_intent_id);
  end if;
  select * into v_intent from public.pharmflow_needs_review_resolution_intents_v1 where id=p_intent_id for update;
  if v_intent.id is null then raise exception 'Resolution intent is unavailable'; end if;
  if v_intent.status='RESOLVED' then
    return jsonb_build_object('success',true,'status','RESOLVED','reviewId',v_intent.review_id,'transactionId',v_intent.transaction_id,'idempotent',true);
  end if;
  if v_intent.status='BLOCKED' then
    return jsonb_build_object('success',false,'status','BLOCKED','code',v_intent.blocked_code,'detail',v_intent.blocked_detail);
  end if;

  select * into v_review from public.pharmflow_needs_review_v2 where id=v_intent.review_id and pharmacy_id=v_intent.pharmacy_id for update;
  if v_review.id is null or v_review.status<>'PENDING' then
    update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='REVIEW_NOT_PENDING',blocked_detail='Needs Review case is unavailable or no longer pending.',updated_at=now() where id=v_intent.id;
    return jsonb_build_object('success',false,'status','BLOCKED','code','REVIEW_NOT_PENDING');
  end if;

  select status into v_order_status from public.pharmflow_orders where pharmacy_id=v_intent.pharmacy_id and order_number=v_review.order_number;
  if v_order_status is distinct from 'uploaded' then
    update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='ORIGINAL_ORDER_UNAVAILABLE',blocked_detail='Original order is finalized, inactive, or unavailable.',updated_at=now() where id=v_intent.id;
    update public.pharmflow_needs_review_v2 set resolution_block_code='ORIGINAL_ORDER_UNAVAILABLE',resolution_block_detail='The original order is finalized, inactive, or unavailable.',updated_at=now() where id=v_review.id;
    return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE');
  end if;

  select * into v_transaction from public.pharmflow_receiving_transactions_v1 where pharmacy_id=v_intent.pharmacy_id and transaction_id=v_intent.transaction_id for update;
  if v_transaction.transaction_id is null then
    update public.pharmflow_needs_review_resolution_intents_v1 set last_checked_at=now(),updated_at=now() where id=v_intent.id;
    return jsonb_build_object('success',false,'status','PENDING','code','RECEIVING_TRANSACTION_PENDING','reviewId',v_review.id,'transactionId',v_intent.transaction_id);
  end if;

  if coalesce(v_transaction.order_number,'')<>coalesce(v_review.order_number,'')
     or v_transaction.item_code<>v_intent.item_code
     or v_transaction.quantity<=0
     or public.pharmflow_identifier_key_v2(v_transaction.gtin)<>v_review.identifier_key then
    update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='RECEIVING_TRANSACTION_MISMATCH',blocked_detail='Receiving transaction does not match the review pharmacy, original order, item, or identifier.',updated_at=now() where id=v_intent.id;
    update public.pharmflow_needs_review_v2 set resolution_block_code='RECEIVING_TRANSACTION_MISMATCH',resolution_block_detail='The requested transaction cannot resolve this case.',updated_at=now() where id=v_review.id;
    return jsonb_build_object('success',false,'status','BLOCKED','code','RECEIVING_TRANSACTION_MISMATCH');
  end if;

  update public.pharmflow_needs_review_v2 set status='RESOLVED',resolved_item_code=v_intent.item_code,resolved_item_name=v_intent.item_name,resolution_type=v_intent.resolution_type,resolution_transaction_id=v_intent.transaction_id,resolved_by=v_intent.requested_by,resolved_at=now(),resolution_block_code=null,resolution_block_detail=null,updated_at=now() where id=v_review.id and status='PENDING';
  update public.pharmflow_needs_review_resolution_intents_v1 set status='RESOLVED',resolved_at=now(),last_checked_at=now(),updated_at=now() where id=v_intent.id;
  return jsonb_build_object('success',true,'status','RESOLVED','reviewId',v_review.id,'transactionId',v_intent.transaction_id);
end $function$;


-- Existing signature, owner and grants retained; legacy body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.try_finalize_pharmflow_needs_review_resolution_intent_v2(p_intent_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_intent public.pharmflow_needs_review_resolution_intents_v1%rowtype;
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_alloc jsonb; v_tx public.pharmflow_receiving_transactions_v1%rowtype;
  v_expected_total integer:=0; v_found_total integer:=0;
begin
  -- Route new contracts before legacy locking/authorization paths. The v3 helper verifies caller pharmacy membership.
  if exists(select 1 from public.pharmflow_needs_review_resolution_intents_v1 where id=p_intent_id and receiving_request->>'version'='6') then
    return public.try_finalize_pharmflow_needs_review_resolution_intent_v3(p_intent_id);
  end if;
  select * into v_intent from public.pharmflow_needs_review_resolution_intents_v1 where id=p_intent_id for update;
  if v_intent.id is null then raise exception 'Resolution intent is unavailable'; end if;
  if v_intent.status='RESOLVED' then return jsonb_build_object('success',true,'status','RESOLVED','reviewId',v_intent.review_id,'transactionId',v_intent.transaction_id,'idempotent',true); end if;
  if v_intent.status='BLOCKED' then return jsonb_build_object('success',false,'status','BLOCKED','code',v_intent.blocked_code,'detail',v_intent.blocked_detail); end if;
  select * into v_review from public.pharmflow_needs_review_v2 where id=v_intent.review_id and pharmacy_id=v_intent.pharmacy_id for update;
  if v_review.id is null or v_review.status<>'PENDING' then
    update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='REVIEW_NOT_PENDING',blocked_detail='Needs Review case is unavailable or no longer pending.',updated_at=now() where id=v_intent.id;
    return jsonb_build_object('success',false,'status','BLOCKED','code','REVIEW_NOT_PENDING');
  end if;
  if jsonb_typeof(v_intent.allocations)<>'array' or jsonb_array_length(v_intent.allocations)=0 then return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(p_intent_id); end if;
  for v_alloc in select value from jsonb_array_elements(v_intent.allocations) loop
    if btrim(coalesce(v_alloc->>'transactionId',''))='' or btrim(coalesce(v_alloc->>'orderNumber',''))='' or coalesce((v_alloc->>'quantity')::integer,0)<=0 then raise exception 'Invalid Needs Review allocation'; end if;
    v_expected_total:=v_expected_total+(v_alloc->>'quantity')::integer;
    select * into v_tx from public.pharmflow_receiving_transactions_v1 where pharmacy_id=v_intent.pharmacy_id and transaction_id=v_alloc->>'transactionId' for update;
    if v_tx.transaction_id is null then
      update public.pharmflow_needs_review_resolution_intents_v1 set last_checked_at=now(),updated_at=now() where id=v_intent.id;
      return jsonb_build_object('success',false,'status','PENDING','code','RECEIVING_TRANSACTION_PENDING','reviewId',v_review.id,'transactionId',v_intent.transaction_id);
    end if;
    if coalesce(v_tx.order_number,'')<>coalesce(v_alloc->>'orderNumber','') or v_tx.item_code<>v_intent.item_code or v_tx.quantity<>(v_alloc->>'quantity')::integer or public.pharmflow_identifier_key_v2(v_tx.gtin)<>v_review.identifier_key then
      update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='RECEIVING_TRANSACTION_MISMATCH',blocked_detail='An allocated Receiving transaction does not match the review item, identifier, order, or quantity.',updated_at=now() where id=v_intent.id;
      update public.pharmflow_needs_review_v2 set resolution_block_code='RECEIVING_TRANSACTION_MISMATCH',resolution_block_detail='The allocated Receiving transactions cannot resolve this case.',updated_at=now() where id=v_review.id;
      return jsonb_build_object('success',false,'status','BLOCKED','code','RECEIVING_TRANSACTION_MISMATCH');
    end if;
    v_found_total:=v_found_total+v_tx.quantity;
  end loop;
  if v_expected_total<>v_review.pending_quantity or v_found_total<>v_review.pending_quantity then
    update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='ALLOCATION_QUANTITY_MISMATCH',blocked_detail='Allocated quantity does not equal the pending review quantity.',updated_at=now() where id=v_intent.id;
    return jsonb_build_object('success',false,'status','BLOCKED','code','ALLOCATION_QUANTITY_MISMATCH');
  end if;
  update public.pharmflow_needs_review_v2 set status='RESOLVED',resolved_item_code=v_intent.item_code,resolved_item_name=v_intent.item_name,resolution_type='AUTO_ALLOCATED',resolution_transaction_id=v_intent.transaction_id,resolved_by=v_intent.requested_by,resolved_at=now(),resolution_block_code=null,resolution_block_detail=null,updated_at=now() where id=v_review.id and status='PENDING';
  update public.pharmflow_needs_review_resolution_intents_v1 set status='RESOLVED',resolution_type='AUTO_ALLOCATED',resolved_at=now(),last_checked_at=now(),updated_at=now() where id=v_intent.id;
  return jsonb_build_object('success',true,'status','RESOLVED','reviewId',v_review.id,'transactionId',v_intent.transaction_id,'allocations',v_intent.allocations);
end $function$;


COMMIT;
