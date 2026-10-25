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
;

