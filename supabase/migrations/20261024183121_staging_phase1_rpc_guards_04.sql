CREATE OR REPLACE FUNCTION public.assign_pharmflow_needs_review_order_v1(p_pharmacy_id uuid, p_review_id uuid, p_order_number text)
 RETURNS TABLE(success boolean, order_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_review public.pharmflow_needs_review_v2%rowtype; v_order text:=btrim(coalesce(p_order_number,''));
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'assign_pharmflow_needs_review_order_v1',NULL);

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
$function$;

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
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'request_pharmflow_needs_review_resolution_v4',p_operation_id::text);

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
$function$;

CREATE OR REPLACE FUNCTION public.create_pharmflow_needs_review_v4(p_pharmacy_id uuid, p_workflow text, p_identifier_display text, p_raw_barcode text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_review_reason text DEFAULT 'UNKNOWN_GTIN'::text, p_master_item_code_hint text DEFAULT NULL::text, p_master_item_name_hint text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_device_id text DEFAULT NULL::text, p_work_scope_order_numbers text[] DEFAULT NULL::text[])
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_display text:=btrim(coalesce(p_identifier_display,''));
  v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
  v_order text:=nullif(btrim(coalesce(p_order_number,'')),'');
  v_scope text[]; v_id uuid; v_time timestamptz;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),true,'create_pharmflow_needs_review_v4',NULL);

  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  if coalesce(v_key,'')='' then raise exception 'Identifier is required'; end if;
  if upper(trim(coalesce(p_workflow,'RECEIVING'))) <> 'RECEIVING' then raise exception 'Invalid workflow'; end if;
  if upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))) not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason'; end if;
  if upper(btrim(coalesce(p_source,'HANDHELD'))) not in ('HANDHELD','PC') then raise exception 'Invalid source'; end if;
  select coalesce(array_agg(distinct btrim(x) order by btrim(x)),array[]::text[]) into v_scope
    from unnest(coalesce(p_work_scope_order_numbers,array[]::text[])) x where btrim(coalesce(x,''))<>'';
  if v_order is not null and not (v_order=any(v_scope)) then v_scope:=array_append(v_scope,v_order); end if;
  if coalesce(array_length(v_scope,1),0)=0 then raise exception 'Receiving work scope is required'; end if;
  if v_order is null and array_length(v_scope,1)=1 then v_order:=v_scope[1]; end if;
  if exists(select 1 from unnest(v_scope) s where not exists(
    select 1 from public.pharmflow_orders o where o.pharmacy_id=p_pharmacy_id and o.order_number=s and o.status='uploaded'
  )) then raise exception 'Receiving work scope contains an unavailable Order'; end if;
  insert into public.pharmflow_needs_review_v2(
    pharmacy_id,workflow,session_id,order_number,order_name,gtin,raw_barcode,identifier_display,identifier_key,
    pending_quantity,review_reason,master_item_code_hint,master_item_name_hint,source,device_id,created_by,work_scope_order_numbers
  ) values (
    p_pharmacy_id,'RECEIVING',nullif(btrim(coalesce(p_session_id,'')),''),v_order,nullif(btrim(coalesce(p_order_name,'')),''),
    v_display,nullif(p_raw_barcode,''),v_display,v_key,1,upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),
    nullif(btrim(coalesce(p_master_item_code_hint,'')),''),nullif(btrim(coalesce(p_master_item_name_hint,'')),''),
    upper(btrim(coalesce(p_source,'HANDHELD'))),nullif(btrim(coalesce(p_device_id,'')),''),auth.uid(),v_scope
  ) returning id,pharmflow_needs_review_v2.created_at into v_id,v_time;
  return query select v_id,1,v_time;
end
$function$;

CREATE OR REPLACE FUNCTION public.list_pharmacy_expiry_workers(p_pharmacy_id uuid)
 RETURNS TABLE(worker_id uuid, worker_name text, active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmacy_expiry_workers',NULL);

 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 -- Same lock used by existing management RPCs. Stable rows, not a client-only attribution.
 perform pg_advisory_xact_lock(hashtextextended('expiry-operators/'||p_pharmacy_id::text,0));
 with added as (
  insert into public.pharmflow_expiry_workers_v1 as inserted(pharmacy_id,worker_name,active,created_by,system_key)
  select p_pharmacy_id,v.name,true,auth.uid(),v.key from (values('Desktop','DESKTOP'),('Handheld','HANDHELD')) v(name,key)
  where pharmflow_auth_private.module_allowed(p_pharmacy_id,'EXPIRY',true) and not exists(select 1 from public.pharmflow_expiry_workers_v1 w where w.pharmacy_id=p_pharmacy_id and w.system_key=v.key)
  returning inserted.id,inserted.pharmacy_id,inserted.worker_name
 ) insert into pharmflow_expiry_private.operator_audit_v1(pharmacy_id,worker_id,actor,action,name)
 select a.pharmacy_id,a.id,auth.uid(),'ADD',a.worker_name from added a;
 return query select w.id,w.worker_name,w.active from public.pharmflow_expiry_workers_v1 w where w.pharmacy_id=p_pharmacy_id and w.active=true order by (w.system_key is null),lower(w.worker_name);
end $function$;

CREATE OR REPLACE FUNCTION public.save_pharmflow_order_source_items_v2(p_pharmacy_id uuid, p_order_number text, p_items jsonb, p_replace boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_order_id uuid;v_count integer:=0;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_order_source_items_v2',NULL);

 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access required'; end if;
 select id into v_order_id from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and upper(regexp_replace(order_number,'\\s','','g'))=upper(regexp_replace(p_order_number,'\\s','','g')) limit 1;
 if v_order_id is null then raise exception 'Order % is not registered',p_order_number; end if;
 if p_replace then
  if exists(select 1 from public.pharmflow_orders where id=v_order_id and status='received') then raise exception 'Received order source data is immutable'; end if;
  delete from public.pharmflow_order_source_items where order_id=v_order_id;
 end if;
 insert into public.pharmflow_order_source_items(pharmacy_id,order_id,order_number,line_no,item_code,item_name,ordered_qty,group_name,category,sub_category,source_sheet,source_row)
 select p_pharmacy_id,v_order_id,upper(regexp_replace(trim(p_order_number),'\\s','','g')),(x->>'line_no')::integer,trim(x->>'item_code'),coalesce(x->>'item_name',''),(x->>'ordered_qty')::numeric,coalesce(x->>'group_name',''),coalesce(x->>'category',''),coalesce(x->>'sub_category',''),coalesce(x->>'source_sheet',''),nullif(x->>'source_row','')::integer
 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where nullif(trim(x->>'item_code'),'') is not null and coalesce((x->>'ordered_qty')::numeric,0)>0
 on conflict(order_id,line_no) do update set item_code=excluded.item_code,item_name=excluded.item_name,ordered_qty=excluded.ordered_qty,group_name=excluded.group_name,category=excluded.category,sub_category=excluded.sub_category,source_sheet=excluded.source_sheet,source_row=excluded.source_row;
 get diagnostics v_count=row_count;return v_count;
end $function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_order_source_items_v2(p_pharmacy_id uuid, p_order_number text)
 RETURNS SETOF pharmflow_order_source_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_order_source_items_v2',NULL);
 RETURN QUERY select i.* from public.pharmflow_order_source_items i where i.pharmacy_id=p_pharmacy_id
 and upper(regexp_replace(i.order_number,'\\s','','g'))=upper(regexp_replace(p_order_number,'\\s','','g'))
 and auth.uid() is not null and public.is_pharmacy_admin(p_pharmacy_id) order by i.line_no;
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.export_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_filters jsonb, p_resolved boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare result jsonb; filters jsonb:=coalesce(p_filters,'{}'::jsonb);
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'export_pharmflow_expiry_inventory_v1',NULL);

  perform pharmflow_expiry_private.valid_auth_session();
  if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required'; end if;
  if p_filters is null or p_resolved is null or jsonb_typeof(filters)<>'object'
     or (filters ? 'groups' and jsonb_typeof(filters->'groups')<>'array')
     or (filters ? 'departments' and jsonb_typeof(filters->'departments')<>'array')
     or (filters ? 'operators' and (jsonb_typeof(filters->'operators')<>'array' or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(filters->'operators')='array' then filters->'operators' else '[]'::jsonb end) v where jsonb_typeof(v)<>'string')))
     or (filters ? 'months' and jsonb_typeof(filters->'months')<>'array')
     or (filters ? 'include_unassigned' and jsonb_typeof(filters->'include_unassigned')<>'boolean') then
    raise exception 'Invalid inventory query';
  end if;
  select coalesce(jsonb_agg(pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(x)) order by x.expiry_year,x.expiry_month,x.item_name,x.row_id),'[]'::jsonb)
  into result
  from pharmflow_expiry_private.inventory_rows_group_v1(p_pharmacy_id,p_resolved) x
  where pharmflow_expiry_private.inventory_match_v1(case when coalesce(jsonb_array_length(filters->'operators'),0)>0 then pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(x)) else to_jsonb(x) end,filters);
  return result;
end
$function$;

CREATE OR REPLACE FUNCTION public.resolve_all_filtered_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_request_id uuid, p_filters jsonb, p_selection jsonb, p_expected_count integer, p_expected_units bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  expected_payload jsonb := jsonb_build_object('action','RESOLVE','selection',p_selection,'quantity',null);
  prior pharmflow_expiry_private.inventory_requests_v1%rowtype;
  prior_scope pharmflow_expiry_private.filtered_inventory_requests_v1%rowtype;
  current_scope jsonb;
  remaining_scope jsonb;
  result jsonb;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'resolve_all_filtered_pharmflow_expiry_inventory_v1',p_request_id::text);

  perform pharmflow_expiry_private.valid_auth_session();
  if public.is_pharmacy_member(p_pharmacy_id) is not true then
    raise exception 'Pharmacy access required';
  end if;
  if p_request_id is null or p_filters is null or jsonb_typeof(p_filters)<>'object'
     or p_selection is null or jsonb_typeof(p_selection)<>'array'
     or p_expected_count is null or p_expected_count<1
     or p_expected_units is null or p_expected_units<0
     or jsonb_array_length(p_selection)<>p_expected_count then
    raise exception 'Invalid filtered resolve confirmation';
  end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_selection) x)<>p_expected_count
     or exists(select 1 from jsonb_array_elements(p_selection) x
               where jsonb_typeof(x)<>'object' or nullif(x->>'id','') is null or nullif(x->>'version','') is null) then
    raise exception 'Invalid filtered resolve selection';
  end if;

  -- Serialize retries with the existing mutation RPC's durable request lock.
  perform pg_advisory_xact_lock(hashtextextended('expiry-inventory-request/'||p_request_id::text,0));
  select * into prior from pharmflow_expiry_private.inventory_requests_v1 where request_id=p_request_id;
  if found then
    if prior.pharmacy_id<>p_pharmacy_id or prior.created_by<>auth.uid()
       or prior.payload is distinct from expected_payload then
      raise exception 'Request payload conflict';
    end if;
    select * into prior_scope from pharmflow_expiry_private.filtered_inventory_requests_v1 where request_id=p_request_id;
    if not found or prior_scope.pharmacy_id<>p_pharmacy_id or prior_scope.created_by<>auth.uid()
       or prior_scope.filters is distinct from p_filters
       or prior_scope.expected_count<>p_expected_count
       or prior_scope.expected_units<>p_expected_units then
      raise exception 'Request scope conflict';
    end if;
    return prior.result;
  end if;

  current_scope := public.select_pharmflow_expiry_inventory_v1(
    p_pharmacy_id,p_filters,false,null
  );
  if (current_scope->>'count')::integer is distinct from p_expected_count
     or (current_scope->>'units')::bigint is distinct from p_expected_units
     or current_scope->'selection' is distinct from p_selection then
    raise exception 'Filtered inventory changed; refresh and confirm again';
  end if;

  -- Reuse the established mutation contract for item locks, version checks,
  -- resolved snapshots, per-row events and durable idempotency.
  result := public.mutate_pharmflow_expiry_inventory_v1(
    p_pharmacy_id,p_request_id,'RESOLVE',p_selection,null
  );

  -- The existing mutation locks and versions only the submitted rows. A new
  -- matching inventory row can appear after the preflight selection without
  -- sharing any of those item locks. Recheck inside the same transaction;
  -- if any matching active row remains, raising rolls back the whole mutation
  -- (including its events and idempotency record) so the user must reconfirm.
  remaining_scope := public.select_pharmflow_expiry_inventory_v1(
    p_pharmacy_id,p_filters,false,null
  );
  if (remaining_scope->>'count')::integer is distinct from 0
     or (remaining_scope->>'units')::bigint is distinct from 0
     or remaining_scope->'selection' is distinct from '[]'::jsonb then
    raise exception 'Filtered inventory changed during resolution; refresh and confirm again';
  end if;

  insert into pharmflow_expiry_private.filtered_inventory_requests_v1(
    request_id,pharmacy_id,created_by,filters,expected_count,expected_units
  ) values (
    p_request_id,p_pharmacy_id,auth.uid(),p_filters,p_expected_count,p_expected_units
  );
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_pharmflow_pharmacy_item_identifiers_v1(p_pharmacy_id uuid, p_item_code text)
 RETURNS TABLE(identifier_id uuid, identifier_display text, identifier_key text, mapping_revision bigint, item_code text, item_name text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',false,'list_pharmflow_pharmacy_item_identifiers_v1',NULL);

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 return query
 select m.id,m.identifier_display,m.identifier_key,m.mapping_revision,m.item_code,m.item_name,m.created_at,m.updated_at
 from public.pharmflow_pharmacy_gtin_v1 m
 where m.pharmacy_id=p_pharmacy_id and m.item_code=btrim(coalesce(p_item_code,''))
 order by m.created_at asc,m.identifier_key asc;
end
$function$;

CREATE OR REPLACE FUNCTION public.resolve_pharmflow_expiry_review_v2(p_pharmacy_id uuid, p_review_id uuid, p_operation_id uuid, p_item_code text, p_reason text, p_new_item jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
 r public.pharmflow_needs_review_v2%rowtype;
 item public.pharmflow_global_items_v2%rowtype;
 answer jsonb; global_result jsonb; can_global boolean;
 code text:=btrim(coalesce(p_item_code,'')); normalized_group text;
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'resolve_pharmflow_expiry_review_v2',p_operation_id::text);
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'resolve_pharmflow_expiry_review_v2',p_operation_id::text);

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
 -- Serialize both identifier creation paths before invoking either helper.
 PERFORM pg_advisory_xact_lock(hashtextextended(public.pharmflow_identifier_key_v2(
   coalesce(nullif(btrim(r.identifier_display),''),r.gtin)),1152));
 PERFORM pg_advisory_xact_lock(hashtextextended(public.pharmflow_identifier_key_v2(
   coalesce(nullif(btrim(r.identifier_display),''),r.gtin)),1153));
 IF p_new_item IS NOT NULL THEN
  global_result:=public.create_pharmflow_global_item_v2(p_operation_id,code,
    btrim(p_new_item->>'item_name'),normalized_group,NULL,NULL,
    coalesce(nullif(btrim(r.identifier_display),''),r.gtin),p_reason);
 ELSIF can_global THEN
  global_result:=public.add_pharmflow_global_identifier_v2(p_operation_id,
    coalesce(nullif(btrim(r.identifier_display),''),r.gtin),code,p_reason);
 END IF;
 answer:=public.resolve_pharmflow_expiry_review_v1(p_pharmacy_id,p_review_id,p_operation_id,code,p_reason);
 -- V1 reports the scope actually used, not an inference from caller privileges.
 RETURN answer||jsonb_build_object('global_item_created',p_new_item IS NOT NULL);
END $function$;

CREATE OR REPLACE FUNCTION public.correct_pharmflow_global_identifier_v2(p_operation_id uuid, p_identifier_id uuid, p_expected_mapping_revision bigint, p_new_item_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
 v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;
 v_reason text:=btrim(coalesce(p_reason,''));
 v_key text; v_request jsonb; v_result jsonb; v_old_code text;
 v_code text:=btrim(coalesce(p_new_item_code,''));
begin
 PERFORM pharmflow_auth_private.require_access(NULL,'GLOBAL',true,'correct_pharmflow_global_identifier_v2',p_operation_id::text);

 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required'; end if;
 if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_reason='' or v_code='' then
  raise exception 'Operation, selected mapping, revision, target item (for correction), and reason are required';
 end if;
 v_request:=jsonb_build_object('scope','GLOBAL','action','CORRECT','identifierId',p_identifier_id,'expectedRevision',p_expected_mapping_revision,'actor',auth.uid(),'reason',v_reason,'itemCode',v_code);
 -- Match Expiry/create/add lock ordering; never take a mapping row before its key.
 select identifier_key into v_key from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id;
 if v_key is not null then
  perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
  perform pg_advisory_xact_lock(hashtextextended(v_key,1153));
 end if;
 perform pg_advisory_xact_lock(hashtextextended('GLOBAL:'||p_operation_id::text,1168));
 select * into v_audit from public.pharmflow_identifier_mapping_audit_v1 where operation_id=p_operation_id;
 if found then
  if v_audit.management_request is distinct from v_request then
   raise exception 'Operation ID was already used with different mapping input';
  end if;
  return v_audit.management_result;
 end if;
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id for update;
 if not found then raise exception 'Selected identifier mapping not found in this scope'; end if;
 if v_mapping.mapping_revision<>p_expected_mapping_revision then
  raise exception 'Identifier mapping changed; reload before correcting or removing';
 end if;
 if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_code) then raise exception 'Global Item Code does not exist'; end if;
 v_old_code:=v_mapping.item_code;
 update public.pharmflow_global_item_identifiers_v2 set item_code=v_code,mapping_revision=mapping_revision+1,updated_at=now(),updated_by=auth.uid()
 where id=p_identifier_id and mapping_revision=p_expected_mapping_revision returning * into v_mapping;
 if not found then raise exception 'Identifier mapping changed; reload before correcting'; end if;
 v_result:=jsonb_build_object('success',true,'scope','GLOBAL','action','CORRECT','identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'itemCode',v_mapping.item_code);
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by,management_request,management_result)
 values(p_operation_id,'CORRECT',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,v_old_code,v_mapping.item_code,v_reason,auth.uid(),v_request,v_result);
 return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.remove_pharmflow_global_identifier_v2(p_operation_id uuid, p_identifier_id uuid, p_expected_mapping_revision bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
 v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;
 v_reason text:=btrim(coalesce(p_reason,''));
 v_key text; v_request jsonb; v_result jsonb; v_old_code text;
begin
 PERFORM pharmflow_auth_private.require_access(NULL,'GLOBAL',true,'remove_pharmflow_global_identifier_v2',p_operation_id::text);

 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required'; end if;
 if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_reason='' then
  raise exception 'Operation, selected mapping, revision, target item (for correction), and reason are required';
 end if;
 v_request:=jsonb_build_object('scope','GLOBAL','action','REMOVE','identifierId',p_identifier_id,'expectedRevision',p_expected_mapping_revision,'actor',auth.uid(),'reason',v_reason);
 -- Match Expiry/create/add lock ordering; never take a mapping row before its key.
 select identifier_key into v_key from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id;
 if v_key is not null then
  perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
  perform pg_advisory_xact_lock(hashtextextended(v_key,1153));
 end if;
 perform pg_advisory_xact_lock(hashtextextended('GLOBAL:'||p_operation_id::text,1168));
 select * into v_audit from public.pharmflow_identifier_mapping_audit_v1 where operation_id=p_operation_id;
 if found then
  if v_audit.management_request is distinct from v_request then
   raise exception 'Operation ID was already used with different mapping input';
  end if;
  return v_audit.management_result;
 end if;
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id for update;
 if not found then raise exception 'Selected identifier mapping not found in this scope'; end if;
 if v_mapping.mapping_revision<>p_expected_mapping_revision then
  raise exception 'Identifier mapping changed; reload before correcting or removing';
 end if;
 v_result:=jsonb_build_object('success',true,'scope','GLOBAL','action','REMOVE','identifierId',v_mapping.id,'removedIdentifierId',v_mapping.id,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'itemCode',v_mapping.item_code);
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by,management_request,management_result)
 values(p_operation_id,'REMOVE',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,v_mapping.item_code,null,v_reason,auth.uid(),v_request,v_result);
 -- Existing audit FK remains ON DELETE SET NULL; receipt retains exact selected ID.
 delete from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id and mapping_revision=p_expected_mapping_revision;
 return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.correct_pharmflow_pharmacy_identifier_v2(p_operation_id uuid, p_pharmacy_id uuid, p_identifier_id uuid, p_expected_mapping_revision bigint, p_new_item_code text, p_new_item_name text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
 v_audit public.pharmflow_pharmacy_identifier_mapping_audit_v2%rowtype;
 v_reason text:=btrim(coalesce(p_reason,''));
 v_key text; v_request jsonb; v_result jsonb; v_old_code text;
 v_code text:=btrim(coalesce(p_new_item_code,''));
 v_name text:=btrim(coalesce(p_new_item_name,''));
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'correct_pharmflow_pharmacy_identifier_v2',p_operation_id::text);

 if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access is required'; end if;
 if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_reason='' or v_code='' or v_name='' then
  raise exception 'Operation, selected mapping, revision, target item (for correction), and reason are required';
 end if;
 v_request:=jsonb_build_object('scope','PHARMACY','action','CORRECT','identifierId',p_identifier_id,'expectedRevision',p_expected_mapping_revision,'actor',auth.uid(),'reason',v_reason,'pharmacyId',p_pharmacy_id,'itemCode',v_code,'itemName',v_name);
 -- Match Expiry/create/add lock ordering; never take a mapping row before its key.
 select identifier_key into v_key from public.pharmflow_pharmacy_gtin_v1 where id=p_identifier_id and pharmacy_id=p_pharmacy_id;
 if v_key is not null then
  perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
  perform pg_advisory_xact_lock(hashtextextended(v_key,1153));
  perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||':'||v_key,1156));
 end if;
 perform pg_advisory_xact_lock(hashtextextended('PHARMACY:'||p_pharmacy_id::text||':'||p_operation_id::text,1168));
 select * into v_audit from public.pharmflow_pharmacy_identifier_mapping_audit_v2 where operation_id=p_operation_id and pharmacy_id=p_pharmacy_id;
 if found then
  if v_audit.management_request is distinct from v_request then
   raise exception 'Operation ID was already used with different mapping input';
  end if;
  return v_audit.result;
 end if;
 if (select count(*) from public.pharmflow_pharmacy_gtin_v1 where id=p_identifier_id and pharmacy_id=p_pharmacy_id)>1 then raise exception 'Ambiguous mapping ID; no mapping was changed'; end if;
 select * into v_mapping from public.pharmflow_pharmacy_gtin_v1 where id=p_identifier_id and pharmacy_id=p_pharmacy_id and identifier_key=v_key for update;
 if not found then raise exception 'Selected identifier mapping not found in this scope'; end if;
 if v_mapping.mapping_revision<>p_expected_mapping_revision then
  raise exception 'Identifier mapping changed; reload before correcting or removing';
 end if;
 v_old_code:=v_mapping.item_code;
 update public.pharmflow_pharmacy_gtin_v1 set item_code=v_code,item_name=v_name,mapping_revision=mapping_revision+1,updated_at=now(),updated_by=auth.uid()
 where id=p_identifier_id and pharmacy_id=p_pharmacy_id and identifier_key=v_key and mapping_revision=p_expected_mapping_revision returning * into v_mapping;
 if not found then raise exception 'Identifier mapping changed; reload before correcting'; end if;
 v_result:=jsonb_build_object('success',true,'scope','PHARMACY','action','CORRECT','identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'itemCode',v_mapping.item_code,'itemName',v_mapping.item_name);
 insert into public.pharmflow_pharmacy_identifier_mapping_audit_v2(pharmacy_id,operation_id,action,identifier_display,identifier_key,mapping_id,old_item_code,new_item_code,reason,result,performed_by,management_request)
 values(p_pharmacy_id,p_operation_id,'CORRECT',v_mapping.identifier_display,v_mapping.identifier_key,v_mapping.id,v_old_code,v_mapping.item_code,v_reason,v_result,auth.uid(),v_request);
 return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.append_pharmflow_learned_transaction_v4(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb, p_mapping_id uuid, p_mapping_revision bigint, p_mapping_scope text)
 RETURNS TABLE(acknowledged boolean, inserted boolean, authoritative_received bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
 v_scope text:=upper(btrim(coalesce(p_mapping_scope,'')));
 v_key text:=public.pharmflow_identifier_key_v2(p_gtin);
 v_kind text; v_existing public.pharmflow_receiving_transactions_v1%rowtype;
 v_mapping_id uuid; v_revision bigint; v_code text; v_ack record;
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'append_pharmflow_learned_transaction_v4',NULL);

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
END $function$;

CREATE OR REPLACE FUNCTION public.remove_pharmflow_pharmacy_identifier_v2(p_operation_id uuid, p_pharmacy_id uuid, p_identifier_id uuid, p_expected_mapping_revision bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
 v_audit public.pharmflow_pharmacy_identifier_mapping_audit_v2%rowtype;
 v_reason text:=btrim(coalesce(p_reason,''));
 v_key text; v_request jsonb; v_result jsonb; v_old_code text;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'remove_pharmflow_pharmacy_identifier_v2',p_operation_id::text);

 if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access is required'; end if;
 if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_reason='' then
  raise exception 'Operation, selected mapping, revision, target item (for correction), and reason are required';
 end if;
 v_request:=jsonb_build_object('scope','PHARMACY','action','REMOVE','identifierId',p_identifier_id,'expectedRevision',p_expected_mapping_revision,'actor',auth.uid(),'reason',v_reason,'pharmacyId',p_pharmacy_id);
 -- Match Expiry/create/add lock ordering; never take a mapping row before its key.
 select identifier_key into v_key from public.pharmflow_pharmacy_gtin_v1 where id=p_identifier_id and pharmacy_id=p_pharmacy_id;
 if v_key is not null then
  perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
  perform pg_advisory_xact_lock(hashtextextended(v_key,1153));
  perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||':'||v_key,1156));
 end if;
 perform pg_advisory_xact_lock(hashtextextended('PHARMACY:'||p_pharmacy_id::text||':'||p_operation_id::text,1168));
 select * into v_audit from public.pharmflow_pharmacy_identifier_mapping_audit_v2 where operation_id=p_operation_id and pharmacy_id=p_pharmacy_id;
 if found then
  if v_audit.management_request is distinct from v_request then
   raise exception 'Operation ID was already used with different mapping input';
  end if;
  return v_audit.result;
 end if;
 if (select count(*) from public.pharmflow_pharmacy_gtin_v1 where id=p_identifier_id and pharmacy_id=p_pharmacy_id)>1 then raise exception 'Ambiguous mapping ID; no mapping was changed'; end if;
 select * into v_mapping from public.pharmflow_pharmacy_gtin_v1 where id=p_identifier_id and pharmacy_id=p_pharmacy_id and identifier_key=v_key for update;
 if not found then raise exception 'Selected identifier mapping not found in this scope'; end if;
 if v_mapping.mapping_revision<>p_expected_mapping_revision then
  raise exception 'Identifier mapping changed; reload before correcting or removing';
 end if;
 v_result:=jsonb_build_object('success',true,'scope','PHARMACY','action','REMOVE','identifierId',v_mapping.id,'removedIdentifierId',v_mapping.id,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'itemCode',v_mapping.item_code);
 delete from public.pharmflow_pharmacy_gtin_v1 where id=p_identifier_id and pharmacy_id=p_pharmacy_id and identifier_key=v_key and mapping_revision=p_expected_mapping_revision;
 insert into public.pharmflow_pharmacy_identifier_mapping_audit_v2(pharmacy_id,operation_id,action,identifier_display,identifier_key,mapping_id,old_item_code,new_item_code,reason,result,performed_by,management_request)
 values(p_pharmacy_id,p_operation_id,'REMOVE',v_mapping.identifier_display,v_mapping.identifier_key,v_mapping.id,v_mapping.item_code,null,v_reason,v_result,auth.uid(),v_request);
 return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.save_pharmacy_expiry_worker(p_pharmacy_id uuid, p_worker_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare w public.pharmflow_expiry_workers_v1%rowtype;n text:=btrim(p_worker_name);
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmacy_expiry_worker',NULL);

 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true or public.is_pharmacy_admin(p_pharmacy_id) is not true then raise exception 'Pharmacy administrator required';end if;
 if n is null or length(n)<2 or length(n)>60 or n~'[[:cntrl:]]' then raise exception 'Enter an Operator name of 2 to 60 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-operators/'||p_pharmacy_id::text,0));
 select * into w from public.pharmflow_expiry_workers_v1 where pharmacy_id=p_pharmacy_id and lower(btrim(worker_name))=lower(n);
 if found then if not w.active then raise exception 'Operator name already exists (inactive)';end if;return to_jsonb(w);end if;
 insert into public.pharmflow_expiry_workers_v1(pharmacy_id,worker_name,active,created_by) values(p_pharmacy_id,n,true,auth.uid()) returning * into w;
 insert into pharmflow_expiry_private.operator_audit_v1(pharmacy_id,worker_id,actor,action,name) values(p_pharmacy_id,w.id,auth.uid(),'ADD',n);
 return to_jsonb(w);
end $function$;

