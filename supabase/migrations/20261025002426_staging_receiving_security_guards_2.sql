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
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,coalesce((select workflow from public.pharmflow_needs_review_v1 where id=p_review_id and pharmacy_id=p_pharmacy_id),'RECEIVING'),true,'delete_pharmacy_needs_review');

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
;

