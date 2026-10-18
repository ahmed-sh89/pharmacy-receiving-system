-- Staging-only Expiry completion: no data changes.
BEGIN;
CREATE OR REPLACE FUNCTION public.assign_pharmflow_needs_review_order_v1(p_pharmacy_id uuid, p_review_id uuid, p_order_number text)
 RETURNS TABLE(success boolean, order_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_review public.pharmflow_needs_review_v2%rowtype; v_order text:=btrim(coalesce(p_order_number,''));
begin
  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin access required'; end if;
  perform 1 from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;

  select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id for update;
  if v_review.id is null or v_review.status<>'PENDING' then raise exception 'Needs Review case is unavailable'; end if;
  if nullif(v_order,'') is null or not (v_order=any(coalesce(v_review.work_scope_order_numbers,array[]::text[]))) then raise exception 'Order is outside the captured Receiving work scope'; end if;
  if not exists(select 1 from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and order_number=v_order and status='uploaded') then raise exception 'Selected Order is unavailable'; end if;
  update public.pharmflow_needs_review_v2 set order_number=v_order,order_name=v_order,updated_at=now(),
    resolution_block_code=null,resolution_block_detail=null where id=v_review.id and pharmacy_id=p_pharmacy_id;
  return query select true,v_order;
end
$function$
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

CREATE OR REPLACE FUNCTION public.delete_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_review_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
  perform 1 from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;

  update public.pharmflow_needs_review_v2 set status='DELETED',deleted_by=auth.uid(),deleted_at=now(),updated_at=now()
   where id=p_review_id and pharmacy_id=p_pharmacy_id and status='PENDING';
  return found;
end
$function$
;

CREATE OR REPLACE FUNCTION public.request_pharmflow_needs_review_resolution_v4(p_operation_id uuid, p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text, p_resolution_transaction_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_existing public.pharmflow_needs_review_resolution_intents_v1%rowtype;
  v_manifest jsonb;
  v_item_code text:=btrim(coalesce(p_item_code,''));
  v_transaction_id text:=btrim(coalesce(p_resolution_transaction_id,''));
  v_item_in_order boolean;
begin
  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
  perform 1 from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;

  if p_operation_id is null or p_review_id is null or v_item_code='' or v_transaction_id='' then raise exception 'Operation, review, Item Code and Receiving transaction are required'; end if;
  select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where operation_id=p_operation_id;
  if v_existing.id is not null then
    if v_existing.pharmacy_id=p_pharmacy_id and v_existing.review_id=p_review_id and v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=btrim(coalesce(p_item_name,'')) then
      return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id);
    end if;
    raise exception 'Operation ID was already used for different resolution input';
  end if;
  select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id for update;
  if v_review.id is null then raise exception 'Needs Review case is unavailable'; end if;
  if v_review.status<>'PENDING' then return jsonb_build_object('success',v_review.status='RESOLVED','status',v_review.status,'reviewId',v_review.id); end if;
  if nullif(btrim(coalesce(v_review.order_number,'')),'') is null
     or not exists(select 1 from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and order_number=v_review.order_number and status='uploaded') then
    return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE');
  end if;
  select m.manifest into v_manifest from public.pharmflow_active_order_manifest_v1 m where m.pharmacy_id=p_pharmacy_id;
  if v_manifest is null or not coalesce((v_manifest->>'active')::boolean,false) then
    return jsonb_build_object('success',false,'status','BLOCKED','code','ACTIVE_ORDER_MANIFEST_UNAVAILABLE');
  end if;
  select exists(select 1 from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb)) x
    where coalesce(x->'orderNumbers','[]'::jsonb) ? v_review.order_number
      and btrim(coalesce(x->>'itemCode',''))=v_item_code) into v_item_in_order;
  if not v_item_in_order then return jsonb_build_object('success',false,'status','BLOCKED','code','ITEM_NOT_IN_ORIGINAL_ORDER'); end if;
  select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1
   where pharmacy_id=p_pharmacy_id and review_id=p_review_id for update;
  if v_existing.id is not null then
    if v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=btrim(coalesce(p_item_name,'')) then
      return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id);
    end if;
    raise exception 'A different resolution intent already exists for this Needs Review case';
  end if;
  insert into public.pharmflow_needs_review_resolution_intents_v1(operation_id,pharmacy_id,review_id,transaction_id,item_code,item_name,requested_by)
  values(p_operation_id,p_pharmacy_id,p_review_id,v_transaction_id,v_item_code,btrim(coalesce(p_item_name,'')),auth.uid()) returning * into v_existing;
  return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id);
end
$function$
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

CREATE OR REPLACE FUNCTION public.resolve_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text, p_resolution_type text, p_resolution_transaction_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_type text := upper(trim(coalesce(p_resolution_type,'')));
begin
    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;
  perform 1 from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;


    if v_type not in ('LINK_ORDER_ITEM','ADD_UNORDERED') then
        raise exception 'Invalid resolution type';
    end if;

    update public.pharmflow_needs_review_v2
       set status = 'RESOLVED',
           resolved_item_code = trim(coalesce(p_item_code,'')),
           resolved_item_name = trim(coalesce(p_item_name,'')),
           resolution_type = v_type,
           resolution_transaction_id = nullif(trim(coalesce(p_resolution_transaction_id,'')),''),
           resolved_by = auth.uid(),
           resolved_at = now(),
           updated_at = now()
     where id = p_review_id
       and pharmacy_id = p_pharmacy_id
       and status = 'PENDING';

    return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_pharmflow_needs_review_photo_v2(p_pharmacy_id uuid, p_review_id uuid, p_photo_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
  perform 1 from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;


    update public.pharmflow_needs_review_v2
       set photo_path = nullif(trim(coalesce(p_photo_path,'')),''),
           updated_at = now()
     where id = p_review_id
       and pharmacy_id = p_pharmacy_id
       and status = 'PENDING';

    return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_pharmflow_needs_review_qty_v2(p_pharmacy_id uuid, p_review_id uuid, p_pending_quantity integer)
 RETURNS TABLE(review_id uuid, pending_quantity integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_qty integer:=greatest(coalesce(p_pending_quantity,1),1);
begin
  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  perform 1 from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;

  return query update public.pharmflow_needs_review_v2 r
    set pending_quantity=v_qty,updated_at=now()
    where r.id=p_review_id and r.pharmacy_id=p_pharmacy_id and r.status='PENDING'
    returning r.id,r.pending_quantity,r.updated_at;
  if not found then raise exception 'Pending review item not found'; end if;
end
$function$
;

-- Keep V1 backward-compatible; V2 coordinates authorized Global writes and the
-- existing Expiry transaction under the same review-row lock and operation ID.
CREATE OR REPLACE FUNCTION public.resolve_pharmflow_expiry_review_v2(
 p_pharmacy_id uuid,p_review_id uuid,p_operation_id uuid,p_item_code text,
 p_reason text,p_new_item jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,pg_temp
AS $function$
DECLARE
 r public.pharmflow_needs_review_v2%rowtype;
 item public.pharmflow_global_items_v2%rowtype;
 answer jsonb; global_result jsonb; can_global boolean;
 code text:=btrim(coalesce(p_item_code,'')); normalized_group text;
BEGIN
 IF auth.uid() IS NULL OR p_pharmacy_id IS NULL OR public.is_pharmacy_member(p_pharmacy_id) IS NOT TRUE THEN
  RAISE EXCEPTION 'Pharmacy access required';
 END IF;
 IF p_review_id IS NULL OR p_operation_id IS NULL OR code='' THEN RAISE EXCEPTION 'Review, operation and Item Code required'; END IF;
 SELECT * INTO r FROM public.pharmflow_needs_review_v2
  WHERE id=p_review_id AND pharmacy_id=p_pharmacy_id AND workflow='EXPIRY' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expiry review case not found in authorized pharmacy'; END IF;
 can_global:=public.pharmflow_is_reference_master_admin_v1() IS TRUE;
 IF p_new_item IS NOT NULL THEN
  IF NOT can_global THEN RAISE EXCEPTION 'Global Identifier write permission required'; END IF;
  IF jsonb_typeof(p_new_item) IS DISTINCT FROM 'object'
    OR NOT(p_new_item ?& ARRAY['item_name','group_name'])
    OR (SELECT count(*) FROM jsonb_object_keys(p_new_item))<>2
    OR jsonb_typeof(p_new_item->'item_name') IS DISTINCT FROM 'string'
    OR nullif(btrim(p_new_item->>'item_name'),'') IS NULL
    OR jsonb_typeof(p_new_item->'group_name') IS DISTINCT FROM 'string' THEN
   RAISE EXCEPTION 'Item Name and approved Group required';
  END IF;
  normalized_group:=public.pharmflow_normalize_main_group_v1(p_new_item->>'group_name');
  IF normalized_group IS NULL THEN RAISE EXCEPTION 'Select one of the six approved Groups'; END IF;
 END IF;
 -- Resolve retry before any Global effects, including retries from another mode.
 IF r.status='RESOLVED' THEN
  IF p_new_item IS NOT NULL THEN
   SELECT * INTO item FROM public.pharmflow_global_items_v2 WHERE item_code=code;
   IF NOT FOUND OR item.item_name IS DISTINCT FROM btrim(p_new_item->>'item_name')
      OR item.group_name IS DISTINCT FROM normalized_group THEN RAISE EXCEPTION 'Resolution payload conflict'; END IF;
  END IF;
  RETURN public.resolve_pharmflow_expiry_review_v1(p_pharmacy_id,p_review_id,p_operation_id,code,p_reason);
 END IF;
 IF r.status<>'PENDING' THEN RAISE EXCEPTION 'Only pending Expiry review cases may be resolved'; END IF;
 -- A reused operation cannot create/link before the V1 audit detects the conflict.
 IF EXISTS(SELECT 1 FROM public.pharmflow_expiry_review_resolution_audit_v1
   WHERE pharmacy_id=p_pharmacy_id AND operation_id=p_operation_id) THEN RAISE EXCEPTION 'Resolution operation already used'; END IF;
 IF p_new_item IS NOT NULL THEN
  global_result:=public.create_pharmflow_global_item_v2(p_operation_id,code,
    btrim(p_new_item->>'item_name'),normalized_group,NULL,NULL,
    coalesce(nullif(btrim(r.identifier_display),''),r.gtin),p_reason);
 ELSIF can_global THEN
  global_result:=public.add_pharmflow_global_identifier_v2(p_operation_id,
    coalesce(nullif(btrim(r.identifier_display),''),r.gtin),code,p_reason);
 END IF;
 answer:=public.resolve_pharmflow_expiry_review_v1(p_pharmacy_id,p_review_id,p_operation_id,code,p_reason);
 RETURN answer||jsonb_build_object('scope',CASE WHEN can_global THEN 'GLOBAL_AND_PHARMACY' ELSE 'PHARMACY' END,
   'global_item_created',p_new_item IS NOT NULL);
END $function$;
REVOKE ALL ON FUNCTION public.resolve_pharmflow_expiry_review_v2(uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_pharmflow_expiry_review_v2(uuid,uuid,uuid,text,text,jsonb) TO authenticated;
COMMIT;
