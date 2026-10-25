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
;

