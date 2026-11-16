begin;

create function public.get_pharmflow_movement_source_batch_v1(p_pharmacy_id uuid, p_orders text[], p_item text)
returns table(order_number text, has_source boolean, items jsonb)
language plpgsql stable security definer set search_path = ''
as $$
declare
    item_filter text := lower(btrim(coalesce(p_item, '')));
begin
    perform pharmflow_auth_private.require_receiving_compat(
        p_pharmacy_id, 'RECEIVING', false, 'get_pharmflow_movement_source_batch_v1');
    if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if coalesce(cardinality(p_orders), 0) not between 1 and 100 or length(item_filter) not between 1 and 160
        or exists (select 1 from unnest(p_orders) v(number) where v.number is null or length(v.number) not between 1 and 100) then
        raise exception 'Invalid movement source search';
    end if;
    -- The legacy source RPC also returns no source rows for non-admin members.
    if not coalesce(public.is_pharmacy_admin(p_pharmacy_id), false) then return; end if;

    return query
    with requested as (
        select distinct upper(regexp_replace(v.number,'[[:space:]]','','g')) as number
        from unnest(p_orders) v(number)
    ), source as (
        select r.number,i.line_no,i.id,i.item_name,i.ordered_qty,
            upper(regexp_replace(replace(regexp_replace(i.item_code,'^''+',''),chr(160),''),'[[:space:]]','','g')) as raw_code
        from requested r
        join public.pharmflow_order_source_items i
          on i.pharmacy_id=p_pharmacy_id
         and upper(regexp_replace(i.order_number,'[[:space:]]','','g'))=r.number
    ), normalized as (
        select s.*,case
            when s.raw_code ~ '^[0-9]+(\.0+)?$'
                then coalesce(nullif(ltrim(split_part(s.raw_code,'.',1),'0'),''),'0')
            else s.raw_code end as code
        from source s
    ), totals as (
        select n.number,n.code, (array_agg(n.item_name order by n.line_no,n.id)
            filter (where n.item_name <> ''))[1] as name, sum(coalesce(n.ordered_qty,0)) as quantity
        from normalized n
        where n.code <> ''
        group by n.number,n.code
    )
    select r.number, exists(select 1 from source s where s.number=r.number),
        coalesce((select jsonb_agg(jsonb_build_object('item_code',t.code,'item_name',t.name,'ordered_qty',t.quantity)
            order by t.code)
            from totals t where t.number=r.number
            and (lower(t.code)=item_filter or strpos(lower(t.name),item_filter)>0)), '[]'::jsonb)
    from requested r;
end;
$$;

revoke all on function public.get_pharmflow_movement_source_batch_v1(uuid,text[],text) from public, anon, authenticated;
grant execute on function public.get_pharmflow_movement_source_batch_v1(uuid,text[],text) to authenticated;
commit;
