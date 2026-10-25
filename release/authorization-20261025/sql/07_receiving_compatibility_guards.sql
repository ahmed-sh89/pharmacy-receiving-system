-- Production definitions + authorization only. Original bodies follow the guard unchanged.
CREATE OR REPLACE FUNCTION public.append_pharmflow_cloud_transaction(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'append_pharmflow_cloud_transaction');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if nullif(trim(coalesce(p_transaction_id,'')),'') is null then
        raise exception 'Transaction ID required';
    end if;

    if nullif(trim(coalesce(p_item_code,'')),'') is null then
        raise exception 'Item Code required';
    end if;

    insert into public.pharmflow_receiving_transactions_v1(
        pharmacy_id,transaction_id,order_number,item_code,item_name,
        gtin,quantity,source,device_id,occurred_at,payload,created_by
    )
    values(
        p_pharmacy_id,
        trim(p_transaction_id),
        nullif(trim(coalesce(p_order_number,'')),''),
        trim(p_item_code),
        coalesce(p_item_name,''),
        coalesce(p_gtin,''),
        coalesce(p_quantity,0),
        coalesce(p_source,'RECEIVING'),
        coalesce(p_device_id,''),
        coalesce(p_occurred_at,now()),
        coalesce(p_payload,'{}'::jsonb),
        auth.uid()
    )
    on conflict(pharmacy_id,transaction_id) do nothing;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.append_pharmflow_cloud_transaction(uuid,text,text,text,text,text,integer,text,text,timestamp with time zone,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_pharmflow_cloud_transaction(uuid,text,text,text,text,text,integer,text,text,timestamp with time zone,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.append_pharmflow_cloud_transaction(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity numeric, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'append_pharmflow_cloud_transaction');

    if not public.pharmflow_can_access_pharmacy(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
    insert into public.pharmflow_cloud_transactions(pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload)
    values(p_pharmacy_id,p_transaction_id,p_order_number,p_item_code,p_item_name,p_gtin,coalesce(p_quantity,0),p_source,p_device_id,coalesce(p_occurred_at,now()),coalesce(p_payload,'{}'::jsonb))
    on conflict(pharmacy_id,transaction_id) do nothing;
end;$function$
;
REVOKE ALL ON FUNCTION public.append_pharmflow_cloud_transaction(uuid,text,text,text,text,text,numeric,text,text,timestamp with time zone,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_pharmflow_cloud_transaction(uuid,text,text,text,text,text,numeric,text,text,timestamp with time zone,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_pharmflow_cloud_transaction(uuid,text,text,text,text,text,numeric,text,text,timestamp with time zone,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.append_pharmflow_cloud_transaction(uuid,text,text,text,text,text,numeric,text,text,timestamp with time zone,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.append_pharmflow_learned_transaction_v3(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb, p_mapping_id uuid, p_mapping_revision bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_identifier_display text := btrim(coalesce(p_gtin,''));
  v_identifier_key text := public.pharmflow_identifier_key_v2(p_gtin);
  v_item_code text := trim(coalesce(p_item_code,''));
  v_transaction_id text := trim(coalesce(p_transaction_id,''));
  v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_existing public.pharmflow_receiving_transactions_v1%rowtype;
  v_intent_id uuid;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'append_pharmflow_learned_transaction_v3');

  if not public.pharmflow_gtin_lifecycle_member_v3(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  if v_transaction_id='' or v_identifier_key='' or v_item_code='' or p_mapping_id is null or coalesce(p_mapping_revision,0)<=0 or coalesce(p_quantity,0)<=0 then raise exception 'Valid transaction, learned mapping, item, identifier and positive quantity are required'; end if;

  lock table public.pharmflow_pharmacy_gtin_v1 in share mode;
  select * into v_mapping
    from public.pharmflow_pharmacy_gtin_v1 g
   where g.pharmacy_id=p_pharmacy_id
     and g.id=p_mapping_id
     and g.mapping_revision=p_mapping_revision
     and g.identifier_key=v_identifier_key
     and upper(trim(g.item_code))=upper(v_item_code)
   for share;
  if v_mapping.id is null then raise exception 'Learned mapping changed; resolve the identifier again'; end if;

  if coalesce(p_payload #>> '{gtinResolution,kind}','')<>'PHARMACY_LEARNED'
     or coalesce(p_payload #>> '{gtinResolution,mappingId}','')<>p_mapping_id::text
     or coalesce(p_payload #>> '{gtinResolution,mappingRevision}','')<>p_mapping_revision::text
     or public.pharmflow_identifier_key_v2(coalesce(p_payload #>> '{gtinResolution,identifierKey}',p_payload #>> '{gtinResolution,normalizedGtin}',''))<>v_identifier_key
     or upper(trim(coalesce(p_payload #>> '{gtinResolution,resolvedItemCode}','')))<>upper(v_item_code) then
    raise exception 'Learned transaction provenance does not match the authoritative mapping';
  end if;

  insert into public.pharmflow_receiving_transactions_v1(
    pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,
    source,device_id,occurred_at,payload,created_by
  )
  values(
    p_pharmacy_id,v_transaction_id,nullif(trim(coalesce(p_order_number,'')),''),
    v_item_code,coalesce(p_item_name,''),v_identifier_display,p_quantity,
    coalesce(p_source,'SCANNER'),coalesce(p_device_id,''),coalesce(p_occurred_at,now()),
    coalesce(p_payload,'{}'::jsonb),auth.uid()
  ) on conflict(pharmacy_id,transaction_id) do nothing;

  if not found then
    select * into v_existing
      from public.pharmflow_receiving_transactions_v1 t
     where t.pharmacy_id=p_pharmacy_id and t.transaction_id=v_transaction_id;
    if v_existing.transaction_id is null
       or coalesce(v_existing.order_number,'')<>coalesce(nullif(trim(p_order_number),''),'')
       or upper(trim(v_existing.item_code))<>upper(v_item_code)
       or public.pharmflow_identifier_key_v2(v_existing.gtin)<>v_identifier_key
       or v_existing.quantity<>p_quantity
       or coalesce(v_existing.payload #>> '{gtinResolution,mappingId}','')<>p_mapping_id::text
       or coalesce(v_existing.payload #>> '{gtinResolution,mappingRevision}','')<>p_mapping_revision::text then
      raise exception 'Transaction ID already exists with different learned-scan data';
    end if;
  end if;

  /* Keep finalizer failure isolated from the committed, idempotent receipt.
     A later idempotent queue delivery re-enters this same block safely. */
  for v_intent_id in
    select id
      from public.pharmflow_needs_review_resolution_intents_v1
     where pharmacy_id=p_pharmacy_id
       and transaction_id=v_transaction_id
       and status='PENDING'
  loop
    begin
      perform public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_intent_id);
    exception when others then
      begin
        update public.pharmflow_needs_review_resolution_intents_v1
           set helper_failure_code=SQLSTATE,
               helper_failure_detail=SQLERRM,
               helper_failure_at=now(),
               helper_failure_count=helper_failure_count+1,
               updated_at=now()
         where id=v_intent_id and status='PENDING';
      exception when others then
        raise warning 'Needs Review intent helper failed after learned receipt %, and failure state could not be recorded: %',v_transaction_id,SQLERRM;
      end;
      raise warning 'Needs Review intent helper failed after learned receipt %: %',v_transaction_id,SQLERRM;
    end;
  end loop;

  return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.append_pharmflow_learned_transaction_v3(uuid,text,text,text,text,text,integer,text,text,timestamp with time zone,jsonb,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_pharmflow_learned_transaction_v3(uuid,text,text,text,text,text,integer,text,text,timestamp with time zone,jsonb,uuid,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.atomic_reset_pharmflow_current_workspace(p_pharmacy_id uuid, p_confirmation text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_generation bigint;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'atomic_reset_pharmflow_current_workspace');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if upper(trim(coalesce(p_confirmation,''))) <> 'RESET CURRENT WORKSPACE' then
        raise exception 'Invalid reset confirmation';
    end if;

    insert into public.pharmflow_workspace_generation_v1(
        pharmacy_id,generation,reset_at,reset_by,updated_at
    )
    values(
        p_pharmacy_id,1,now(),auth.uid(),now()
    )
    on conflict(pharmacy_id)
    do update set
        generation=public.pharmflow_workspace_generation_v1.generation+1,
        reset_at=now(),
        reset_by=auth.uid(),
        updated_at=now()
    returning generation into v_generation;

    -- Discard ONLY unfinished order source + registry rows.
    delete from public.pharmflow_order_source_items s
    using public.pharmflow_orders o
    where s.pharmacy_id=p_pharmacy_id
      and o.pharmacy_id=p_pharmacy_id
      and upper(trim(s.order_number))=upper(trim(o.order_number))
      and lower(trim(coalesce(o.status,'uploaded'))) not in
          ('received','finalized','closed');

    delete from public.pharmflow_orders o
    where o.pharmacy_id=p_pharmacy_id
      and lower(trim(coalesce(o.status,'uploaded'))) not in
          ('received','finalized','closed');

    -- Clear the shared current workspace in the SAME server transaction.
    perform public.clear_pharmflow_cloud_workspace(p_pharmacy_id);

    return v_generation;
end;
$function$
;
REVOKE ALL ON FUNCTION public.atomic_reset_pharmflow_current_workspace(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reset_pharmflow_current_workspace(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.atomic_reset_pharmflow_current_workspace_v3(p_pharmacy_id uuid, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_generation bigint; v_orders bigint:=0; v_sources bigint:=0; v_manifest bigint:=0; v_receiving bigint:=0; v_reviews bigint:=0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'atomic_reset_pharmflow_current_workspace_v3');

  if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  if upper(trim(coalesce(p_confirmation,'')))<>'RESET CURRENT WORKSPACE' then raise exception 'Invalid reset confirmation'; end if;
  insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation,reset_at,reset_by,updated_at)
  values(p_pharmacy_id,1,now(),auth.uid(),now()) on conflict(pharmacy_id) do update
  set generation=public.pharmflow_workspace_generation_v1.generation+1,reset_at=now(),reset_by=auth.uid(),updated_at=now()
  returning generation into v_generation;
  delete from public.pharmflow_order_source_items s using public.pharmflow_orders o
   where s.pharmacy_id=p_pharmacy_id and o.pharmacy_id=p_pharmacy_id
     and upper(trim(s.order_number))=upper(trim(o.order_number))
     and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');
  get diagnostics v_sources=row_count;
  delete from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and lower(trim(coalesce(status,'uploaded'))) not in ('received','finalized','closed');
  get diagnostics v_orders=row_count;
  delete from public.pharmflow_active_order_manifest_v1 where pharmacy_id=p_pharmacy_id; get diagnostics v_manifest=row_count;
  delete from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id; get diagnostics v_receiving=row_count;
  update public.pharmflow_needs_review_v2 set status='DELETED',photo_path=null,updated_at=now()
   where pharmacy_id=p_pharmacy_id and workflow='RECEIVING' and status='PENDING'; get diagnostics v_reviews=row_count;
  perform public.clear_pharmflow_cloud_workspace(p_pharmacy_id);
  return jsonb_build_object('success',true,'generation',v_generation,'active_orders_deleted',v_orders,'source_rows_deleted',v_sources,'manifest_rows_deleted',v_manifest,'receiving_transactions_deleted',v_receiving,'needs_review_deleted',v_reviews,'reset_at',now());
end;$function$
;
REVOKE ALL ON FUNCTION public.atomic_reset_pharmflow_current_workspace_v3(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reset_pharmflow_current_workspace_v3(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.atomic_reset_pharmflow_current_workspace_v4(p_pharmacy_id uuid, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_generation bigint;
    v_orders bigint:=0;
    v_sources bigint:=0;
    v_manifest bigint:=0;
    v_receiving bigint:=0;
    v_reviews bigint:=0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'atomic_reset_pharmflow_current_workspace_v4');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if upper(trim(coalesce(p_confirmation,''))) <> 'RESET CURRENT WORKSPACE' then
        raise exception 'Invalid reset confirmation';
    end if;

    insert into public.pharmflow_workspace_generation_v1(
        pharmacy_id,generation,reset_at,reset_by,updated_at
    )
    values(p_pharmacy_id,1,now(),auth.uid(),now())
    on conflict(pharmacy_id) do update
    set generation=public.pharmflow_workspace_generation_v1.generation+1,
        reset_at=now(),reset_by=auth.uid(),updated_at=now()
    returning generation into v_generation;

    delete from public.pharmflow_order_source_items s
    using public.pharmflow_orders o
    where s.pharmacy_id=p_pharmacy_id
      and o.pharmacy_id=p_pharmacy_id
      and upper(trim(s.order_number))=upper(trim(o.order_number))
      and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');
    get diagnostics v_sources=row_count;

    delete from public.pharmflow_orders
    where pharmacy_id=p_pharmacy_id
      and lower(trim(coalesce(status,'uploaded'))) not in ('received','finalized','closed');
    get diagnostics v_orders=row_count;

    delete from public.pharmflow_active_order_manifest_v1
    where pharmacy_id=p_pharmacy_id;
    get diagnostics v_manifest=row_count;

    delete from public.pharmflow_receiving_transactions_v1
    where pharmacy_id=p_pharmacy_id;
    get diagnostics v_receiving=row_count;

    update public.pharmflow_needs_review_v2
       set status='DELETED',photo_path=null,updated_at=now()
     where pharmacy_id=p_pharmacy_id
       and workflow='RECEIVING'
       and status='PENDING';
    get diagnostics v_reviews=row_count;

    perform public.clear_pharmflow_cloud_workspace(p_pharmacy_id);

    return jsonb_build_object(
        'success',true,
        'generation',v_generation,
        'active_orders_deleted',v_orders,
        'source_rows_deleted',v_sources,
        'manifest_rows_deleted',v_manifest,
        'receiving_transactions_deleted',v_receiving,
        'needs_review_deleted',v_reviews,
        'reset_at',now()
    );
end;
$function$
;
REVOKE ALL ON FUNCTION public.atomic_reset_pharmflow_current_workspace_v4(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reset_pharmflow_current_workspace_v4(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_active_order_manifest(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_active_order_manifest');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    delete from public.pharmflow_active_order_manifest_v1
    where pharmacy_id=p_pharmacy_id;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_active_order_manifest(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_active_order_manifest(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_active_order_manifest_v2(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_active_order_manifest_v2');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    delete from public.pharmflow_active_order_manifest_v1
    where pharmacy_id=p_pharmacy_id;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_active_order_manifest_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_active_order_manifest_v2(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_cloud_workspace(p_pharmacy_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_cloud_workspace');

    if not public.pharmflow_can_access_pharmacy(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
    delete from public.pharmflow_cloud_transactions where pharmacy_id=p_pharmacy_id;
    delete from public.pharmflow_cloud_workspaces where pharmacy_id=p_pharmacy_id;
end;$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_cloud_workspace(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_cloud_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_cloud_workspace(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_cloud_workspace(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_receiving_needs_review_v2(p_pharmacy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
declare
    v_photos bigint:=0;
    v_reviews bigint:=0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_receiving_needs_review_v2');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    delete from storage.objects o
     where o.bucket_id='pharmflow-needs-review'
       and o.name in (
           select r.photo_path
             from public.pharmflow_needs_review_v2 r
            where r.pharmacy_id=p_pharmacy_id
              and r.workflow='RECEIVING'
              and r.photo_path is not null
       );
    get diagnostics v_photos=row_count;

    update public.pharmflow_needs_review_v2 r
       set status='DELETED', photo_path=null, updated_at=now()
     where r.pharmacy_id=p_pharmacy_id
       and r.workflow='RECEIVING'
       and r.status='PENDING';
    get diagnostics v_reviews=row_count;

    return jsonb_build_object(
        'success',true,
        'reviews_cleared',v_reviews,
        'photos_deleted',v_photos
    );
end;
$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_receiving_needs_review_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_receiving_needs_review_v2(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_receiving_needs_review_v3(p_pharmacy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_reviews bigint:=0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_receiving_needs_review_v3');

  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  update public.pharmflow_needs_review_v2
     set status='DELETED', photo_path=null, updated_at=now()
   where pharmacy_id=p_pharmacy_id and workflow='RECEIVING' and status='PENDING';
  get diagnostics v_reviews=row_count;
  return jsonb_build_object('success',true,'reviews_cleared',v_reviews);
end;$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_receiving_needs_review_v3(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_receiving_needs_review_v3(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_receiving_transactions(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_receiving_transactions');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    delete from public.pharmflow_receiving_transactions_v1
    where pharmacy_id=p_pharmacy_id;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_receiving_transactions(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_receiving_transactions(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_receiving_transactions_v2(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_receiving_transactions_v2');

    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    delete from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id;
    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_receiving_transactions_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_receiving_transactions_v2(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.count_pharmflow_needs_review_scope_v3(p_pharmacy_id uuid, p_workflow text DEFAULT 'RECEIVING'::text, p_order_numbers text[] DEFAULT NULL::text[])
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_count integer;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,upper(nullif(trim(p_workflow),'')),false,'count_pharmflow_needs_review_scope_v3');

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 select count(*)::integer into v_count from (
   select r.gtin,coalesce(r.order_number,''),r.review_reason
   from public.pharmflow_needs_review_v2 r
   where r.pharmacy_id=p_pharmacy_id and r.status='PENDING'
     and r.workflow=upper(trim(coalesce(p_workflow,'RECEIVING')))
     and coalesce(array_length(p_order_numbers,1),0)>0
     and r.order_number=any(p_order_numbers)
   group by r.gtin,coalesce(r.order_number,''),r.review_reason
 ) g;
 return coalesce(v_count,0);
end $function$
;
REVOKE ALL ON FUNCTION public.count_pharmflow_needs_review_scope_v3(uuid,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.count_pharmflow_needs_review_scope_v3(uuid,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_pharmflow_needs_review_scope_v3(uuid,text,text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.count_pharmflow_needs_review_scope_v3(uuid,text,text[]) TO service_role;
CREATE OR REPLACE FUNCTION public.create_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_workflow text, p_gtin text, p_raw_barcode text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_review_reason text DEFAULT 'UNKNOWN_GTIN'::text, p_master_item_code_hint text DEFAULT NULL::text, p_master_item_name_hint text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_device_id text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_id uuid;
    v_time timestamptz;
    v_gtin text := regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g');
    v_workflow text := upper(trim(coalesce(p_workflow,'RECEIVING')));
    v_reason text := upper(trim(coalesce(p_review_reason,'UNKNOWN_GTIN')));
    v_source text := upper(trim(coalesce(p_source,'HANDHELD')));
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,upper(nullif(trim(p_workflow),'')),true,'create_pharmflow_needs_review_v2');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if v_gtin = '' then
        raise exception 'GTIN is required';
    end if;

    if v_workflow not in ('RECEIVING','EXPIRY') then
        raise exception 'Invalid workflow';
    end if;

    if v_reason not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then
        raise exception 'Invalid review reason';
    end if;

    if v_source not in ('HANDHELD','PC') then
        raise exception 'Invalid source';
    end if;

    insert into public.pharmflow_needs_review_v2 (
        pharmacy_id,
        workflow,
        session_id,
        order_number,
        order_name,
        gtin,
        raw_barcode,
        pending_quantity,
        review_reason,
        master_item_code_hint,
        master_item_name_hint,
        source,
        device_id,
        created_by
    )
    values (
        p_pharmacy_id,
        v_workflow,
        nullif(trim(coalesce(p_session_id,'')),''),
        nullif(trim(coalesce(p_order_number,'')),''),
        nullif(trim(coalesce(p_order_name,'')),''),
        v_gtin,
        nullif(p_raw_barcode,''),
        1,
        v_reason,
        nullif(trim(coalesce(p_master_item_code_hint,'')),''),
        nullif(trim(coalesce(p_master_item_name_hint,'')),''),
        v_source,
        nullif(trim(coalesce(p_device_id,'')),''),
        auth.uid()
    )
    returning id, pharmflow_needs_review_v2.created_at
    into v_id, v_time;

    return query select v_id, 1, v_time;
end;
$function$
;
REVOKE ALL ON FUNCTION public.create_pharmflow_needs_review_v2(uuid,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pharmflow_needs_review_v2(uuid,text,text,text,text,text,text,text,text,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.create_pharmflow_needs_review_v5(p_operation_id text, p_pharmacy_id uuid, p_workflow text, p_identifier_display text, p_raw_barcode text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_review_reason text DEFAULT 'UNKNOWN_GTIN'::text, p_master_item_code_hint text DEFAULT NULL::text, p_master_item_name_hint text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_device_id text DEFAULT NULL::text, p_work_scope_order_numbers text[] DEFAULT NULL::text[])
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_operation text:=nullif(btrim(coalesce(p_operation_id,'')),'');v_display text:=btrim(coalesce(p_identifier_display,''));v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);v_order text:=nullif(btrim(coalesce(p_order_number,'')),'');v_scope text[];v_id uuid;v_time timestamptz;v_qty integer;v_status text;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,upper(nullif(trim(p_workflow),'')),true,'create_pharmflow_needs_review_v5');

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
 if v_operation is null then raise exception 'Operation ID is required';end if;
 if v_key='' then raise exception 'Identifier is required';end if;
 if upper(trim(coalesce(p_workflow,'RECEIVING')))<>'RECEIVING' then raise exception 'Invalid workflow';end if;
 if upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))) not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason';end if;
 if upper(btrim(coalesce(p_source,'HANDHELD'))) not in ('HANDHELD','PC') then raise exception 'Invalid source';end if;

 select r.id,r.pending_quantity,r.created_at,r.status into v_id,v_qty,v_time,v_status from public.pharmflow_needs_review_v2 r where r.pharmacy_id=p_pharmacy_id and r.operation_id=v_operation limit 1;
 if found then return query select v_id,v_qty,v_time,v_status;return;end if;

 select coalesce(array_agg(distinct btrim(x) order by btrim(x)),array[]::text[]) into v_scope from unnest(coalesce(p_work_scope_order_numbers,array[]::text[])) x where btrim(coalesce(x,''))<>'';
 if v_order is not null and not(v_order=any(v_scope)) then v_scope:=array_append(v_scope,v_order);end if;
 if coalesce(array_length(v_scope,1),0)=0 then raise exception 'Receiving work scope is required';end if;
 if v_order is null and array_length(v_scope,1)=1 then v_order:=v_scope[1];end if;
 if exists(select 1 from unnest(v_scope) s where not exists(select 1 from public.pharmflow_orders o where o.pharmacy_id=p_pharmacy_id and o.order_number=s and o.status='uploaded')) then raise exception 'Receiving work scope contains an unavailable Order';end if;

 begin
  insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,session_id,order_number,order_name,gtin,raw_barcode,identifier_display,identifier_key,pending_quantity,review_reason,master_item_code_hint,master_item_name_hint,source,device_id,created_by,work_scope_order_numbers,operation_id)
  values(p_pharmacy_id,'RECEIVING',nullif(btrim(coalesce(p_session_id,'')),''),v_order,nullif(btrim(coalesce(p_order_name,'')),''),v_display,nullif(p_raw_barcode,''),v_display,v_key,1,upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),nullif(btrim(coalesce(p_master_item_code_hint,'')),''),nullif(btrim(coalesce(p_master_item_name_hint,'')),''),upper(btrim(coalesce(p_source,'HANDHELD'))),nullif(btrim(coalesce(p_device_id,'')),''),auth.uid(),v_scope,v_operation)
  returning id,pharmflow_needs_review_v2.pending_quantity,pharmflow_needs_review_v2.created_at,pharmflow_needs_review_v2.status into v_id,v_qty,v_time,v_status;
 exception when unique_violation then
  select r.id,r.pending_quantity,r.created_at,r.status into v_id,v_qty,v_time,v_status from public.pharmflow_needs_review_v2 r where r.pharmacy_id=p_pharmacy_id and r.operation_id=v_operation;
  if not found then raise;end if;
 end;
 return query select v_id,v_qty,v_time,v_status;
end;$function$
;
REVOKE ALL ON FUNCTION public.create_pharmflow_needs_review_v5(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pharmflow_needs_review_v5(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_all_pharmflow_finalized_archives(p_pharmacy_id uuid, p_confirmation text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'delete_all_pharmflow_finalized_archives');

    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if p_confirmation <> 'DELETE ALL HISTORICAL DATA' then
        raise exception 'Invalid confirmation';
    end if;

    delete from public.pharmflow_finalized_archives_v1
    where pharmacy_id=p_pharmacy_id;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.delete_all_pharmflow_finalized_archives(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_pharmflow_finalized_archives(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_all_pharmflow_historical_data_v2(p_pharmacy_id uuid, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_historical_order_numbers text[] := '{}'::text[];
    v_orders_deleted bigint := 0;
    v_archives_deleted bigint := 0;
    v_source_rows_deleted bigint := 0;
    v_receiving_transactions_deleted bigint := 0;
    v_remaining_historical_orders bigint := 0;
    v_remaining_archives bigint := 0;
    v_active_orders_preserved bigint := 0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'delete_all_pharmflow_historical_data_v2');

    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if upper(trim(coalesce(p_confirmation,''))) <> 'DELETE ALL HISTORICAL DATA' then
        raise exception 'Invalid confirmation';
    end if;

    -- Build the complete known Historical Order set BEFORE deleting anything.
    -- Include registry historical states plus Order Numbers carried only by a
    -- finalized archive (legacy/finalized-before-registry cases).
    select coalesce(array_agg(distinct x.order_number), '{}'::text[])
      into v_historical_order_numbers
      from (
          select upper(trim(o.order_number)) as order_number
            from public.pharmflow_orders o
           where o.pharmacy_id=p_pharmacy_id
             and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed')
             and nullif(trim(coalesce(o.order_number,'')),'') is not null

          union

          select upper(trim(n)) as order_number
            from public.pharmflow_finalized_archives_v1 a
            cross join lateral unnest(coalesce(a.order_numbers,'{}'::text[])) n
           where a.pharmacy_id=p_pharmacy_id
             and nullif(trim(coalesce(n,'')),'') is not null
      ) x;

    -- Immutable original-source snapshots belong to the historical order and
    -- must not survive Delete All Historical Data / Item Transfer cleanup.
    if coalesce(array_length(v_historical_order_numbers,1),0) > 0 then
        delete from public.pharmflow_order_source_items s
         where s.pharmacy_id=p_pharmacy_id
           and upper(trim(s.order_number))=any(v_historical_order_numbers);
        get diagnostics v_source_rows_deleted=row_count;

        -- Remove only receiving ledger rows for historical orders. Transactions
        -- for current active orders remain available and synchronized.
        delete from public.pharmflow_receiving_transactions_v1 t
         where t.pharmacy_id=p_pharmacy_id
           and upper(trim(coalesce(t.order_number,'')))=any(v_historical_order_numbers);
        get diagnostics v_receiving_transactions_deleted=row_count;
    end if;

    -- Finalized Archive is historical by definition and tenant-scoped.
    delete from public.pharmflow_finalized_archives_v1 a
     where a.pharmacy_id=p_pharmacy_id;
    get diagnostics v_archives_deleted=row_count;

    -- Delete ONLY received/finalized/closed lifecycle rows.
    delete from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed');
    get diagnostics v_orders_deleted=row_count;

    -- Server-side fail-fast verification. If either count is non-zero, raise;
    -- PostgreSQL rolls the entire transaction back rather than reporting a
    -- false success.
    select count(*)
      into v_remaining_historical_orders
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed');

    select count(*)
      into v_remaining_archives
      from public.pharmflow_finalized_archives_v1 a
     where a.pharmacy_id=p_pharmacy_id;

    if v_remaining_historical_orders<>0 or v_remaining_archives<>0 then
        raise exception
            'Historical deletion verification failed: orders %, archives %',
            v_remaining_historical_orders,
            v_remaining_archives;
    end if;

    select count(*)
      into v_active_orders_preserved
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    return jsonb_build_object(
        'success',true,
        'pharmacy_id',p_pharmacy_id,
        'historical_orders_deleted',v_orders_deleted,
        'finalized_archives_deleted',v_archives_deleted,
        'historical_source_rows_deleted',v_source_rows_deleted,
        'historical_receiving_transactions_deleted',v_receiving_transactions_deleted,
        'remaining_historical_orders',v_remaining_historical_orders,
        'remaining_finalized_archives',v_remaining_archives,
        'active_orders_preserved',v_active_orders_preserved,
        'verified_at',now()
    );
end;
$function$
;
REVOKE ALL ON FUNCTION public.delete_all_pharmflow_historical_data_v2(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_pharmflow_historical_data_v2(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_all_pharmflow_received_history(p_pharmacy_id uuid, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_deleted integer := 0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'delete_all_pharmflow_received_history');

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access required';
  end if;

  if coalesce(p_confirmation,'') <> 'DELETE ALL HISTORICAL DATA' then
    raise exception 'Historical deletion confirmation does not match';
  end if;

  delete from public.pharmflow_order_source_items
  where pharmacy_id=p_pharmacy_id
    and order_id in (
      select id from public.pharmflow_orders
      where pharmacy_id=p_pharmacy_id
        and lower(coalesce(status,'')) in ('received','finalized','closed')
    );

  delete from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and lower(coalesce(status,'')) in ('received','finalized','closed');

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'success',true,
    'deleted_received_orders',v_deleted,
    'pharmacy_id',p_pharmacy_id
  );
end;
$function$
;
REVOKE ALL ON FUNCTION public.delete_all_pharmflow_received_history(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_pharmflow_received_history(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_pharmacy_needs_review(p_pharmacy_id uuid, p_review_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,coalesce((select nr_compat.workflow from public.pharmflow_needs_review_v1 nr_compat where nr_compat.id=p_review_id and nr_compat.pharmacy_id=p_pharmacy_id),'RECEIVING'),true,'delete_pharmacy_needs_review');

 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 update public.pharmflow_needs_review_v1 set status='DELETED',updated_at=now() where id=p_review_id and pharmacy_id=p_pharmacy_id and status='PENDING';
 return found;
end $function$
;
REVOKE ALL ON FUNCTION public.delete_pharmacy_needs_review(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pharmacy_needs_review(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pharmacy_needs_review(uuid,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_pharmacy_needs_review(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.delete_pharmflow_order_complete(p_pharmacy_id uuid, p_order_number text, p_confirmation text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_order text:=upper(trim(coalesce(p_order_number,'')));
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'delete_pharmflow_order_complete');

    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if v_order='' or upper(trim(coalesce(p_confirmation,'')))<>v_order then
        raise exception 'Order confirmation does not match';
    end if;

    delete from public.pharmflow_finalized_archives_v1 a
    where a.pharmacy_id=p_pharmacy_id
      and exists (
          select 1
          from unnest(coalesce(a.order_numbers,'{}'::text[])) n
          where upper(trim(n))=v_order
      );

    delete from public.pharmflow_order_source_items
    where pharmacy_id=p_pharmacy_id
      and upper(trim(order_number))=v_order;

    delete from public.pharmflow_orders
    where pharmacy_id=p_pharmacy_id
      and upper(trim(order_number))=v_order;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.delete_pharmflow_order_complete(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pharmflow_order_complete(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.discard_all_pharmflow_active_orders(p_pharmacy_id uuid, p_confirmation text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'discard_all_pharmflow_active_orders');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if upper(trim(coalesce(p_confirmation,''))) <> 'RESET CURRENT WORKSPACE' then
        raise exception 'Invalid reset confirmation';
    end if;

    -- Remove source rows only for unfinished orders. Finalized/received history
    -- remains protected and untouched.
    delete from public.pharmflow_order_source_items s
    using public.pharmflow_orders o
    where s.pharmacy_id=p_pharmacy_id
      and o.pharmacy_id=p_pharmacy_id
      and upper(trim(s.order_number))=upper(trim(o.order_number))
      and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    delete from public.pharmflow_orders o
    where o.pharmacy_id=p_pharmacy_id
      and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.discard_all_pharmflow_active_orders(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.discard_all_pharmflow_active_orders(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.discard_pharmflow_active_order(p_pharmacy_id uuid, p_order_number text, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order text := upper(regexp_replace(trim(coalesce(p_order_number,'')),'\\s','','g'));
  v_status text;
  v_deleted integer := 0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'discard_pharmflow_active_order');

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access required';
  end if;

  if v_order='' then
    raise exception 'Order Number is required';
  end if;

  if upper(regexp_replace(trim(coalesce(p_confirmation,'')),'\\s','','g')) <> v_order then
    raise exception 'Order confirmation does not match';
  end if;

  select lower(coalesce(status,''))
    into v_status
  from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=v_order
  limit 1;

  if v_status is null then
    return jsonb_build_object(
      'success',true,
      'already_absent',true,
      'order_number',v_order
    );
  end if;

  if v_status in ('received','finalized','closed') then
    raise exception 'Finalized/received order cannot be discarded from Current Workspace. Delete it from Archive using the protected historical order deletion flow.';
  end if;

  delete from public.pharmflow_order_source_items
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=v_order;

  delete from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=v_order
    and lower(coalesce(status,'')) not in ('received','finalized','closed');

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'success',true,
    'discarded_orders',v_deleted,
    'order_number',v_order,
    'previous_status',v_status
  );
end;
$function$
;
REVOKE ALL ON FUNCTION public.discard_pharmflow_active_order(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.discard_pharmflow_active_order(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.finalize_pharmflow_order(p_pharmacy_id uuid, p_order_number text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status text;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'finalize_pharmflow_order');

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access required';
  end if;

  select status into v_status
  from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=
        upper(regexp_replace(p_order_number,'\\s','','g'))
  for update;

  if v_status is null then
    raise exception 'Order % is not registered',p_order_number;
  end if;

  if v_status='received' then
    raise exception 'Order % has already been received/finalized',p_order_number;
  end if;

  update public.pharmflow_orders
  set status='received', received_at=now(), received_by=auth.uid()
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=
        upper(regexp_replace(p_order_number,'\\s','','g'));

  return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.finalize_pharmflow_order(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pharmflow_order(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pharmflow_order(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.finalize_pharmflow_order(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.finalize_pharmflow_receiving_workspace_v1(p_pharmacy_id uuid, p_completion_key text, p_order_numbers text[], p_discrepancies jsonb DEFAULT '[]'::jsonb, p_new_items jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(workspace_history_id uuid, completed_at timestamp with time zone, orders_count integer, discrepancy_count integer, new_item_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_id uuid;
    v_completed_at timestamptz;
    v_orders text[];
    v_order text;
    v_status text;
    v_disc_count integer;
    v_new_count integer;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'finalize_pharmflow_receiving_workspace_v1');

    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy ADMIN access required';
    end if;
    if nullif(trim(coalesce(p_completion_key,'')),'') is null then
        raise exception 'Completion key required';
    end if;
    select coalesce(array_agg(distinct upper(regexp_replace(trim(x),'\s','','g')) order by upper(regexp_replace(trim(x),'\s','','g'))),'{}'::text[])
      into v_orders
      from unnest(coalesce(p_order_numbers,'{}'::text[])) x
     where nullif(trim(x),'') is not null;
    if coalesce(array_length(v_orders,1),0)=0 then
        raise exception 'At least one Order Number is required';
    end if;
    if jsonb_typeof(coalesce(p_discrepancies,'[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p_new_items,'[]'::jsonb)) <> 'array' then
        raise exception 'History items must be JSON arrays';
    end if;

    select h.id,h.completed_at into v_id,v_completed_at
      from public.pharmflow_receiving_workspace_history_v1 h
     where h.pharmacy_id=p_pharmacy_id and h.completion_key=trim(p_completion_key);
    if found then
        return query
        select h.id,h.completed_at,h.orders_count,h.discrepancy_count,h.new_item_count
          from public.pharmflow_receiving_workspace_history_v1 h
         where h.id=v_id;
        return;
    end if;

    foreach v_order in array v_orders loop
        select o.status into v_status
          from public.pharmflow_orders o
         where o.pharmacy_id=p_pharmacy_id
           and upper(regexp_replace(o.order_number,'\s','','g'))=v_order
         for update;
        if v_status is null then raise exception 'Order % is not registered',v_order; end if;
        if v_status='received' then raise exception 'Order % has already been received/finalized',v_order; end if;
    end loop;

    v_disc_count=jsonb_array_length(coalesce(p_discrepancies,'[]'::jsonb));
    v_new_count=jsonb_array_length(coalesce(p_new_items,'[]'::jsonb));

    insert into public.pharmflow_receiving_workspace_history_v1 as h(
        pharmacy_id,completion_key,completed_by,orders_count,discrepancy_count,new_item_count,order_numbers
    ) values(
        p_pharmacy_id,trim(p_completion_key),auth.uid(),array_length(v_orders,1),v_disc_count,v_new_count,v_orders
    )
    returning h.id,h.completed_at into v_id,v_completed_at;

    insert into public.pharmflow_receiving_history_items_v1(
        pharmacy_id,workspace_history_id,event_type,order_number,order_name,order_date,
        item_code,item_name,ordered_qty,received_qty,difference,issue_type
    )
    select p_pharmacy_id,v_id,'DISCREPANCY',
           upper(regexp_replace(trim(coalesce(x->>'order_number','')),'\s','','g')),
           coalesce(x->>'order_name',''),nullif(x->>'order_date','')::date,
           trim(coalesce(x->>'item_code','')),coalesce(x->>'item_name',''),
           coalesce(nullif(x->>'ordered_qty','')::numeric,0),
           nullif(x->>'received_qty','')::numeric,
           nullif(x->>'difference','')::numeric,
           upper(trim(coalesce(x->>'issue_type','')))
      from jsonb_array_elements(coalesce(p_discrepancies,'[]'::jsonb)) x
     where upper(regexp_replace(trim(coalesce(x->>'order_number','')),'\s','','g'))=any(v_orders)
       and nullif(trim(coalesce(x->>'item_code','')),'') is not null;

    insert into public.pharmflow_receiving_history_items_v1(
        pharmacy_id,workspace_history_id,event_type,order_number,order_name,order_date,
        item_code,item_name,ordered_qty,received_qty,difference,issue_type
    )
    select p_pharmacy_id,v_id,'NEW_ITEM',
           upper(regexp_replace(trim(coalesce(x->>'order_number','')),'\s','','g')),
           coalesce(x->>'order_name',''),nullif(x->>'order_date','')::date,
           trim(coalesce(x->>'item_code','')),coalesce(x->>'item_name',''),
           coalesce(nullif(x->>'ordered_qty','')::numeric,0),null,null,'NEW'
      from jsonb_array_elements(coalesce(p_new_items,'[]'::jsonb)) x
     where upper(regexp_replace(trim(coalesce(x->>'order_number','')),'\s','','g'))=any(v_orders)
       and nullif(trim(coalesce(x->>'item_code','')),'') is not null;

    update public.pharmflow_orders
       set status='received',received_at=v_completed_at,received_by=auth.uid()
     where pharmacy_id=p_pharmacy_id
       and upper(regexp_replace(order_number,'\s','','g'))=any(v_orders);

    return query select v_id,v_completed_at,array_length(v_orders,1),v_disc_count,v_new_count;
end;
$function$
;
REVOKE ALL ON FUNCTION public.finalize_pharmflow_receiving_workspace_v1(uuid,text,text[],jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pharmflow_receiving_workspace_v1(uuid,text,text[],jsonb,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_pharmflow_active_order_manifest(p_pharmacy_id uuid)
 RETURNS TABLE(manifest jsonb, revision bigint, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_active_order_manifest');
 RETURN QUERY select m.manifest,m.revision,m.updated_at
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id
      and public.is_pharmacy_member(p_pharmacy_id);
END;
$function$
;
REVOKE ALL ON FUNCTION public.get_pharmflow_active_order_manifest(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_active_order_manifest(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_pharmflow_active_order_manifest_v2(p_pharmacy_id uuid)
 RETURNS TABLE(manifest jsonb, revision bigint, updated_at timestamp with time zone, order_files integer, order_items integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_active_order_manifest_v2');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select
        m.manifest,
        m.revision,
        m.updated_at,
        jsonb_array_length(
            coalesce(m.manifest->'orderFiles','[]'::jsonb)
        ),
        jsonb_array_length(
            coalesce(m.manifest->'orderData','[]'::jsonb)
        )
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id;
end;
$function$
;
REVOKE ALL ON FUNCTION public.get_pharmflow_active_order_manifest_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_active_order_manifest_v2(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_pharmflow_order_source_items(p_pharmacy_id uuid, p_order_number text)
 RETURNS SETOF pharmflow_order_source_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_order_source_items');
 RETURN QUERY select i.*
  from public.pharmflow_order_source_items i
  where i.pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(i.order_number,'\\s','','g'))=
        upper(regexp_replace(p_order_number,'\\s','','g'))
    and auth.uid() is not null
    and public.is_pharmacy_admin(p_pharmacy_id)
  order by i.line_no;
END;
$function$
;
REVOKE ALL ON FUNCTION public.get_pharmflow_order_source_items(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_order_source_items(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_order_source_items(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_order_source_items(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.get_pharmflow_receiving_workspace_history_v1(p_pharmacy_id uuid, p_workspace_history_id uuid)
 RETURNS TABLE(event_type text, order_number text, order_name text, order_date date, item_code text, item_name text, ordered_qty numeric, received_qty numeric, difference numeric, issue_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_receiving_workspace_history_v1');
 RETURN QUERY select i.event_type,i.order_number,i.order_name,i.order_date,i.item_code,i.item_name,
           i.ordered_qty,i.received_qty,i.difference,i.issue_type
      from public.pharmflow_receiving_history_items_v1 i
     where i.pharmacy_id=p_pharmacy_id
       and i.workspace_history_id=p_workspace_history_id
       and auth.uid() is not null and public.is_pharmacy_member(p_pharmacy_id)
     order by i.order_number,
              case i.event_type when 'DISCREPANCY' then 1 else 2 end,
              i.item_name,i.item_code;
END;
$function$
;
REVOKE ALL ON FUNCTION public.get_pharmflow_receiving_workspace_history_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_receiving_workspace_history_v1(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_pharmacy_needs_review(p_pharmacy_id uuid, p_workflow text DEFAULT NULL::text, p_order_id text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, workflow text, gtin text, raw_barcode text, order_id text, order_name text, pending_quantity integer, expiry_month integer, expiry_year integer, worker_id uuid, captured_by_name text, device_id text, source text, created_at timestamp with time zone, review_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,upper(nullif(trim(p_workflow),'')),false,'list_pharmacy_needs_review');

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 return query
 select r.id,r.workflow,r.gtin,coalesce(r.raw_barcode,''),coalesce(r.order_id,''),coalesce(r.order_name,''),
        r.pending_quantity,r.expiry_month,r.expiry_year,r.worker_id,coalesce(r.captured_by_name,''),
        coalesce(r.device_id,''),r.source,r.created_at,coalesce(r.review_reason,'UNKNOWN_GTIN')
 from public.pharmflow_needs_review_v1 r
 where r.pharmacy_id=p_pharmacy_id and r.status='PENDING'
 and (nullif(upper(trim(coalesce(p_workflow,''))),'') is null or r.workflow=upper(trim(p_workflow)))
 and (nullif(trim(coalesce(p_order_id,'')),'') is null or coalesce(r.order_id,'')=trim(p_order_id))
 order by r.created_at desc;
end $function$
;
REVOKE ALL ON FUNCTION public.list_pharmacy_needs_review(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmacy_needs_review(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmacy_needs_review(uuid,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.list_pharmacy_needs_review(uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.list_pharmflow_cloud_transactions(p_pharmacy_id uuid, p_limit integer DEFAULT 1000)
 RETURNS TABLE(transaction_id text, order_number text, item_code text, item_name text, gtin text, quantity integer, source text, device_id text, occurred_at timestamp with time zone, payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_cloud_transactions');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select
        t.transaction_id,
        t.order_number,
        t.item_code,
        t.item_name,
        t.gtin,
        t.quantity,
        t.source,
        t.device_id,
        t.occurred_at,
        t.payload
    from public.pharmflow_receiving_transactions_v1 t
    where t.pharmacy_id=p_pharmacy_id
    order by t.occurred_at desc
    limit greatest(1,least(coalesce(p_limit,1000),5000));
end;
$function$
;
REVOKE ALL ON FUNCTION public.list_pharmflow_cloud_transactions(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_cloud_transactions(uuid,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_pharmflow_cloud_transactions_v2(p_pharmacy_id uuid, p_limit integer DEFAULT 5000)
 RETURNS TABLE(transaction_id text, order_number text, item_code text, item_name text, gtin text, quantity integer, source text, device_id text, occurred_at timestamp with time zone, payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_cloud_transactions_v2');

    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select t.transaction_id,t.order_number,t.item_code,t.item_name,t.gtin,
           t.quantity,t.source,t.device_id,t.occurred_at,t.payload
    from public.pharmflow_receiving_transactions_v1 t
    where t.pharmacy_id=p_pharmacy_id
    order by t.occurred_at asc, t.created_at asc
    limit greatest(1,least(coalesce(p_limit,5000),10000));
end;
$function$
;
REVOKE ALL ON FUNCTION public.list_pharmflow_cloud_transactions_v2(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_cloud_transactions_v2(uuid,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_pharmflow_cloud_transactions_v3(p_pharmacy_id uuid, p_order_numbers text[], p_limit integer DEFAULT 5000)
 RETURNS TABLE(transaction_id text, order_number text, item_code text, item_name text, gtin text, quantity integer, source text, device_id text, occurred_at timestamp with time zone, payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_cloud_transactions_v3');

  if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
    raise exception 'Pharmacy access required';
  end if;

  return query
  select t.transaction_id,t.order_number,t.item_code,t.item_name,t.gtin,
         t.quantity,t.source,t.device_id,t.occurred_at,t.payload
  from public.pharmflow_receiving_transactions_v1 t
  where t.pharmacy_id=p_pharmacy_id
    and (p_order_numbers is null or cardinality(p_order_numbers)=0 or t.order_number = any(p_order_numbers))
  order by t.occurred_at asc, t.created_at asc
  limit greatest(1,least(coalesce(p_limit,5000),10000));
end;
$function$
;
REVOKE ALL ON FUNCTION public.list_pharmflow_cloud_transactions_v3(uuid,text[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_cloud_transactions_v3(uuid,text[],integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_cloud_transactions_v3(uuid,text[],integer) TO anon;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_cloud_transactions_v3(uuid,text[],integer) TO service_role;
CREATE OR REPLACE FUNCTION public.list_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_workflow text DEFAULT 'RECEIVING'::text, p_order_number text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, workflow text, session_id text, order_number text, order_name text, gtin text, raw_barcode text, pending_quantity integer, review_reason text, master_item_code_hint text, master_item_name_hint text, photo_path text, source text, device_id text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,upper(nullif(trim(p_workflow),'')),false,'list_pharmflow_needs_review_v2');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select
        r.id,
        r.workflow,
        coalesce(r.session_id,''),
        coalesce(r.order_number,''),
        coalesce(r.order_name,''),
        r.gtin,
        coalesce(r.raw_barcode,''),
        r.pending_quantity,
        r.review_reason,
        coalesce(r.master_item_code_hint,''),
        coalesce(r.master_item_name_hint,''),
        coalesce(r.photo_path,''),
        r.source,
        coalesce(r.device_id,''),
        r.created_at
    from public.pharmflow_needs_review_v2 r
    where r.pharmacy_id = p_pharmacy_id
      and r.status = 'PENDING'
      and r.workflow = upper(trim(coalesce(p_workflow,'RECEIVING')))
      and (
        nullif(trim(coalesce(p_order_number,'')),'') is null
        or coalesce(r.order_number,'') = trim(p_order_number)
      )
    order by r.created_at desc;
end;
$function$
;
REVOKE ALL ON FUNCTION public.list_pharmflow_needs_review_v2(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_needs_review_v2(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_pharmflow_new_item_history_v1(p_pharmacy_id uuid, p_from date, p_to date)
 RETURNS TABLE(workspace_history_id uuid, completed_at timestamp with time zone, order_number text, order_name text, order_date date, item_code text, item_name text, ordered_qty numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_new_item_history_v1');
 RETURN QUERY select h.id,h.completed_at,i.order_number,i.order_name,i.order_date,i.item_code,i.item_name,i.ordered_qty
      from public.pharmflow_receiving_workspace_history_v1 h
      join public.pharmflow_receiving_history_items_v1 i
        on i.workspace_history_id=h.id and i.pharmacy_id=h.pharmacy_id
     where h.pharmacy_id=p_pharmacy_id and i.event_type='NEW_ITEM'
       and auth.uid() is not null and public.is_pharmacy_member(p_pharmacy_id)
       and h.completed_at >= p_from::timestamptz
       and h.completed_at < (p_to + 1)::timestamptz
     order by h.completed_at desc,i.order_number,i.item_name,i.item_code;
END;
$function$
;
REVOKE ALL ON FUNCTION public.list_pharmflow_new_item_history_v1(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_new_item_history_v1(uuid,date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_pharmflow_receiving_workspace_history_v1(p_pharmacy_id uuid, p_from date, p_to date)
 RETURNS TABLE(workspace_history_id uuid, completed_at timestamp with time zone, orders_count integer, discrepancy_count integer, new_item_count integer, order_numbers text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_receiving_workspace_history_v1');
 RETURN QUERY select h.id,h.completed_at,h.orders_count,h.discrepancy_count,h.new_item_count,h.order_numbers
      from public.pharmflow_receiving_workspace_history_v1 h
     where h.pharmacy_id=p_pharmacy_id
       and auth.uid() is not null and public.is_pharmacy_member(p_pharmacy_id)
       and h.completed_at >= p_from::timestamptz
       and h.completed_at < (p_to + 1)::timestamptz
     order by h.completed_at desc;
END;
$function$
;
REVOKE ALL ON FUNCTION public.list_pharmflow_receiving_workspace_history_v1(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_receiving_workspace_history_v1(uuid,date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.patch_pharmflow_item_priorities_v1(p_pharmacy_id uuid, p_changes jsonb, p_expected_generation bigint, p_expected_revision bigint)
 RETURNS TABLE(revision bigint, updated_at timestamp with time zone, changed_items integer, order_files integer, order_items integer, workspace_generation bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_generation bigint;
    v_revision bigint;
    v_manifest jsonb;
    v_change_map jsonb;
    v_order_data jsonb;
    v_changed integer;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'patch_pharmflow_item_priorities_v1');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes)=0 then
        raise exception 'Priority changes must be a non-empty JSON array';
    end if;

    if exists (
        select 1
          from jsonb_array_elements(p_changes) c
         where trim(coalesce(c->>'itemCode',''))=''
            or upper(trim(coalesce(c->>'priorityType',''))) not in ('','SHORT','NEW')
    ) then
        raise exception 'Invalid item priority change';
    end if;

    select coalesce(
        jsonb_object_agg(
            trim(c->>'itemCode'),
            to_jsonb(upper(trim(coalesce(c->>'priorityType',''))))
        ),
        '{}'::jsonb
    )
      into v_change_map
      from jsonb_array_elements(p_changes) c;

    select g.generation
      into v_generation
      from public.pharmflow_workspace_generation_v1 g
     where g.pharmacy_id=p_pharmacy_id
     for update;

    if coalesce(p_expected_generation,-1) <> coalesce(v_generation,0) then
        raise exception 'STALE_WORKSPACE_GENERATION';
    end if;

    select m.manifest,m.revision
      into v_manifest,v_revision
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id
     for update;

    if v_manifest is null then
        raise exception 'Active Order Manifest not found';
    end if;

    if coalesce(p_expected_revision,-1) <> coalesce(v_revision,0) then
        raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';
    end if;

    select
        jsonb_agg(
            case
                when v_change_map ? coalesce(item->>'itemCode',item->>'itemNumber','')
                then jsonb_set(
                    jsonb_set(
                        item,
                        '{priorityType}',
                        v_change_map->coalesce(item->>'itemCode',item->>'itemNumber',''),
                        true
                    ),
                    '{highPriority}',
                    to_jsonb(
                        coalesce(
                            v_change_map->>coalesce(item->>'itemCode',item->>'itemNumber',''),
                            ''
                        ) <> ''
                    ),
                    true
                )
                else item
            end
            order by ordinal_position
        ),
        count(*) filter (
            where v_change_map ? coalesce(item->>'itemCode',item->>'itemNumber','')
        )::integer
      into v_order_data,v_changed
      from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb))
           with ordinality as entries(item,ordinal_position);

    if coalesce(v_changed,0) <> (
        select count(*) from jsonb_object_keys(v_change_map)
    ) then
        raise exception 'One or more priority items are not in the Active Order Manifest';
    end if;

    update public.pharmflow_active_order_manifest_v1 m
       set manifest=jsonb_set(m.manifest,'{orderData}',v_order_data,false),
           revision=m.revision+1,
           updated_at=now(),
           updated_by=auth.uid()
     where m.pharmacy_id=p_pharmacy_id;

    return query
    select m.revision,m.updated_at,v_changed,
           jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
           jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),
           m.workspace_generation
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id;
end;
$function$
;
REVOKE ALL ON FUNCTION public.patch_pharmflow_item_priorities_v1(uuid,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.patch_pharmflow_item_priorities_v1(uuid,jsonb,bigint,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.patch_pharmflow_item_priorities_v2(p_pharmacy_id uuid, p_changes jsonb, p_expected_generation bigint, p_expected_revision bigint)
 RETURNS TABLE(revision bigint, updated_at timestamp with time zone, changed_items integer, order_files integer, order_items integer, workspace_generation bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_generation bigint;
    v_revision bigint;
    v_manifest jsonb;
    v_change_map jsonb;
    v_order_data jsonb;
    v_changed integer;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'patch_pharmflow_item_priorities_v2');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes)=0 then
        raise exception 'Priority changes must be a non-empty JSON array';
    end if;
    if exists (
        select 1 from jsonb_array_elements(p_changes) c
         where trim(coalesce(c->>'itemCode',''))=''
            or upper(trim(coalesce(c->>'priorityType',''))) not in ('','SHORT','NEW')
    ) then
        raise exception 'Invalid item priority change';
    end if;
    select coalesce(jsonb_object_agg(
        trim(c->>'itemCode'),
        to_jsonb(upper(trim(coalesce(c->>'priorityType',''))))
    ),'{}'::jsonb)
      into v_change_map
      from jsonb_array_elements(p_changes) c;
    select g.generation into v_generation
      from public.pharmflow_workspace_generation_v1 g
     where g.pharmacy_id=p_pharmacy_id for update;
    if coalesce(p_expected_generation,-1) <> coalesce(v_generation,0) then
        raise exception 'STALE_WORKSPACE_GENERATION';
    end if;
    select m.manifest,m.revision into v_manifest,v_revision
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id for update;
    if v_manifest is null then raise exception 'Active Order Manifest not found'; end if;
    if coalesce(p_expected_revision,-1) <> coalesce(v_revision,0) then
        raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';
    end if;
    select jsonb_agg(
        case when v_change_map ? coalesce(item->>'itemCode',item->>'itemNumber','')
        then jsonb_set(jsonb_set(
            item,'{priorityType}',
            v_change_map->coalesce(item->>'itemCode',item->>'itemNumber',''),true
        ),'{highPriority}',to_jsonb(
            coalesce(v_change_map->>coalesce(item->>'itemCode',item->>'itemNumber',''),'') <> ''
        ),true)
        else item end order by ordinal_position
    ),count(distinct coalesce(item->>'itemCode',item->>'itemNumber','')) filter (
        where v_change_map ? coalesce(item->>'itemCode',item->>'itemNumber','')
    )::integer
      into v_order_data,v_changed
      from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb))
           with ordinality as entries(item,ordinal_position);
    if coalesce(v_changed,0) <> (select count(*) from jsonb_object_keys(v_change_map)) then
        raise exception 'One or more priority items are not in the Active Order Manifest';
    end if;
    update public.pharmflow_active_order_manifest_v1 m
       set manifest=jsonb_set(m.manifest,'{orderData}',v_order_data,false),
           revision=m.revision+1,updated_at=now(),updated_by=auth.uid()
     where m.pharmacy_id=p_pharmacy_id;
    return query select m.revision,m.updated_at,v_changed,
        jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
        jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),
        m.workspace_generation
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id;
end;
$function$
;
REVOKE ALL ON FUNCTION public.patch_pharmflow_item_priorities_v2(uuid,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.patch_pharmflow_item_priorities_v2(uuid,jsonb,bigint,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.pharmflow_receiving_sync_health_v2(p_pharmacy_id uuid)
 RETURNS TABLE(transaction_count bigint, last_transaction_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'pharmflow_receiving_sync_health_v2');

    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    return query
    select count(*)::bigint,max(t.occurred_at)
    from public.pharmflow_receiving_transactions_v1 t
    where t.pharmacy_id=p_pharmacy_id;
end;
$function$
;
REVOKE ALL ON FUNCTION public.pharmflow_receiving_sync_health_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pharmflow_receiving_sync_health_v2(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.resolve_pharmacy_needs_review(p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text)
 RETURNS TABLE(review_id uuid, workflow text, gtin text, pending_quantity integer, expiry_month integer, expiry_year integer, worker_id uuid, captured_by_name text, device_id text, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.pharmflow_needs_review_v1%rowtype;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,coalesce((select nr_compat.workflow from public.pharmflow_needs_review_v1 nr_compat where nr_compat.id=p_review_id and nr_compat.pharmacy_id=p_pharmacy_id),'RECEIVING'),true,'resolve_pharmacy_needs_review');
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'resolve_pharmacy_needs_review');

 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 select * into r from public.pharmflow_needs_review_v1 where id=p_review_id and pharmacy_id=p_pharmacy_id and status='PENDING' for update;
 if not found then raise exception 'Review item not found'; end if;
 update public.pharmflow_needs_review_v1 set status='RESOLVED',resolved_item_code=trim(p_item_code),resolved_item_name=trim(p_item_name),resolved_by=auth.uid(),resolved_at=now(),updated_at=now() where id=p_review_id;
 return query select r.id,r.workflow,r.gtin,r.pending_quantity,r.expiry_month,r.expiry_year,r.worker_id,coalesce(r.captured_by_name,''),coalesce(r.device_id,''),r.source;
end $function$
;
REVOKE ALL ON FUNCTION public.resolve_pharmacy_needs_review(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pharmacy_needs_review(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pharmacy_needs_review(uuid,uuid,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_pharmacy_needs_review(uuid,uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.resolve_pharmflow_needs_review_v3(p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text, p_resolution_type text, p_resolution_transaction_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_review public.pharmflow_needs_review_v2%rowtype;v_order_status text;v_item_code text:=btrim(coalesce(p_item_code,''));begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'resolve_pharmflow_needs_review_v3');
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'resolve_pharmflow_needs_review_v3');
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required';end if;select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id for update;if v_review.id is null then raise exception 'Needs Review case is unavailable';end if;if v_review.status<>'PENDING' then raise exception 'Needs Review case is no longer pending';end if;if nullif(btrim(coalesce(v_review.order_number,'')),'') is null then update public.pharmflow_needs_review_v2 set resolution_block_code='ORIGINAL_ORDER_UNAVAILABLE',resolution_block_detail='The case has no original Receiving order.',updated_at=now() where id=v_review.id;return jsonb_build_object('success',false,'blocked',true,'code','ORIGINAL_ORDER_UNAVAILABLE');end if;select status into v_order_status from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and order_number=v_review.order_number;if v_order_status is distinct from 'uploaded' then update public.pharmflow_needs_review_v2 set resolution_block_code='ORIGINAL_ORDER_UNAVAILABLE',resolution_block_detail='The original order is finalized, inactive, or unavailable.',updated_at=now() where id=v_review.id;return jsonb_build_object('success',false,'blocked',true,'code','ORIGINAL_ORDER_UNAVAILABLE','orderNumber',v_review.order_number);end if;if v_item_code='' or not exists(select 1 from public.pharmflow_order_source_items where pharmacy_id=p_pharmacy_id and order_number=v_review.order_number and item_code=v_item_code) then update public.pharmflow_needs_review_v2 set resolution_block_code='ITEM_NOT_IN_ORIGINAL_ORDER',resolution_block_detail='The selected item is not in the case original order.',updated_at=now() where id=v_review.id;return jsonb_build_object('success',false,'blocked',true,'code','ITEM_NOT_IN_ORIGINAL_ORDER','orderNumber',v_review.order_number);end if;if upper(btrim(coalesce(p_resolution_type,'')))<>'LINK_ORDER_ITEM' or nullif(btrim(coalesce(p_resolution_transaction_id,'')),'') is null then update public.pharmflow_needs_review_v2 set resolution_block_code='RECEIVING_TRANSACTION_REQUIRED',resolution_block_detail='Resolution requires a Receiving transaction attributed to the original order.',updated_at=now() where id=v_review.id;return jsonb_build_object('success',false,'blocked',true,'code','RECEIVING_TRANSACTION_REQUIRED','orderNumber',v_review.order_number);end if;if not exists(select 1 from public.pharmflow_receiving_transactions_v1 t where t.pharmacy_id=p_pharmacy_id and t.transaction_id=btrim(p_resolution_transaction_id) and t.order_number=v_review.order_number and t.item_code=v_item_code and t.quantity>0) then update public.pharmflow_needs_review_v2 set resolution_block_code='RECEIVING_TRANSACTION_ORDER_MISMATCH',resolution_block_detail='The supplied Receiving transaction does not belong to the original order and selected item.',updated_at=now() where id=v_review.id;return jsonb_build_object('success',false,'blocked',true,'code','RECEIVING_TRANSACTION_ORDER_MISMATCH','orderNumber',v_review.order_number);end if;update public.pharmflow_needs_review_v2 set status='RESOLVED',resolved_item_code=v_item_code,resolved_item_name=btrim(coalesce(p_item_name,'')),resolution_type='LINK_ORDER_ITEM',resolution_transaction_id=btrim(p_resolution_transaction_id),resolved_by=auth.uid(),resolved_at=now(),resolution_block_code=null,resolution_block_detail=null,updated_at=now() where id=v_review.id;return jsonb_build_object('success',true,'orderNumber',v_review.order_number);end $function$
;
REVOKE ALL ON FUNCTION public.resolve_pharmflow_needs_review_v3(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pharmflow_needs_review_v3(uuid,uuid,text,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_pharmflow_active_order_manifest(p_pharmacy_id uuid, p_manifest jsonb)
 RETURNS TABLE(revision bigint, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_active_order_manifest');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    insert into public.pharmflow_active_order_manifest_v1(
        pharmacy_id,manifest,revision,updated_at,updated_by
    )
    values(
        p_pharmacy_id,
        coalesce(p_manifest,'{}'::jsonb),
        1,
        now(),
        auth.uid()
    )
    on conflict(pharmacy_id)
    do update set
        manifest=excluded.manifest,
        revision=public.pharmflow_active_order_manifest_v1.revision+1,
        updated_at=now(),
        updated_by=auth.uid();

    return query
    select m.revision,m.updated_at
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id;
end;
$function$
;
REVOKE ALL ON FUNCTION public.save_pharmflow_active_order_manifest(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_active_order_manifest(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_pharmflow_active_order_manifest_v2(p_pharmacy_id uuid, p_manifest jsonb)
 RETURNS TABLE(revision bigint, updated_at timestamp with time zone, order_files integer, order_items integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_files integer;
    v_items integer;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_active_order_manifest_v2');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    v_files :=
        jsonb_array_length(
            coalesce(p_manifest->'orderFiles','[]'::jsonb)
        );

    v_items :=
        jsonb_array_length(
            coalesce(p_manifest->'orderData','[]'::jsonb)
        );

    if v_files <= 0 or v_items <= 0 then
        raise exception
            'Active Order Manifest requires orderFiles and orderData';
    end if;

    insert into public.pharmflow_active_order_manifest_v1(
        pharmacy_id,
        manifest,
        revision,
        updated_at,
        updated_by
    )
    values(
        p_pharmacy_id,
        p_manifest,
        1,
        now(),
        auth.uid()
    )
    on conflict(pharmacy_id)
    do update set
        manifest=excluded.manifest,
        revision=
            public.pharmflow_active_order_manifest_v1.revision+1,
        updated_at=now(),
        updated_by=auth.uid();

    return query
    select
        m.revision,
        m.updated_at,
        jsonb_array_length(
            coalesce(m.manifest->'orderFiles','[]'::jsonb)
        ),
        jsonb_array_length(
            coalesce(m.manifest->'orderData','[]'::jsonb)
        )
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id;
end;
$function$
;
REVOKE ALL ON FUNCTION public.save_pharmflow_active_order_manifest_v2(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_active_order_manifest_v2(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_pharmflow_finalized_archive(p_pharmacy_id uuid, p_archive_id text, p_order_numbers text[], p_closed_at timestamp with time zone, p_archive_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_finalized_archive');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if nullif(trim(coalesce(p_archive_id,'')),'') is null then
        raise exception 'Archive id is required';
    end if;

    insert into public.pharmflow_finalized_archives_v1(
        pharmacy_id, archive_id, order_numbers, closed_at,
        archive_payload, created_by
    )
    values(
        p_pharmacy_id,
        trim(p_archive_id),
        coalesce(p_order_numbers,'{}'::text[]),
        coalesce(p_closed_at,now()),
        coalesce(p_archive_payload,'{}'::jsonb),
        auth.uid()
    )
    on conflict(pharmacy_id,archive_id)
    do update set
        order_numbers=excluded.order_numbers,
        closed_at=excluded.closed_at,
        archive_payload=excluded.archive_payload;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.save_pharmflow_finalized_archive(uuid,text,text[],timestamp with time zone,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_finalized_archive(uuid,text,text[],timestamp with time zone,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_pharmflow_order_source_items(p_pharmacy_id uuid, p_order_number text, p_items jsonb, p_replace boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order_id uuid;
  v_count integer:=0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_order_source_items');

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access required';
  end if;

  select id into v_order_id
  from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=
        upper(regexp_replace(p_order_number,'\\s','','g'))
  limit 1;

  if v_order_id is null then
    raise exception 'Order % is not registered',p_order_number;
  end if;

  if p_replace then
    if exists(
      select 1 from public.pharmflow_orders
      where id=v_order_id and status='received'
    ) then
      raise exception 'Received order source data is immutable';
    end if;
    delete from public.pharmflow_order_source_items where order_id=v_order_id;
  end if;

  insert into public.pharmflow_order_source_items(
    pharmacy_id,order_id,order_number,line_no,item_code,item_name,
    ordered_qty,category,source_sheet,source_row
  )
  select
    p_pharmacy_id,
    v_order_id,
    upper(regexp_replace(trim(p_order_number),'\\s','','g')),
    (x->>'line_no')::integer,
    trim(x->>'item_code'),
    coalesce(x->>'item_name',''),
    (x->>'ordered_qty')::numeric,
    coalesce(x->>'category',''),
    coalesce(x->>'source_sheet',''),
    nullif(x->>'source_row','')::integer
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
  where nullif(trim(x->>'item_code'),'') is not null
    and coalesce((x->>'ordered_qty')::numeric,0)>0
  on conflict(order_id,line_no) do update set
    item_code=excluded.item_code,
    item_name=excluded.item_name,
    ordered_qty=excluded.ordered_qty,
    category=excluded.category,
    source_sheet=excluded.source_sheet,
    source_row=excluded.source_row;

  get diagnostics v_count=row_count;
  return v_count;
end;
$function$
;
REVOKE ALL ON FUNCTION public.save_pharmflow_order_source_items(uuid,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_order_source_items(uuid,text,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_order_source_items(uuid,text,jsonb,boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_order_source_items(uuid,text,jsonb,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.set_pharmacy_needs_review_quantity(p_pharmacy_id uuid, p_review_id uuid, p_pending_quantity integer)
 RETURNS TABLE(review_id uuid, pending_quantity integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_q integer:=greatest(coalesce(p_pending_quantity,1),1);
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'set_pharmacy_needs_review_quantity');

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 return query
 update public.pharmflow_needs_review_v1 r
 set pending_quantity=v_q,updated_at=now()
 where r.id=p_review_id and r.pharmacy_id=p_pharmacy_id and r.status='PENDING' and r.workflow='RECEIVING'
 returning r.id,r.pending_quantity,r.updated_at;
 if not found then raise exception 'Pending review item not found'; end if;
end $function$
;
REVOKE ALL ON FUNCTION public.set_pharmacy_needs_review_quantity(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_pharmacy_needs_review_quantity(uuid,uuid,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.verify_pharmflow_historical_state_v2(p_pharmacy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_historical_orders bigint;
    v_archives bigint;
    v_active_orders bigint;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'verify_pharmflow_historical_state_v2');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    select count(*) into v_historical_orders
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed');

    select count(*) into v_archives
      from public.pharmflow_finalized_archives_v1 a
     where a.pharmacy_id=p_pharmacy_id;

    select count(*) into v_active_orders
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    return jsonb_build_object(
        'pharmacy_id',p_pharmacy_id,
        'historical_orders_remaining',v_historical_orders,
        'finalized_archives_remaining',v_archives,
        'active_orders_present',v_active_orders,
        'historical_data_empty',(v_historical_orders=0 and v_archives=0)
    );
end;
$function$
;
REVOKE ALL ON FUNCTION public.verify_pharmflow_historical_state_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pharmflow_historical_state_v2(uuid) TO authenticated;

