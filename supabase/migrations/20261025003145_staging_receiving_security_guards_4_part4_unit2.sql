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
;

