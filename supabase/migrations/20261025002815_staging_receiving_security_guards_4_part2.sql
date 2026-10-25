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
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,coalesce((select workflow from public.pharmflow_needs_review_v1 where id=p_review_id and pharmacy_id=p_pharmacy_id),'RECEIVING'),true,'resolve_pharmacy_needs_review');
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
;

