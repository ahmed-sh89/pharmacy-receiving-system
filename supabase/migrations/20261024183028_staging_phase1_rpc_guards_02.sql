CREATE OR REPLACE FUNCTION public.list_pharmflow_finalized_archives(p_pharmacy_id uuid)
 RETURNS TABLE(archive_id text, order_numbers text[], closed_at timestamp with time zone, archive_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_finalized_archives',NULL);
 RETURN QUERY select a.archive_id,a.order_numbers,a.closed_at,a.archive_payload
    from public.pharmflow_finalized_archives_v1 a
    where a.pharmacy_id=p_pharmacy_id
      and public.is_pharmacy_member(p_pharmacy_id)
    order by a.closed_at desc;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_pharmflow_global_items_v3(p_query text, p_limit integer DEFAULT 50)
 RETURNS TABLE(item_code text, item_name text, group_name text, category text, sub_category text, identifier_display text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'search_pharmflow_global_items_v3',NULL);

  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return query
  select i.item_code,i.item_name,i.group_name,i.category,i.sub_category,id.identifier_display
  from public.pharmflow_global_items_v2 i
  left join lateral (
    select x.identifier_display
    from public.pharmflow_global_item_identifiers_v2 x
    where x.item_code=i.item_code
    order by (x.identifier_display ~ '^[0-9]{8,14}$') desc,
             x.mapping_revision desc nulls last,x.updated_at desc nulls last,x.created_at desc nulls last
    limit 1
  ) id on true
  where btrim(coalesce(p_query,''))=''
     or i.item_code ilike '%'||btrim(p_query)||'%'
     or i.item_name ilike '%'||btrim(p_query)||'%'
     or exists(select 1 from public.pharmflow_global_item_identifiers_v2 sx where sx.item_code=i.item_code and sx.identifier_display ilike '%'||btrim(p_query)||'%')
  order by case when upper(i.item_code)=upper(btrim(p_query)) then 0 when upper(i.item_name)=upper(btrim(p_query)) then 1 when i.item_code ilike btrim(p_query)||'%' then 2 when i.item_name ilike btrim(p_query)||'%' then 3 else 4 end,i.item_name,i.item_code
  limit least(greatest(coalesce(p_limit,50),1),100);
end; $function$;

CREATE OR REPLACE FUNCTION public.get_global_master_gtin_meta()
 RETURNS TABLE(version text, source_file text, item_count integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'get_global_master_gtin_meta',NULL);

    if auth.uid() is null then raise exception 'Authentication required'; end if;
    return query
    select m.version,m.source_file,m.item_count,m.updated_at
    from public.pharmflow_global_gtin_meta_v1 m where m.singleton=true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_pharmflow_expiry_capture_receipts_v1(p_pharmacy_id uuid, p_device_id text, p_worker_id uuid, p_operation_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_rows jsonb;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmflow_expiry_capture_receipts_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then
  raise exception 'Pharmacy access required';
 end if;
 if nullif(btrim(p_device_id),'') is null or p_worker_id is null or p_operation_ids is null or cardinality(p_operation_ids)>15 then
  raise exception 'Device, operator and at most 15 operation IDs required';
 end if;
 select coalesce(jsonb_agg(q.receipt order by q.captured_at desc,q.operation_id desc),'[]'::jsonb)
 into v_rows from (
  select o.operation_id,coalesce(e.occurred_at,n.created_at,o.created_at) as captured_at,
   o.payload || jsonb_build_object(
    'operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,
    'acknowledgement',o.result,'captured_at',coalesce(e.occurred_at,n.created_at,o.created_at),
    'operator_name',coalesce(e.verified_by_name,d.worker_name,w.worker_name),
    'status',case when o.payload->>'kind'='UNKNOWN' then coalesce(n.status::text,'PENDING') else 'SAVED' end
   ) as receipt
  from pharmflow_expiry_private.operations o
  left join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>'event_id')::uuid and e.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_needs_review_v2 n on n.id=(o.result->>'review_id')::uuid and n.pharmacy_id=o.pharmacy_id
  left join pharmflow_expiry_private.review_details d on d.review_id=n.id and d.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_expiry_workers_v1 w on w.id=p_worker_id and w.pharmacy_id=o.pharmacy_id
  where o.pharmacy_id=p_pharmacy_id and o.created_by=auth.uid() and o.status='COMMITTED'
   and o.operation_id=any(p_operation_ids) and o.payload->>'source'='HANDHELD'
   and o.payload->>'device_id'=p_device_id and o.payload->>'worker_id'=p_worker_id::text
 ) q;
 return v_rows;
end $function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.search_pharmflow_global_items_v2(p_query text, p_limit integer DEFAULT 50)
 RETURNS TABLE(item_code text, item_name text, group_name text, category text, sub_category text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'search_pharmflow_global_items_v2',NULL);
 RETURN QUERY select
    i.item_code,
    i.item_name,
    i.group_name,
    i.category,
    i.sub_category
  from public.pharmflow_global_items_v2 i
  where
    btrim(coalesce(p_query,'')) = ''
    or i.item_code ilike '%' || btrim(p_query) || '%'
    or i.item_name ilike '%' || btrim(p_query) || '%'
  order by
    case
      when upper(i.item_code)=upper(btrim(p_query)) then 0
      when upper(i.item_name)=upper(btrim(p_query)) then 1
      when i.item_code ilike btrim(p_query)||'%' then 2
      when i.item_name ilike btrim(p_query)||'%' then 3
      else 4
    end,
    i.item_name,
    i.item_code
  limit least(greatest(coalesce(p_limit,50),1),100);
END;
$function$;

CREATE OR REPLACE FUNCTION public.count_pharmflow_expiry_reviews_v1(p_pharmacy_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_count bigint;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'count_pharmflow_expiry_reviews_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select count(*) into v_count from public.pharmflow_needs_review_v2 where pharmacy_id=p_pharmacy_id and workflow='EXPIRY' and status='PENDING';return v_count;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_pharmflow_expiry_review_v1(p_pharmacy_id uuid, p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_row public.pharmflow_needs_review_v2%rowtype;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'delete_pharmflow_expiry_review_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or p_review_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select * into v_row from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY' for update;
 if not found then raise exception 'Expiry review not found in authorized pharmacy';end if;
 if v_row.status='DELETED' then return jsonb_build_object('success',true,'review_id',p_review_id,'status','DELETED','already_deleted',true);end if;
 if v_row.status<>'PENDING' then raise exception 'Only pending Expiry review cases may be deleted';end if;
 update public.pharmflow_needs_review_v2 set status='DELETED',deleted_by=auth.uid(),deleted_at=clock_timestamp(),updated_at=clock_timestamp()
 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY' and status='PENDING';
 if not found then raise exception 'Expiry review changed; retry safely';end if;
 return jsonb_build_object('success',true,'review_id',p_review_id,'status','DELETED','already_deleted',false,'photo_cleanup_queued',true);
end $function$;

CREATE OR REPLACE FUNCTION public.delete_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_review_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'delete_pharmflow_needs_review_v2',NULL);

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
  perform 1 from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;

  update public.pharmflow_needs_review_v2 set status='DELETED',deleted_by=auth.uid(),deleted_at=now(),updated_at=now()
   where id=p_review_id and pharmacy_id=p_pharmacy_id and status='PENDING';
  return found;
end
$function$;

CREATE OR REPLACE FUNCTION public.get_global_master_gtin_page_v2(p_offset integer DEFAULT 0, p_limit integer DEFAULT 1000)
 RETURNS TABLE(item_code text, gtin text, item_name text, group_name text, category text, sub_category text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'get_global_master_gtin_page_v2',NULL);

    if auth.uid() is null then raise exception 'Authentication required'; end if;
    return query
    select g.item_code,g.gtin,g.item_name,g.group_name,g.category,g.sub_category
    from public.pharmflow_global_gtin_v1 g
    order by g.id
    offset greatest(coalesce(p_offset,0),0)
    limit least(greatest(coalesce(p_limit,1000),1),2000);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_pharmflow_needs_review_qty_v2(p_pharmacy_id uuid, p_review_id uuid, p_pending_quantity integer)
 RETURNS TABLE(review_id uuid, pending_quantity integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_qty integer:=greatest(coalesce(p_pending_quantity,1),1);
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'set_pharmflow_needs_review_qty_v2',NULL);

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
$function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_expiry_review_v1(p_pharmacy_id uuid, p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'get_pharmflow_expiry_review_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select o.payload||jsonb_build_object('review_id',r.id,'pharmacy_id',r.pharmacy_id,'identifier_key',r.identifier_key,'status',r.status,'created_by',r.created_by,'created_at',r.created_at,'review_reason',r.review_reason,'resolved_by',r.resolved_by,'resolved_item_code',r.resolved_item_code,'resolved_item_name',r.resolved_item_name,'resolved_at',r.resolved_at,'resolution_transaction_id',r.resolution_transaction_id,'worker_name',d.worker_name,'product_photo_path',d.product_photo_path,'expiry_photo_path',d.expiry_photo_path,'evidence_photo_path',coalesce(d.product_photo_path,d.expiry_photo_path),'product_photo_deleted',p.deleted_at is not null,'expiry_photo_deleted',e.deleted_at is not null,'evidence_photo_deleted',coalesce(p.deleted_at,e.deleted_at) is not null)
 into v_result from public.pharmflow_needs_review_v2 r join pharmflow_expiry_private.review_details d on d.review_id=r.id and d.pharmacy_id=r.pharmacy_id join pharmflow_expiry_private.operations o on o.pharmacy_id=d.pharmacy_id and o.operation_id=d.operation_id left join pharmflow_expiry_private.photos p on p.path=d.product_photo_path left join pharmflow_expiry_private.photos e on e.path=d.expiry_photo_path where r.id=p_review_id and r.pharmacy_id=p_pharmacy_id and r.workflow='EXPIRY';return v_result;
end $function$;

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
end $function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_expiry_review_contract_v1(p_pharmacy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'get_pharmflow_expiry_review_contract_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if to_regprocedure('public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb)') is null or to_regprocedure('public.get_pharmflow_expiry_review_v1(uuid,uuid)') is null or to_regprocedure('public.list_pharmflow_expiry_reviews_v1(uuid,text,integer,integer)') is null or to_regprocedure('public.count_pharmflow_expiry_reviews_v1(uuid)') is null or to_regprocedure('public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)') is null or to_regprocedure('public.add_pharmflow_global_identifier_v2(uuid,text,text,text)') is null or to_regprocedure('public.delete_pharmflow_expiry_review_v1(uuid,uuid)') is null or to_regprocedure('pharmflow_expiry_private.claim_photo_cleanup_jobs(integer)') is null or to_regprocedure('pharmflow_expiry_private.complete_photo_cleanup_job(uuid,text,uuid)') is null or to_regprocedure('pharmflow_expiry_private.fail_photo_cleanup_job(uuid,uuid,text)') is null or to_regclass('pharmflow_expiry_private.photo_cleanup_jobs') is null then raise exception 'Expiry review contract is incomplete';end if;
 return jsonb_build_object('contract_version','EXPIRY_NEEDS_REVIEW_20261010_V2');
end $function$;

CREATE OR REPLACE FUNCTION public.list_pharmflow_cloud_transactions_delta_v3(p_pharmacy_id uuid, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_transaction_id text DEFAULT NULL::text, p_limit integer DEFAULT 500)
 RETURNS TABLE(transaction_id text, order_number text, item_code text, item_name text, gtin text, quantity integer, source text, device_id text, occurred_at timestamp with time zone, payload jsonb, sync_created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_cloud_transactions_delta_v3',NULL);

    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    return query
    select t.transaction_id, t.order_number, t.item_code, t.item_name, t.gtin,
           t.quantity, t.source, t.device_id, t.occurred_at, t.payload, t.created_at
    from public.pharmflow_receiving_transactions_v1 t
    where t.pharmacy_id = p_pharmacy_id
      and (p_after_created_at is null or t.created_at > p_after_created_at
           or (t.created_at = p_after_created_at and
               t.transaction_id > coalesce(p_after_transaction_id, '')))
    order by t.created_at asc, t.transaction_id asc
    limit greatest(1, least(coalesce(p_limit, 500), 2000));
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_pharmflow_needs_review_v4(p_pharmacy_id uuid, p_workflow text DEFAULT 'RECEIVING'::text, p_order_number text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, workflow text, session_id text, order_number text, order_name text, gtin text, raw_barcode text, pending_quantity integer, review_reason text, master_item_code_hint text, master_item_name_hint text, photo_path text, source text, device_id text, created_at timestamp with time zone, identifier_display text, work_scope_order_numbers text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),false,'list_pharmflow_needs_review_v4',NULL);

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    return query
    select r.id, r.workflow, coalesce(r.session_id,''), coalesce(r.order_number,''),
           coalesce(r.order_name,''), r.gtin, coalesce(r.raw_barcode,''),
           r.pending_quantity, r.review_reason,
           coalesce(r.master_item_code_hint,''), coalesce(r.master_item_name_hint,''),
           coalesce(r.photo_path,''), r.source, coalesce(r.device_id,''), r.created_at,
           coalesce(r.identifier_display,r.gtin),
           coalesce(r.work_scope_order_numbers,
               case when nullif(btrim(coalesce(r.order_number,'')),'') is null
                    then array[]::text[] else array[r.order_number] end)
    from public.pharmflow_needs_review_v2 r
    where r.pharmacy_id=p_pharmacy_id
      and r.status='PENDING'
      and r.workflow=upper(trim(coalesce(p_workflow,'RECEIVING')))
      and (nullif(trim(coalesce(p_order_number,'')),'') is null
           or r.order_number=trim(p_order_number)
           or trim(p_order_number)=any(coalesce(r.work_scope_order_numbers,array[]::text[])))
    order by r.created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_pharmflow_cloud_workspace(p_pharmacy_id uuid, p_workspace jsonb, p_device_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_cloud_workspace',NULL);

  if auth.uid() is null or public.pharmflow_can_access_pharmacy(p_pharmacy_id) is not true then raise exception 'Pharmacy access required'; end if;
  insert into public.pharmflow_cloud_workspaces(pharmacy_id,workspace,updated_at,updated_by,device_id)
  values(p_pharmacy_id,coalesce(p_workspace,'{}'::jsonb),now(),auth.uid(),p_device_id)
  on conflict(pharmacy_id) do update set workspace=excluded.workspace,updated_at=now(),updated_by=auth.uid(),device_id=excluded.device_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_pharmflow_expiry_review_v1(p_pharmacy_id uuid, p_review_id uuid, p_operation_id uuid, p_item_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_details pharmflow_expiry_private.review_details%rowtype;
  v_capture jsonb;
  v_item public.pharmflow_global_items_v2%rowtype;
  v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_global_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_audit_mapping_id uuid;
  v_global_mapping_id uuid;
  v_mapping_scope text;
  v_audit public.pharmflow_expiry_review_resolution_audit_v1%rowtype;
  v_identifier text;
  v_key text;
  v_worker uuid;
  v_ack record;
  v_mapping_created boolean := false;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'resolve_pharmflow_expiry_review_v1',p_operation_id::text);
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'resolve_pharmflow_expiry_review_v1',p_operation_id::text);

  if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then
    raise exception 'Pharmacy access required';
  end if;
  if p_review_id is null or p_operation_id is null or nullif(btrim(coalesce(p_item_code,'')),'') is null then
    raise exception 'Review, operation, and selected Global Master item are required';
  end if;

  select * into v_review
    from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY'
   for update;
  if not found then raise exception 'Expiry review case not found in authorized pharmacy'; end if;

  if v_review.status='RESOLVED' then
    select * into v_audit from public.pharmflow_expiry_review_resolution_audit_v1
     where pharmacy_id=p_pharmacy_id and review_id=p_review_id for share;
    if v_review.resolution_transaction_id is distinct from p_operation_id::text
       or v_review.resolved_item_code is distinct from btrim(p_item_code) then
      raise exception 'Expiry review was already resolved under another operation or item';
    end if;
    return jsonb_build_object('success',true,'review_id',p_review_id,'item_code',v_review.resolved_item_code,
      'item_name',v_review.resolved_item_name,'operation_id',p_operation_id::text,'already_resolved',true,
      'state_id',v_audit.expiry_state_id,'event_id',v_audit.expiry_event_id,'scope',v_audit.mapping_scope);
  end if;
  if v_review.status<>'PENDING' then raise exception 'Only pending Expiry review cases may be resolved'; end if;

  select * into v_details from pharmflow_expiry_private.review_details
   where review_id=p_review_id and pharmacy_id=p_pharmacy_id;
  if not found then raise exception 'Expiry review capture details are unavailable'; end if;
  select o.payload into v_capture from pharmflow_expiry_private.operations o
   where o.pharmacy_id=p_pharmacy_id and o.operation_id=v_details.operation_id and o.status='COMMITTED';
  v_capture:=v_capture||coalesce((select c.facts from pharmflow_expiry_private.session_captures_v1 c where c.pharmacy_id=p_pharmacy_id and c.operation_id=v_details.operation_id),'{}'::jsonb);
  if v_capture is null or jsonb_typeof(v_capture)<>'object' then raise exception 'Committed Expiry capture payload is unavailable'; end if;
  if not (v_capture ?& array['quantity','expiry_month','expiry_year','source','device_id','batch_no','sample_serial','worker_id']) then
    raise exception 'Committed Expiry capture payload is incomplete';
  end if;

  select * into v_item from public.pharmflow_global_items_v2 where item_code=btrim(p_item_code);
  if not found then raise exception 'Selected Global Master item does not exist'; end if;
  v_identifier:=coalesce(nullif(btrim(v_review.identifier_display),''),nullif(btrim(v_review.gtin),''));
  v_key:=public.pharmflow_identifier_key_v2(v_identifier);
  if v_key='' then raise exception 'Expiry identifier is invalid'; end if;
  -- Same order in V2 and V1: Global ADD key, Global CREATE key, pharmacy key.
  -- Existing creation helpers keep their own approved lock namespaces.
  perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
  perform pg_advisory_xact_lock(hashtextextended(v_key,1153));
  perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||':'||v_key,1156));

  select * into v_global_mapping from public.pharmflow_global_item_identifiers_v2
   where identifier_key=v_key for share;

  select * into v_mapping from public.pharmflow_pharmacy_gtin_v1
   where pharmacy_id=p_pharmacy_id and identifier_key=v_key for update;
  if v_mapping.id is not null and v_mapping.item_code<>v_item.item_code then
    raise exception 'Identifier is already mapped to another item in this pharmacy';
  end if;
  if v_mapping.id is null and v_global_mapping.id is not null
     and v_global_mapping.item_code<>v_item.item_code then
    -- No silent creation of a new local override against another Global owner.
    -- A pre-existing, matching local override remains valid under pharmacy-first lookup.
    raise exception 'Global identifier is mapped to another Item Code; correct the mapping before resolving';
  end if;

  if v_mapping.id is null and v_global_mapping.id is not null
     and v_global_mapping.item_code=v_item.item_code then
    -- Global-only resolution: reference the REAL Global mapping, never a fake local ID.
    v_mapping_scope:='GLOBAL';
    v_audit_mapping_id:=v_global_mapping.id;
    v_global_mapping_id:=v_global_mapping.id;
  else
    if v_mapping.id is null then
      insert into public.pharmflow_pharmacy_gtin_v1
        (pharmacy_id,gtin,identifier_display,identifier_key,item_code,item_name,source,created_by,updated_by)
      values(p_pharmacy_id,v_identifier,v_identifier,v_key,v_item.item_code,v_item.item_name,'EXPIRY_REVIEW',auth.uid(),auth.uid())
      returning * into v_mapping;
      v_mapping_created:=true;
    end if;
    v_audit_mapping_id:=v_mapping.id;
    if v_global_mapping.id is not null and v_global_mapping.item_code=v_item.item_code then
      -- Preserve a legitimate existing local mapping; do not create or delete one.
      v_mapping_scope:='GLOBAL_AND_PHARMACY';
      v_global_mapping_id:=v_global_mapping.id;
    else
      v_mapping_scope:='PHARMACY';
      v_global_mapping_id:=null;
    end if;
  end if;

  v_worker:=nullif(v_capture->>'worker_id','')::uuid;
  select * into v_ack from pharmflow_expiry_private.save_known_core(
    p_pharmacy_id,v_item.item_code,v_item.item_name,v_identifier,
    coalesce(nullif(v_item.category,''),nullif(v_capture->>'category','')),
    coalesce((select c.quantity from pharmflow_expiry_private.session_captures_v1 c where c.pharmacy_id=p_pharmacy_id and c.operation_id=v_details.operation_id),(v_capture->>'quantity')::integer),(v_capture->>'expiry_month')::integer,(v_capture->>'expiry_year')::integer,
    v_worker,nullif(v_capture->>'batch_no',''),nullif(v_capture->>'sample_serial',''),
    nullif(v_capture->>'device_id',''),upper(v_capture->>'source'),'CAPTURE');
  if v_ack.state_id is null or v_ack.event_id is null then raise exception 'Expiry inventory acknowledgement was not created'; end if;

  update public.pharmflow_needs_review_v2
     set status='RESOLVED',resolved_by=auth.uid(),resolved_item_code=v_item.item_code,
         resolved_item_name=v_item.item_name,resolved_at=clock_timestamp(),
         resolution_transaction_id=p_operation_id::text,updated_at=clock_timestamp()
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY' and status='PENDING';
  if not found then raise exception 'Expiry review changed before resolution was committed'; end if;

  insert into public.pharmflow_expiry_review_resolution_audit_v1
    (pharmacy_id,review_id,operation_id,identifier_display,identifier_key,item_code,item_name,mapping_id,mapping_created,
     expiry_state_id,expiry_event_id,performed_by,mapping_scope,global_mapping_id)
  values(p_pharmacy_id,p_review_id,p_operation_id,v_identifier,v_key,v_item.item_code,v_item.item_name,v_audit_mapping_id,
    v_mapping_created,v_ack.state_id,v_ack.event_id,auth.uid(),v_mapping_scope,v_global_mapping_id);

  return jsonb_build_object('success',true,'review_id',p_review_id,'item_code',v_item.item_code,
    'item_name',v_item.item_name,'operation_id',p_operation_id::text,'already_resolved',false,
    'state_id',v_ack.state_id,'event_id',v_ack.event_id,'scope',v_mapping_scope,'photo_cleanup_queued',true,
    'mapping_created',v_mapping_created);
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_pharmflow_cloud_workspace_guarded(p_pharmacy_id uuid, p_workspace jsonb, p_device_id text, p_expected_generation bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_generation bigint;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_cloud_workspace_guarded',NULL);

  if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then
    raise exception 'Pharmacy access required';
  end if;
  insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation)
  values(p_pharmacy_id,0) on conflict(pharmacy_id) do nothing;
  select generation into v_generation from public.pharmflow_workspace_generation_v1
   where pharmacy_id=p_pharmacy_id for update;
  if coalesce(p_expected_generation,-1)<>coalesce(v_generation,0) then
    raise exception 'WORKSPACE_RESET_CONFLICT';
  end if;
  perform public.save_pharmflow_cloud_workspace(p_pharmacy_id,p_workspace,p_device_id);
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_pharmflow_active_order_manifest_v3(p_pharmacy_id uuid, p_manifest jsonb, p_expected_generation bigint)
 RETURNS TABLE(revision bigint, updated_at timestamp with time zone, order_files integer, order_items integer, workspace_generation bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_files integer; v_items integer; v_generation bigint;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_active_order_manifest_v3',NULL);

  if public.pharmflow_manifest_member_v2(p_pharmacy_id) is not true then
    raise exception 'Pharmacy access required';
  end if;
  insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation)
  values(p_pharmacy_id,0) on conflict(pharmacy_id) do nothing;
  select g.generation into v_generation from public.pharmflow_workspace_generation_v1 g
   where g.pharmacy_id=p_pharmacy_id for update;
  if coalesce(p_expected_generation,-1)<>coalesce(v_generation,0) then
    raise exception 'STALE_WORKSPACE_GENERATION';
  end if;
  v_files:=jsonb_array_length(coalesce(p_manifest->'orderFiles','[]'::jsonb));
  v_items:=jsonb_array_length(coalesce(p_manifest->'orderData','[]'::jsonb));
  if v_files<=0 or v_items<=0 then
    raise exception 'Active Order Manifest requires orderFiles and orderData';
  end if;
  insert into public.pharmflow_active_order_manifest_v1(pharmacy_id,manifest,revision,updated_at,updated_by,workspace_generation)
  values(p_pharmacy_id,p_manifest,1,now(),auth.uid(),v_generation)
  on conflict(pharmacy_id) do update set manifest=excluded.manifest,
    revision=public.pharmflow_active_order_manifest_v1.revision+1,
    updated_at=now(),updated_by=auth.uid(),workspace_generation=v_generation;
  return query select m.revision,m.updated_at,
    jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
    jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),m.workspace_generation
    from public.pharmflow_active_order_manifest_v1 m where m.pharmacy_id=p_pharmacy_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.append_pharmflow_cloud_transaction_v2(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'append_pharmflow_cloud_transaction_v2',NULL);

  if public.pharmflow_receiving_member_v2(p_pharmacy_id) is not true then
    raise exception 'Pharmacy access required';
  end if;
  if nullif(trim(coalesce(p_transaction_id,'')),'') is null then raise exception 'Transaction ID required'; end if;
  if nullif(trim(coalesce(p_item_code,'')),'') is null then raise exception 'Item Code required'; end if;
  insert into public.pharmflow_receiving_transactions_v1(
    pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload,created_by
  ) values(
    p_pharmacy_id,trim(p_transaction_id),nullif(trim(coalesce(p_order_number,'')),''),trim(p_item_code),
    coalesce(p_item_name,''),coalesce(p_gtin,''),coalesce(p_quantity,0),coalesce(p_source,'RECEIVING'),
    coalesce(p_device_id,''),coalesce(p_occurred_at,now()),coalesce(p_payload,'{}'::jsonb),auth.uid()
  ) on conflict(pharmacy_id,transaction_id) do nothing;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.open_pharmflow_expiry_session_v1(p_pharmacy_id uuid, p_session_id uuid, p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare s pharmflow_expiry_private.active_sessions_v1%rowtype;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'open_pharmflow_expiry_session_v1',NULL);

 if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_session_id is null or nullif(btrim(p_device_id),'') is null then raise exception 'Session and device required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-session/'||p_pharmacy_id::text||'/'||auth.uid()::text||'/'||p_device_id,0));
 if not exists(select 1 from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id) then
  update pharmflow_expiry_private.active_sessions_v1 set closed_at=clock_timestamp() where pharmacy_id=p_pharmacy_id and created_by=auth.uid() and device_id=p_device_id and closed_at is null;
  insert into pharmflow_expiry_private.active_sessions_v1(id,pharmacy_id,created_by,device_id) values(p_session_id,p_pharmacy_id,auth.uid(),p_device_id);
 end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id for update;
 if s.pharmacy_id<>p_pharmacy_id or s.created_by<>auth.uid() or s.device_id<>p_device_id then raise exception 'Session scope mismatch';end if;
 if s.closed_at is not null then raise exception 'Session closed';end if;
 return jsonb_build_object('session_id',s.id,'status','OPEN');
end $function$;

CREATE OR REPLACE FUNCTION public.close_pharmflow_expiry_session_v1(p_pharmacy_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'close_pharmflow_expiry_session_v1',NULL);

 if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 perform 1 from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id and pharmacy_id=p_pharmacy_id and created_by=auth.uid() for update;
 if not found then raise exception 'Session scope mismatch';end if;
 update pharmflow_expiry_private.active_sessions_v1 set closed_at=coalesce(closed_at,clock_timestamp()) where id=p_session_id;
 return jsonb_build_object('session_id',p_session_id,'status','CLOSED');
end $function$;

CREATE OR REPLACE FUNCTION public.correct_pharmflow_expiry_session_v1(p_pharmacy_id uuid, p_session_id uuid, p_operation_id uuid, p_request_id uuid, p_expected_revision integer, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare s pharmflow_expiry_private.active_sessions_v1%rowtype;c pharmflow_expiry_private.session_captures_v1%rowtype;o pharmflow_expiry_private.operations%rowtype;
 a pharmflow_expiry_private.session_adjustments_v1%rowtype;e public.pharmflow_expiry_events_v1%rowtype;v public.pharmflow_expiry_current_state_v1%rowtype;r jsonb;ack record;total integer;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'correct_pharmflow_expiry_session_v1',p_operation_id::text);

 if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_request_id is null or p_quantity is null or p_quantity<0 or p_expected_revision is null then raise exception 'Valid correction required';end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id for update;
 if not found or s.pharmacy_id<>p_pharmacy_id or s.created_by<>auth.uid() then raise exception 'Session scope mismatch';end if;
 select * into a from pharmflow_expiry_private.session_adjustments_v1 where request_id=p_request_id;
 if found then
  if a.session_id<>p_session_id or a.operation_id<>p_operation_id or a.created_by<>auth.uid() or a.quantity<>p_quantity or a.expected_revision<>p_expected_revision then raise exception 'Correction payload conflict';end if;
  return a.result;
 end if;
 if s.closed_at is not null then raise exception 'Session closed';end if;
 select * into c from pharmflow_expiry_private.session_captures_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and session_id=p_session_id for update;
 if not found or c.quantity=0 then raise exception 'Operation not editable';end if;
 if c.revision<>p_expected_revision then raise exception 'Stale revision; reload History';end if;
 select * into o from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if o.created_by<>auth.uid() then raise exception 'Operation scope mismatch';end if;
 if o.payload->>'kind'='UNKNOWN' then
  perform 1 from public.pharmflow_needs_review_v2 n where n.id=(o.result->>'review_id')::uuid and n.pharmacy_id=p_pharmacy_id and n.status='PENDING' for update;
  if not found then raise exception 'Only pending review operations are editable';end if;
  if p_quantity=0 then perform public.delete_pharmflow_expiry_review_v1(p_pharmacy_id,(o.result->>'review_id')::uuid);end if;
  r:=jsonb_build_object('operation_id',p_operation_id,'request_id',p_request_id,'quantity',p_quantity,'revision',c.revision+1);
  insert into pharmflow_expiry_private.session_adjustments_v1(request_id,session_id,operation_id,created_by,previous_quantity,quantity,expected_revision,result) values(p_request_id,p_session_id,p_operation_id,auth.uid(),c.quantity,p_quantity,p_expected_revision,r);
  update pharmflow_expiry_private.session_captures_v1 set quantity=p_quantity,revision=revision+1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
  return r;
 end if;
 if o.payload->>'kind' is distinct from 'KNOWN' then raise exception 'Unsupported operation';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'/item/'||btrim(o.payload->>'item_code')||'/'||upper(btrim(coalesce(o.payload->>'batch_no','')))||'/'||(o.payload->>'expiry_year')||'/'||(o.payload->>'expiry_month'),0));
 select * into e from public.pharmflow_expiry_events_v1 where id=(o.result->>'event_id')::uuid;
 select * into v from public.pharmflow_expiry_current_state_v1 where id=(o.result->>'state_id')::uuid and pharmacy_id=p_pharmacy_id for update;
 if not found then raise exception 'Inventory unavailable';end if;
 -- An independent recount supersedes additive contributions. Never reverse it.
 if exists(select 1 from public.pharmflow_expiry_events_v1 x where x.state_id=v.id and x.occurred_at>=e.occurred_at and x.event_type in ('RECOUNT','CLEARED') and not exists(select 1 from pharmflow_expiry_private.session_adjustments_v1 y where y.event_id=x.id)) then raise exception 'Inventory recounted; operation is read only';end if;
 total:=v.verified_quantity-c.quantity+p_quantity;
 if total<0 then raise exception 'Correction would make inventory negative';end if;
 select * into ack from pharmflow_expiry_private.save_known_core(p_pharmacy_id,v.item_code,v.item_name,v.identifier_display,v.category,total,v.expiry_month,v.expiry_year,(o.payload->>'worker_id')::uuid,v.batch_no,v.sample_serial,o.payload->>'device_id','HANDHELD',case when total=0 then 'CLEARED' else 'RECOUNT' end);
 r:=jsonb_build_object('operation_id',p_operation_id,'request_id',p_request_id,'quantity',p_quantity,'revision',c.revision+1,'state_id',v.id,'event_id',ack.event_id);
 insert into pharmflow_expiry_private.session_adjustments_v1(request_id,session_id,operation_id,created_by,previous_quantity,quantity,expected_revision,result,event_id) values(p_request_id,p_session_id,p_operation_id,auth.uid(),c.quantity,p_quantity,p_expected_revision,r,ack.event_id);
 update pharmflow_expiry_private.session_captures_v1 set quantity=p_quantity,revision=revision+1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 return r;
end $function$;

CREATE OR REPLACE FUNCTION public.list_pharmflow_expiry_session_v1(p_pharmacy_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare s pharmflow_expiry_private.active_sessions_v1%rowtype;r jsonb;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmflow_expiry_session_v1',NULL);

 if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id and pharmacy_id=p_pharmacy_id and created_by=auth.uid();
 if not found then raise exception 'Session scope mismatch';end if;
 select coalesce(jsonb_agg(o.payload||jsonb_build_object('operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,'acknowledgement',o.result,'quantity',c.quantity,'revision',c.revision,'captured_at',o.created_at,'status',case when c.quantity=0 then 'DELETED' when o.payload->>'kind'='UNKNOWN' then (select n.status from public.pharmflow_needs_review_v2 n where n.id=(o.result->>'review_id')::uuid) else 'SAVED' end,'editable',s.closed_at is null and c.quantity>0 and (o.payload->>'kind'='KNOWN' or exists(select 1 from public.pharmflow_needs_review_v2 n where n.id=(o.result->>'review_id')::uuid and n.status='PENDING'))) order by o.created_at desc,o.operation_id),'[]'::jsonb) into r
 from pharmflow_expiry_private.session_captures_v1 c join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id) where c.session_id=s.id;
 return r;
end $function$;

