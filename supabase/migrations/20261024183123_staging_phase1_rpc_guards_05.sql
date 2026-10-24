CREATE OR REPLACE FUNCTION public.add_pharmflow_pharmacy_identifier_v2(p_operation_id uuid, p_pharmacy_id uuid, p_identifier_display text, p_item_code text, p_item_name text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_display text:=btrim(coalesce(p_identifier_display,''));
 v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
 v_code text:=btrim(coalesce(p_item_code,''));
 v_name text:=btrim(coalesce(p_item_name,''));
 v_reason text:=btrim(coalesce(p_reason,''));
 v_request jsonb; v_result jsonb;
 v_audit public.pharmflow_pharmacy_identifier_mapping_audit_v2%rowtype;
 v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
 v_global public.pharmflow_global_item_identifiers_v2%rowtype;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'add_pharmflow_pharmacy_identifier_v2',p_operation_id::text);

 if auth.uid() is null or not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then
  raise exception 'Pharmacy ADMIN access is required';
 end if;
 if p_operation_id is null or v_display='' or v_key='' or v_code='' or v_name='' or v_reason='' then
  raise exception 'Operation, identifier, Item Code, Item Name and reason are required';
 end if;
 v_request:=jsonb_build_object('scope','PHARMACY','action','ADD','pharmacyId',p_pharmacy_id,
  'actor',auth.uid(),'identifierDisplay',v_display,'identifierKey',v_key,
  'itemCode',v_code,'itemName',v_name,'reason',v_reason);
 -- Same key lock order as Expiry resolution and Settings Correct/Remove.
 perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
 perform pg_advisory_xact_lock(hashtextextended(v_key,1153));
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||':'||v_key,1156));
 perform pg_advisory_xact_lock(hashtextextended('PHARMACY:'||p_pharmacy_id::text||':'||p_operation_id::text,1168));
 select * into v_audit from public.pharmflow_pharmacy_identifier_mapping_audit_v2
 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if found then
  if v_audit.management_request is distinct from v_request then
   raise exception 'Operation ID was already used with different mapping input';
  end if;
  return v_audit.result;
 end if;
 select * into v_global from public.pharmflow_global_item_identifiers_v2
 where identifier_key=v_key for share;
 if found then
  if v_global.item_code<>v_code then
   raise exception 'Identifier conflict: Global Master already mapped this identifier to Item Code %',v_global.item_code;
  end if;
  raise exception 'Barcode already linked to this item in Global Master';
 end if;
 select * into v_mapping from public.pharmflow_pharmacy_gtin_v1
 where pharmacy_id=p_pharmacy_id and identifier_key=v_key for update;
 if found then
  if v_mapping.item_code<>v_code then
   raise exception 'Identifier conflict: this pharmacy already mapped this identifier to Item Code %',v_mapping.item_code;
  end if;
  raise exception 'Barcode already linked to this item';
 end if;
 insert into public.pharmflow_pharmacy_gtin_v1(
  pharmacy_id,gtin,identifier_display,identifier_key,item_code,item_name,source,created_by,updated_by)
 values(p_pharmacy_id,v_display,v_display,v_key,v_code,v_name,'PHARMACY_LEARNED',auth.uid(),auth.uid())
 returning * into v_mapping;
 v_result:=jsonb_build_object('success',true,'scope','PHARMACY','action','ADD',
  'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,
  'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,
  'itemCode',v_mapping.item_code,'itemName',v_mapping.item_name);
 insert into public.pharmflow_pharmacy_identifier_mapping_audit_v2(
  pharmacy_id,operation_id,action,identifier_display,identifier_key,mapping_id,
  new_item_code,reason,result,performed_by,management_request)
 values(p_pharmacy_id,p_operation_id,'ADD',v_display,v_key,v_mapping.id,
  v_code,v_reason,v_result,auth.uid(),v_request);
 return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.rename_pharmacy_expiry_worker(p_pharmacy_id uuid, p_worker_id uuid, p_worker_name text, p_expected_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare w public.pharmflow_expiry_workers_v1%rowtype;n text:=btrim(p_worker_name);old_name text;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'rename_pharmacy_expiry_worker',NULL);

 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true or public.is_pharmacy_admin(p_pharmacy_id) is not true then raise exception 'Pharmacy administrator required';end if;
 if n is null or length(n)<2 or length(n)>60 or n~'[[:cntrl:]]' then raise exception 'Enter an Operator name of 2 to 60 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-operators/'||p_pharmacy_id::text,0));
 select * into w from public.pharmflow_expiry_workers_v1 where id=p_worker_id and pharmacy_id=p_pharmacy_id for update;
 if not found or not w.active then raise exception 'Active pharmacy Operator required';end if;
 if w.worker_name=n then return to_jsonb(w);end if;
 if w.worker_name is distinct from p_expected_name then raise exception 'Operator changed; reload Settings';end if;
 if exists(select 1 from public.pharmflow_expiry_workers_v1 where pharmacy_id=p_pharmacy_id and id<>p_worker_id and lower(btrim(worker_name))=lower(n)) then raise exception 'Operator name already exists';end if;
 old_name:=w.worker_name;
 update public.pharmflow_expiry_workers_v1 set worker_name=n,updated_at=now() where id=w.id returning * into w;
 insert into pharmflow_expiry_private.operator_audit_v1(pharmacy_id,worker_id,actor,action,previous_name,name) values(p_pharmacy_id,w.id,auth.uid(),'RENAME',old_name,n);
 return to_jsonb(w);
end $function$;

CREATE OR REPLACE FUNCTION public.deactivate_pharmacy_expiry_worker(p_pharmacy_id uuid, p_worker_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare w public.pharmflow_expiry_workers_v1%rowtype;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'deactivate_pharmacy_expiry_worker',NULL);

 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true or public.is_pharmacy_admin(p_pharmacy_id) is not true then raise exception 'Pharmacy administrator required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-operators/'||p_pharmacy_id::text,0));
 select * into w from public.pharmflow_expiry_workers_v1 where id=p_worker_id and pharmacy_id=p_pharmacy_id for update;
 if not found then raise exception 'Pharmacy Operator unavailable';end if;
 if not w.active then return to_jsonb(w);end if;
 update public.pharmflow_expiry_workers_v1 set active=false,updated_at=now() where id=w.id returning * into w;
 insert into pharmflow_expiry_private.operator_audit_v1(pharmacy_id,worker_id,actor,action,name) values(p_pharmacy_id,w.id,auth.uid(),'DEACTIVATE',w.worker_name);
 return to_jsonb(w);
end $function$;

CREATE OR REPLACE FUNCTION public.query_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_filters jsonb DEFAULT '{}'::jsonb, p_resolved boolean DEFAULT false, p_sort text DEFAULT 'ADDED'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare result jsonb; filters jsonb:=coalesce(p_filters,'{}'::jsonb);
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'query_pharmflow_expiry_inventory_v1',NULL);

  perform pharmflow_expiry_private.valid_auth_session();
  if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required'; end if;
  if p_filters is null or p_resolved is null or p_sort is null or p_offset is null or p_limit is null
     or p_limit not between 1 and 250 or p_offset<0 or jsonb_typeof(filters)<>'object'
     or p_sort not in ('ADDED','UPDATED','EXPIRY')
     or (filters ? 'groups' and jsonb_typeof(filters->'groups')<>'array')
     or (filters ? 'departments' and jsonb_typeof(filters->'departments')<>'array')
     or (filters ? 'operators' and (jsonb_typeof(filters->'operators')<>'array' or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(filters->'operators')='array' then filters->'operators' else '[]'::jsonb end) v where jsonb_typeof(v)<>'string')))
     or (filters ? 'months' and jsonb_typeof(filters->'months')<>'array')
     or (filters ? 'include_unassigned' and jsonb_typeof(filters->'include_unassigned')<>'boolean') then
    raise exception 'Invalid inventory query';
  end if;
  with rows as materialized (
    select * from pharmflow_expiry_private.inventory_rows_group_v1(p_pharmacy_id,p_resolved)
  ), matching as materialized (
    select * from rows r where pharmflow_expiry_private.inventory_match_v1(case when coalesce(jsonb_array_length(filters->'operators'),0)>0 then pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(r)) else to_jsonb(r) end,filters)
  ), page as (
    select * from matching order by
      case when p_sort='EXPIRY' then expiry_year*12+expiry_month end asc,
      case when p_sort='UPDATED' or p_resolved then updated_at end desc,
      case when p_sort='ADDED' and not p_resolved then added_at end desc,row_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(p))) from page p),'[]'::jsonb),
    'count',(select count(*) from matching),
    'units',(select coalesce(sum(quantity),0) from matching),
    'departments',(select coalesce(jsonb_agg(d order by d),'[]'::jsonb) from (select distinct department d from rows) v),
    'groups',jsonb_build_array('Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement'),
    'has_unassigned_group',(select exists(select 1 from rows where group_name is null)),
    'operators',(select coalesce(jsonb_agg(v.name order by v.name),'[]'::jsonb) from (select distinct f.operator_name name from rows r join pharmflow_expiry_private.first_operator_v1 f on f.state_id=r.state_id and f.pharmacy_id=p_pharmacy_id where nullif(btrim(f.operator_name),'') is not null) v),
    'months',(select coalesce(jsonb_agg(m order by m),'[]'::jsonb) from (select distinct expiry_year::text||'-'||lpad(expiry_month::text,2,'0') m from rows) v)
  ) into result;
  return result;
end
$function$;

CREATE OR REPLACE FUNCTION public.quick_add_pharmflow_order_item_v1(p_operation_id uuid, p_pharmacy_id uuid, p_source_order text, p_work_scope_order_numbers text[], p_item_code text, p_item_name text, p_group_name text, p_identifier_display text, p_quantity integer, p_allow_over_receiving boolean DEFAULT false, p_capture jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
 v_scope text[];v_request jsonb;v_base text:='QUICK_ADD_V1:'||p_operation_id::text;
 v_first public.pharmflow_receiving_transactions_v1%rowtype;
 v_item public.pharmflow_global_items_v2%rowtype;
 v_mapping jsonb;v_resolution jsonb;v_payload jsonb;v_ack record;v_receipts jsonb;
 v_matches text[];v_created boolean:=false;v_ordered numeric;v_received bigint;
 v_code text:=public.pharmflow_receiving_item_code_v1(p_item_code);
 v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'quick_add_pharmflow_order_item_v1',p_operation_id::text);
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'quick_add_pharmflow_order_item_v1',p_operation_id::text);

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
END $function$;

CREATE OR REPLACE FUNCTION public.append_pharmflow_receiving_action_v4(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb)
 RETURNS TABLE(acknowledged boolean, inserted boolean, authoritative_received bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_existing public.pharmflow_receiving_transactions_v1%rowtype;
  v_inserted boolean:=false;
  v_intent_id uuid;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'append_pharmflow_receiving_action_v4',NULL);

 if auth.uid() is null or not public.pharmflow_receiving_member_v2(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
 if nullif(trim(coalesce(p_transaction_id,'')),'') is null then raise exception 'Transaction ID required';end if;
 if nullif(trim(coalesce(p_item_code,'')),'') is null then raise exception 'Item Code required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||coalesce(trim(p_order_number),'')||'|'||trim(p_item_code),0));
 select * into v_existing from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and transaction_id=trim(p_transaction_id);
 if found then
  if coalesce(v_existing.order_number,'')<>coalesce(nullif(trim(coalesce(p_order_number,'')),''),'') or v_existing.item_code<>trim(p_item_code) or v_existing.quantity<>coalesce(p_quantity,0) or coalesce(v_existing.gtin,'')<>coalesce(p_gtin,'') then raise exception 'Transaction ID content mismatch';end if;
 else
  insert into public.pharmflow_receiving_transactions_v1(pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload,created_by)
  values(p_pharmacy_id,trim(p_transaction_id),nullif(trim(coalesce(p_order_number,'')),''),trim(p_item_code),coalesce(p_item_name,''),coalesce(p_gtin,''),coalesce(p_quantity,0),coalesce(p_source,'RECEIVING'),coalesce(p_device_id,''),coalesce(p_occurred_at,now()),coalesce(p_payload,'{}'::jsonb),auth.uid());
  v_inserted:=true;
 end if;
 for v_intent_id in select id from public.pharmflow_needs_review_resolution_intents_v1 where pharmacy_id=p_pharmacy_id and transaction_id=trim(p_transaction_id) and status='PENDING' loop
   begin
     perform public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_intent_id);
   exception when others then
     begin
       update public.pharmflow_needs_review_resolution_intents_v1 set helper_failure_code=SQLSTATE,helper_failure_detail=SQLERRM,helper_failure_at=now(),helper_failure_count=helper_failure_count+1,updated_at=now() where id=v_intent_id and status='PENDING';
     exception when others then
       raise warning 'Needs Review intent helper failed after Receiving receipt %, and failure state could not be recorded: %',trim(p_transaction_id),SQLERRM;
     end;
     raise warning 'Needs Review intent helper failed after Receiving receipt %: %',trim(p_transaction_id),SQLERRM;
   end;
 end loop;
 return query select true,v_inserted,coalesce(sum(t.quantity),0)::bigint from public.pharmflow_receiving_transactions_v1 t where t.pharmacy_id=p_pharmacy_id and t.item_code=trim(p_item_code) and coalesce(t.order_number,'')=coalesce(nullif(trim(coalesce(p_order_number,'')),''),'');
end $function$;

CREATE OR REPLACE FUNCTION public.learn_pharmflow_existing_identifier_v3(p_operation_id uuid, p_pharmacy_id uuid, p_identifier_display text, p_item_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
 v_code text:=btrim(coalesce(p_item_code,''));
 v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
 v_local public.pharmflow_pharmacy_gtin_v1%rowtype;
 v_global public.pharmflow_global_item_identifiers_v2%rowtype;
 v_item public.pharmflow_global_items_v2%rowtype;
 v_result jsonb; v_audit record; v_completed_operation boolean:=false;
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'learn_pharmflow_existing_identifier_v3',p_operation_id::text);

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
END $function$;

CREATE OR REPLACE FUNCTION public.create_pharmflow_needs_review_v6(p_operation_id text, p_pharmacy_id uuid, p_workflow text, p_identifier_display text, p_raw_barcode text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_review_reason text DEFAULT 'UNKNOWN_GTIN'::text, p_master_item_code_hint text DEFAULT NULL::text, p_master_item_name_hint text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_device_id text DEFAULT NULL::text, p_work_scope_order_numbers text[] DEFAULT NULL::text[], p_pending_quantity integer DEFAULT 1)
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '3s'
AS $function$
declare v_operation text:=nullif(btrim(coalesce(p_operation_id,'')),'');v_display text:=btrim(coalesce(p_identifier_display,''));v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);v_order text:=nullif(btrim(coalesce(p_order_number,'')),'');v_scope text[];v_id uuid;v_time timestamptz;v_qty integer;v_status text;v_request jsonb;v_existing_request jsonb;v_actor uuid;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),true,'create_pharmflow_needs_review_v6',p_operation_id::text);

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
 if v_operation is null then raise exception 'Operation ID is required';end if;
 if v_key='' then raise exception 'Identifier is required';end if;
 if upper(trim(coalesce(p_workflow,'RECEIVING')))<>'RECEIVING' then raise exception 'Invalid workflow';end if;
 if upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))) not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason';end if;
 if upper(btrim(coalesce(p_source,'HANDHELD'))) not in ('HANDHELD','PC') then raise exception 'Invalid source';end if;

 select coalesce(array_agg(distinct btrim(x) order by btrim(x)),array[]::text[]) into v_scope from unnest(coalesce(p_work_scope_order_numbers,array[]::text[])) x where btrim(coalesce(x,''))<>'';
 if v_order is not null and not(v_order=any(v_scope)) then v_scope:=array_append(v_scope,v_order);end if;
 if coalesce(array_length(v_scope,1),0)=0 then raise exception 'Receiving work scope is required';end if;
 if v_order is null and array_length(v_scope,1)=1 then v_order:=v_scope[1];end if;


 IF p_pending_quantity IS NULL OR p_pending_quantity<1 THEN RAISE EXCEPTION 'Positive integer quantity required'; END IF;
 v_request:=jsonb_build_object('workflow','RECEIVING','identifierDisplay',v_display,'rawBarcode',coalesce(p_raw_barcode,''),
   'sessionId',btrim(coalesce(p_session_id,'')),'orderNumber',v_order,'orderName',btrim(coalesce(p_order_name,'')),
   'reason',upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),'itemCodeHint',btrim(coalesce(p_master_item_code_hint,'')),
   'itemNameHint',btrim(coalesce(p_master_item_name_hint,'')),'source',upper(btrim(coalesce(p_source,'HANDHELD'))),
   'deviceId',btrim(coalesce(p_device_id,'')),'scope',to_jsonb(v_scope),'quantity',p_pending_quantity);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||v_operation,61021));
 SELECT r.id,r.pending_quantity,r.created_at,r.status,r.receiving_capture_request,r.created_by
 INTO v_id,v_qty,v_time,v_status,v_existing_request,v_actor FROM public.pharmflow_needs_review_v2 r
 WHERE r.pharmacy_id=p_pharmacy_id AND r.operation_id=v_operation FOR UPDATE;
 IF FOUND THEN
   IF v_existing_request IS DISTINCT FROM v_request OR v_actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Operation ID was already used with different capture input or owner'; END IF;
   RETURN QUERY SELECT v_id,v_qty,v_time,v_status; RETURN;
 END IF;

 if exists(select 1 from unnest(v_scope) s where not exists(select 1 from public.pharmflow_orders o where o.pharmacy_id=p_pharmacy_id and o.order_number=s and o.status='uploaded')) then raise exception 'Receiving work scope contains an unavailable Order';end if;
 begin
  insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,session_id,order_number,order_name,gtin,raw_barcode,identifier_display,identifier_key,pending_quantity,review_reason,master_item_code_hint,master_item_name_hint,source,device_id,created_by,work_scope_order_numbers,operation_id,receiving_capture_request)
  values(p_pharmacy_id,'RECEIVING',nullif(btrim(coalesce(p_session_id,'')),''),v_order,nullif(btrim(coalesce(p_order_name,'')),''),v_display,nullif(p_raw_barcode,''),v_display,v_key,p_pending_quantity,upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),nullif(btrim(coalesce(p_master_item_code_hint,'')),''),nullif(btrim(coalesce(p_master_item_name_hint,'')),''),upper(btrim(coalesce(p_source,'HANDHELD'))),nullif(btrim(coalesce(p_device_id,'')),''),auth.uid(),v_scope,v_operation,v_request)
  returning id,pharmflow_needs_review_v2.pending_quantity,pharmflow_needs_review_v2.created_at,pharmflow_needs_review_v2.status into v_id,v_qty,v_time,v_status;

 end;
 return query select v_id,v_qty,v_time,v_status;
end;$function$;

CREATE OR REPLACE FUNCTION public.set_pharmflow_needs_review_qty_v3(p_pharmacy_id uuid, p_review_id uuid, p_pending_quantity integer)
 RETURNS TABLE(review_id uuid, pending_quantity integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '3s'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'set_pharmflow_needs_review_qty_v3',NULL);

 IF auth.uid() IS NULL OR NOT public.is_pharmacy_member(p_pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy access required'; END IF;
 IF p_pending_quantity IS NULL OR p_pending_quantity<1 THEN RAISE EXCEPTION 'Positive integer quantity required'; END IF;
 PERFORM 1 FROM public.pharmflow_needs_review_v2 r WHERE r.id=p_review_id AND r.pharmacy_id=p_pharmacy_id AND r.workflow='RECEIVING' AND r.status='PENDING' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending Receiving review required'; END IF;
 IF EXISTS(SELECT 1 FROM public.pharmflow_needs_review_resolution_intents_v1 i WHERE i.pharmacy_id=p_pharmacy_id AND i.review_id=p_review_id) THEN RAISE EXCEPTION 'Quantity is locked after a resolution request'; END IF;
 RETURN QUERY UPDATE public.pharmflow_needs_review_v2 r SET pending_quantity=p_pending_quantity,updated_at=now()
 WHERE r.id=p_review_id AND r.pharmacy_id=p_pharmacy_id RETURNING r.id,r.pending_quantity,r.updated_at;
END $function$;

CREATE OR REPLACE FUNCTION public.save_pharmflow_active_order_manifest_v4(p_pharmacy_id uuid, p_manifest jsonb, p_expected_generation bigint, p_expected_revision bigint)
 RETURNS TABLE(revision bigint, updated_at timestamp with time zone, order_files integer, order_items integer, workspace_generation bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_files integer;
    v_items integer;
    v_generation bigint;
    v_revision bigint;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_active_order_manifest_v4',NULL);

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation)
    values(p_pharmacy_id,0)
    on conflict(pharmacy_id) do nothing;

    select g.generation
      into v_generation
      from public.pharmflow_workspace_generation_v1 g
     where g.pharmacy_id=p_pharmacy_id
     for update;

    if coalesce(p_expected_generation,-1) <> coalesce(v_generation,0) then
        raise exception 'STALE_WORKSPACE_GENERATION';
    end if;

    select m.revision
      into v_revision
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id
     for update;

    v_revision:=coalesce(v_revision,0);

    if coalesce(p_expected_revision,-1) <> v_revision then
        raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';
    end if;

    v_files:=jsonb_array_length(coalesce(p_manifest->'orderFiles','[]'::jsonb));
    v_items:=jsonb_array_length(coalesce(p_manifest->'orderData','[]'::jsonb));

    if v_files<=0 or v_items<=0 then
        raise exception 'Active Order Manifest requires orderFiles and orderData';
    end if;

    insert into public.pharmflow_active_order_manifest_v1(
        pharmacy_id,manifest,revision,updated_at,updated_by,workspace_generation
    )
    values(
        p_pharmacy_id,p_manifest,1,now(),auth.uid(),v_generation
    )
    on conflict(pharmacy_id) do update set
        manifest=excluded.manifest,
        revision=public.pharmflow_active_order_manifest_v1.revision+1,
        updated_at=now(),
        updated_by=auth.uid(),
        workspace_generation=v_generation;

    return query
    select m.revision,m.updated_at,
           jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
           jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),
           m.workspace_generation
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_master_cache_meta_v2()
 RETURNS TABLE(version text, source_file text, item_count bigint, global_item_count bigint, identifier_count bigint, updated_at timestamp with time zone, api_version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_items bigint;v_ids bigint;v_numeric bigint;v_updated timestamptz;
BEGIN
 PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'get_pharmflow_master_cache_meta_v2',NULL);

 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required';END IF;
 SELECT count(*),max(g.updated_at) INTO v_items,v_updated FROM public.pharmflow_global_items_v2 g;
 SELECT count(*),count(*) FILTER(WHERE i.identifier_display ~ '^[0-9]+$'),greatest(v_updated,max(i.updated_at)) INTO v_ids,v_numeric,v_updated FROM public.pharmflow_global_item_identifiers_v2 i;
 RETURN QUERY SELECT 'GLOBAL_V2:'||v_items||':'||v_ids||':'||coalesce(v_updated::text,''),'Global Master V2'::text,v_numeric,v_items,v_ids,v_updated,2;
END $function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_order(p_pharmacy_id uuid, p_order_number text)
 RETURNS SETOF pharmflow_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_order',NULL);
 RETURN QUERY select *
  from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=
        upper(regexp_replace(p_order_number,'\\s','','g'))
    and auth.uid() is not null
    and public.is_pharmacy_admin(p_pharmacy_id)
  limit 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.register_pharmflow_order_upload(p_pharmacy_id uuid, p_order_number text, p_order_date date DEFAULT NULL::date, p_from_warehouse text DEFAULT ''::text, p_to_warehouse text DEFAULT ''::text, p_source_file text DEFAULT ''::text, p_item_count integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'register_pharmflow_order_upload',NULL);

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access required';
  end if;

  if nullif(trim(p_order_number),'') is null then
    raise exception 'Order Number is required';
  end if;

  insert into public.pharmflow_orders(
    pharmacy_id,order_number,order_date,from_warehouse,to_warehouse,
    source_file,item_count,status,uploaded_by
  ) values (
    p_pharmacy_id,
    upper(regexp_replace(trim(p_order_number),'\\s','','g')),
    p_order_date,
    coalesce(p_from_warehouse,''),
    coalesce(p_to_warehouse,''),
    coalesce(p_source_file,''),
    greatest(coalesce(p_item_count,0),0),
    'uploaded',
    auth.uid()
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Order % was already uploaded and cannot be uploaded twice',p_order_number;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_receiving_groups_v1(p_item_codes text[])
 RETURNS TABLE(item_code text, group_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$ BEGIN
 PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'get_pharmflow_receiving_groups_v1',NULL);
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; IF coalesce(cardinality(p_item_codes),0)>1000 THEN RAISE EXCEPTION 'At most 1000 Item Codes per request'; END IF; RETURN QUERY SELECT public.pharmflow_receiving_item_code_v1(i.item_code),min(i.group_name) FROM public.pharmflow_global_items_v2 i WHERE public.pharmflow_receiving_item_code_v1(i.item_code)=ANY(coalesce(p_item_codes,ARRAY[]::text[])) GROUP BY public.pharmflow_receiving_item_code_v1(i.item_code) HAVING count(*)=1; END $function$;

