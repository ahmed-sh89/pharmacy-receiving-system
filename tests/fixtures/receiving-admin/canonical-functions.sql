-- Staging canonical contracts captured read-only 2026-11-09. Test fixture only.
CREATE OR REPLACE FUNCTION public.add_pharmflow_global_identifier_v2(p_operation_id uuid, p_identifier_display text, p_item_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_display text:=btrim(coalesce(p_identifier_display,''));
 v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
 v_item_code text:=btrim(coalesce(p_item_code,''));
 v_reason text:=btrim(coalesce(p_reason,''));
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
 v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;
begin
 PERFORM pharmflow_auth_private.require_access(NULL,'GLOBAL',true,'add_pharmflow_global_identifier_v2',p_operation_id::text);

 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required'; end if;
 if p_operation_id is null or v_key='' or v_item_code='' or v_reason='' then raise exception 'Operation, identifier, item and reason are required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where identifier_key=v_key for update;
 if v_mapping.id is not null and v_mapping.item_code<>v_item_code then raise exception 'Identifier is already mapped to another Item Code'; end if;
 if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_item_code) then raise exception 'Global Item Code does not exist'; end if;
 if v_mapping.id is null then
   insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by)
   values(v_item_code,v_display,v_key,auth.uid(),auth.uid()) returning * into v_mapping;
 end if;
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
 values(p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_mapping.item_code,v_reason,auth.uid())
 on conflict(operation_id) do nothing;
 -- PHASE2C1159's signature, authorization, normalized key, mapping write and
 -- audit schema stay canonical. This guard closes its DO NOTHING false-success
 -- case and still permits an exact same-operation retry only.
 select * into v_audit from public.pharmflow_identifier_mapping_audit_v1 where operation_id=p_operation_id for update;
 if not found or v_audit.action is distinct from 'ADD' or v_audit.identifier_id is distinct from v_mapping.id
    or v_audit.identifier_display is distinct from v_mapping.identifier_display or v_audit.identifier_key is distinct from v_mapping.identifier_key
    or v_audit.old_item_code is not null or v_audit.new_item_code is distinct from v_mapping.item_code
    or v_audit.reason is distinct from v_reason or v_audit.performed_by is distinct from auth.uid() then
   raise exception 'Operation ID was already used for a different identifier mapping operation';
 end if;
 return jsonb_build_object('success',true,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'itemCode',v_mapping.item_code);
end $function$
;
CREATE OR REPLACE FUNCTION public.create_pharmflow_global_item_v2(p_operation_id uuid, p_item_code text, p_item_name text, p_group_name text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_sub_category text DEFAULT NULL::text, p_identifier_display text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item_code text := btrim(coalesce(p_item_code,''));
  v_item_name text := btrim(coalesce(p_item_name,''));
  v_identifier_display text := nullif(btrim(coalesce(p_identifier_display,'')),'');
  v_identifier_key text;
  v_reason text := btrim(coalesce(p_reason,''));
  v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;
begin
 PERFORM pharmflow_auth_private.require_access(NULL,'GLOBAL',true,'create_pharmflow_global_item_v2',p_operation_id::text);

  if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then
    raise exception 'Global Identifier write permission required';
  end if;
  if p_operation_id is null or v_item_code='' or v_item_name='' or v_identifier_display is null or v_reason='' then
    raise exception 'Operation ID, Item Code, Item Name, identifier and reason are required';
  end if;

  v_identifier_key := public.pharmflow_identifier_key_v2(v_identifier_display);
  perform pg_advisory_xact_lock(hashtextextended(v_identifier_key,1153));

  select * into v_audit
    from public.pharmflow_identifier_mapping_audit_v1
   where operation_id=p_operation_id;
  if v_audit.id is not null then
    if v_audit.action='ADD'
       and v_audit.new_item_code=v_item_code
       and v_audit.identifier_key=v_identifier_key
       and exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_item_code) then
      select * into v_mapping from public.pharmflow_global_item_identifiers_v2
       where identifier_key=v_identifier_key;
      if v_mapping.id is not null and v_mapping.item_code=v_item_code then
        return jsonb_build_object('success',true,'idempotent',true,'itemCode',v_item_code,
          'itemName',v_item_name,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision);
      end if;
    end if;
    raise exception 'Operation ID was already used for a different mapping operation';
  end if;

  if exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_item_code) then
    raise exception 'Global Item Code already exists';
  end if;
  select * into v_mapping from public.pharmflow_global_item_identifiers_v2
   where identifier_key=v_identifier_key for update;
  if v_mapping.id is not null then
    raise exception 'Identifier is already mapped to another Item Code';
  end if;

  if public.pharmflow_normalize_main_group_v1(p_group_name) is null then
    raise exception 'Select one of the six approved Groups';
  end if;
  insert into public.pharmflow_global_items_v2(item_code,item_name,group_name,category,sub_category,created_by,updated_by)
  values(v_item_code,v_item_name,public.pharmflow_normalize_main_group_v1(p_group_name),nullif(btrim(coalesce(p_category,'')),''),
    nullif(btrim(coalesce(p_sub_category,'')),''),auth.uid(),auth.uid());

  insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by)
  values(v_item_code,v_identifier_display,v_identifier_key,auth.uid(),auth.uid()) returning * into v_mapping;
  insert into public.pharmflow_identifier_mapping_audit_v1(
    operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by
  ) values (
    p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_item_code,v_reason,auth.uid()
  );
  return jsonb_build_object('success',true,'idempotent',false,'itemCode',v_item_code,
    'itemName',v_item_name,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision);
end
$function$
;
CREATE OR REPLACE FUNCTION public.pharmflow_identifier_key_v2(p_identifier_display text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ select upper(btrim(coalesce(p_identifier_display, ''))) $function$
;
CREATE OR REPLACE FUNCTION public.pharmflow_normalize_main_group_v1(p_group_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case lower(btrim(coalesce(p_group_name,'')))
    when 'beauty' then 'Beauty'
    when 'fmcg' then 'FMCG'
    when 'homehealth' then 'HomeHealth'
    when 'home health' then 'HomeHealth'
    when 'medicine' then 'Medicine'
    when 'mom & baby' then 'Mom & Baby'
    when 'supplement' then 'Supplement'
    else null
  end
$function$
;
CREATE OR REPLACE FUNCTION public.pharmflow_receiving_item_code_v1(p_code text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v text:=upper(regexp_replace(replace(regexp_replace(coalesce(p_code,''),'^''+',''),chr(160),''),'\s+','','g'));
BEGIN
 IF v ~ '^\d+\.0+$' THEN v:=regexp_replace(v,'\.0+$',''); END IF;
 IF v ~ '^\d+$' THEN v:=regexp_replace(v,'^0+(?=\d)',''); END IF;
 RETURN v;
END $function$
;
CREATE OR REPLACE FUNCTION public.request_pharmflow_needs_review_resolution_v5(p_operation_id uuid, p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text, p_resolution_transaction_id text, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_existing public.pharmflow_needs_review_resolution_intents_v1%rowtype;
  v_item_code text:=btrim(coalesce(p_item_code,''));
  v_transaction_id text:=btrim(coalesce(p_resolution_transaction_id,''));
  v_item_name text:=btrim(coalesce(p_item_name,''));
  v_alloc jsonb; v_manifest jsonb; v_order text; v_qty integer; v_total integer:=0;
  v_item_in_order boolean; v_scope text[];
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'request_pharmflow_needs_review_resolution_v5',p_operation_id::text);

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
  perform 1 from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;

  if p_operation_id is null or p_review_id is null or v_item_code='' or v_transaction_id='' then raise exception 'Operation, review, Item Code and Receiving transaction are required'; end if;
  if p_allocations is null or jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations)=0 then raise exception 'At least one Receiving allocation is required'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_allocations) as a(value)
    group by value->>'transactionId'
    having count(*)>1
  ) then raise exception 'Each Receiving transaction can appear only once in an allocation'; end if;
  select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where operation_id=p_operation_id;
  if v_existing.id is not null then
    if v_existing.pharmacy_id=p_pharmacy_id and v_existing.review_id=p_review_id and v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name and v_existing.allocations=p_allocations then return public.try_finalize_pharmflow_needs_review_resolution_intent_v2(v_existing.id); end if;
    raise exception 'Operation ID was already used for different resolution input';
  end if;
  select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id for update;
  if v_review.id is null then raise exception 'Needs Review case is unavailable'; end if;
  if v_review.status<>'PENDING' then return jsonb_build_object('success',v_review.status='RESOLVED','status',v_review.status,'reviewId',v_review.id); end if;
  v_scope:=coalesce(v_review.work_scope_order_numbers,'{}'::text[]);
  if cardinality(v_scope)=0 and nullif(btrim(coalesce(v_review.order_number,'')),'') is not null then v_scope:=array[v_review.order_number]; end if;
  select m.manifest into v_manifest from public.pharmflow_active_order_manifest_v1 m where m.pharmacy_id=p_pharmacy_id;
  if v_manifest is null or not coalesce((v_manifest->>'active')::boolean,false) then return jsonb_build_object('success',false,'status','BLOCKED','code','ACTIVE_ORDER_MANIFEST_UNAVAILABLE'); end if;
  for v_alloc in select value from jsonb_array_elements(p_allocations) loop
    v_order:=btrim(coalesce(v_alloc->>'orderNumber','')); v_qty:=coalesce((v_alloc->>'quantity')::integer,0);
    if btrim(coalesce(v_alloc->>'transactionId',''))='' or v_order='' or v_qty<=0 then raise exception 'Invalid Needs Review allocation'; end if;
    if not (v_scope @> array[v_order]) then return jsonb_build_object('success',false,'status','BLOCKED','code','ORDER_OUTSIDE_CAPTURED_WORK_SCOPE'); end if;
    select exists(select 1 from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb)) x
      where coalesce(x->'orderNumbers','[]'::jsonb) ? v_order and btrim(coalesce(x->>'itemCode',''))=v_item_code) into v_item_in_order;
    if not v_item_in_order then return jsonb_build_object('success',false,'status','BLOCKED','code','ITEM_NOT_IN_ACTIVE_ORDER'); end if;
    v_total:=v_total+v_qty;
  end loop;
  if v_total<>v_review.pending_quantity then return jsonb_build_object('success',false,'status','BLOCKED','code','ALLOCATION_QUANTITY_MISMATCH'); end if;
  select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where pharmacy_id=p_pharmacy_id and review_id=p_review_id for update;
  if v_existing.id is not null then
    if v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name and v_existing.allocations=p_allocations then return public.try_finalize_pharmflow_needs_review_resolution_intent_v2(v_existing.id); end if;
    raise exception 'A different resolution intent already exists for this Needs Review case';
  end if;
  insert into public.pharmflow_needs_review_resolution_intents_v1(operation_id,pharmacy_id,review_id,transaction_id,item_code,item_name,resolution_type,requested_by,allocations)
  values(p_operation_id,p_pharmacy_id,p_review_id,v_transaction_id,v_item_code,v_item_name,'AUTO_ALLOCATED',auth.uid(),p_allocations) returning * into v_existing;
  return public.try_finalize_pharmflow_needs_review_resolution_intent_v2(v_existing.id);
end
$function$
;
CREATE OR REPLACE FUNCTION public.try_finalize_pharmflow_needs_review_resolution_intent_v2(p_intent_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_intent public.pharmflow_needs_review_resolution_intents_v1%rowtype;
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_alloc jsonb; v_tx public.pharmflow_receiving_transactions_v1%rowtype;
  v_expected_total integer:=0; v_found_total integer:=0;
begin
  select * into v_intent from public.pharmflow_needs_review_resolution_intents_v1 where id=p_intent_id for update;
  if v_intent.id is null then raise exception 'Resolution intent is unavailable'; end if;
  if v_intent.status='RESOLVED' then return jsonb_build_object('success',true,'status','RESOLVED','reviewId',v_intent.review_id,'transactionId',v_intent.transaction_id,'idempotent',true); end if;
  if v_intent.status='BLOCKED' then return jsonb_build_object('success',false,'status','BLOCKED','code',v_intent.blocked_code,'detail',v_intent.blocked_detail); end if;
  select * into v_review from public.pharmflow_needs_review_v2 where id=v_intent.review_id and pharmacy_id=v_intent.pharmacy_id for update;
  if v_review.id is null or v_review.status<>'PENDING' then
    update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='REVIEW_NOT_PENDING',blocked_detail='Needs Review case is unavailable or no longer pending.',updated_at=now() where id=v_intent.id;
    return jsonb_build_object('success',false,'status','BLOCKED','code','REVIEW_NOT_PENDING');
  end if;
  if v_intent.allocations is null or jsonb_typeof(v_intent.allocations)<>'array' or jsonb_array_length(v_intent.allocations)=0 then
    return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(p_intent_id);
  end if;
  if (select count(*)<>count(distinct value->>'transactionId')
      from jsonb_array_elements(v_intent.allocations) as a(value)) then
    update public.pharmflow_needs_review_resolution_intents_v1
      set status='BLOCKED',blocked_code='DUPLICATE_ALLOCATION_TRANSACTION',
          blocked_detail='Each Receiving transaction can appear only once in an allocation.',updated_at=now()
      where id=v_intent.id;
    return jsonb_build_object('success',false,'status','BLOCKED','code','DUPLICATE_ALLOCATION_TRANSACTION');
  end if;
  for v_alloc in select value from jsonb_array_elements(v_intent.allocations) loop
    if btrim(coalesce(v_alloc->>'transactionId',''))='' or btrim(coalesce(v_alloc->>'orderNumber',''))=''
       or coalesce((v_alloc->>'quantity')::integer,0)<=0 then raise exception 'Invalid Needs Review allocation'; end if;
    v_expected_total:=v_expected_total+(v_alloc->>'quantity')::integer;
    select * into v_tx from public.pharmflow_receiving_transactions_v1
     where pharmacy_id=v_intent.pharmacy_id and transaction_id=v_alloc->>'transactionId' for update;
    if v_tx.transaction_id is null then
      update public.pharmflow_needs_review_resolution_intents_v1 set last_checked_at=now(),updated_at=now() where id=v_intent.id;
      return jsonb_build_object('success',false,'status','PENDING','code','RECEIVING_TRANSACTION_PENDING','reviewId',v_review.id,'transactionId',v_intent.transaction_id);
    end if;
    if coalesce(v_tx.order_number,'')<>coalesce(v_alloc->>'orderNumber','')
       or v_tx.item_code<>v_intent.item_code or v_tx.quantity<>(v_alloc->>'quantity')::integer
       or public.pharmflow_identifier_key_v2(v_tx.gtin)<>v_review.identifier_key then
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
  update public.pharmflow_needs_review_v2 set status='RESOLVED',resolved_item_code=v_intent.item_code,
    resolved_item_name=v_intent.item_name,resolution_type='AUTO_ALLOCATED',resolution_transaction_id=v_intent.transaction_id,
    resolved_by=v_intent.requested_by,resolved_at=now(),resolution_block_code=null,resolution_block_detail=null,updated_at=now()
   where id=v_review.id and pharmacy_id=v_intent.pharmacy_id and status='PENDING';
  update public.pharmflow_needs_review_resolution_intents_v1 set status='RESOLVED',resolution_type='AUTO_ALLOCATED',resolved_at=now(),last_checked_at=now(),updated_at=now() where id=v_intent.id;
  return jsonb_build_object('success',true,'status','RESOLVED','reviewId',v_review.id,'transactionId',v_intent.transaction_id,'allocations',v_intent.allocations);
end
$function$
;
