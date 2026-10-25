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
;

