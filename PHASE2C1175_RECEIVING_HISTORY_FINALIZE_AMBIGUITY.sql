-- Root-cause fix: qualify workspace-history INSERT RETURNING columns so PL/pgSQL output column completed_at cannot collide with the table column.
create or replace function public.finalize_pharmflow_receiving_workspace_v1(
    p_pharmacy_id uuid,
    p_completion_key text,
    p_order_numbers text[],
    p_discrepancies jsonb default '[]'::jsonb,
    p_new_items jsonb default '[]'::jsonb
)
returns table(workspace_history_id uuid, completed_at timestamptz, orders_count integer, discrepancy_count integer, new_item_count integer)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
    v_id uuid;
    v_completed_at timestamptz;
    v_orders text[];
    v_order text;
    v_status text;
    v_disc_count integer;
    v_new_count integer;
begin
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
$function$;

