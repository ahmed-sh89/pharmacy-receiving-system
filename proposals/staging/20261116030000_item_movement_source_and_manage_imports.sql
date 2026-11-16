begin;

create function public.list_pharmflow_movement_archives_v1(p_pharmacy_id uuid, p_from date, p_to date, p_order text)
returns table(archive_id text, order_numbers text[], closed_at timestamptz, archive_payload jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
    if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if p_from is null or p_to is null or p_from > p_to or length(coalesce(p_order,'')) > 100 then
        raise exception 'Invalid movement search';
    end if;
    return query
    select a.archive_id, matching.numbers, a.closed_at, a.archive_payload
    from public.list_pharmflow_finalized_archives(p_pharmacy_id) a
    cross join lateral (
        select array_agg(distinct n.number) as numbers
        from unnest(a.order_numbers) n(number)
        join lateral jsonb_array_elements(case when jsonb_typeof(a.archive_payload->'orderFiles') = 'array'
            then a.archive_payload->'orderFiles' else '[]'::jsonb end) f(file)
          on upper(btrim(coalesce(nullif(f.file->>'documentId',''),f.file->>'orderNumber'))) = upper(btrim(n.number))
        where (coalesce(p_order,'') = '' or upper(btrim(n.number)) = p_order)
          and (f.file->>'orderDate') collate "C" between to_char(p_from,'YYYY-MM-DD') and to_char(p_to,'YYYY-MM-DD')
          and (f.file->>'orderDate') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          and pg_input_is_valid(f.file->>'orderDate','date')
    ) matching
    where matching.numbers is not null;
end;
$$;

create function public.search_pharmflow_transfer_history_v2(
    p_pharmacy_id uuid, p_item text, p_source text, p_order text, p_from date, p_to date, p_offset integer default 0)
returns table(number text, source text, destination text, received_date date, code text, name text, quantity numeric)
language plpgsql stable security definer set search_path = ''
as $$
declare
    item_filter text := lower(btrim(coalesce(p_item,'')));
    source_filter text := lower(btrim(coalesce(p_source,'')));
    order_filter text := upper(btrim(coalesce(p_order,'')));
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'RECEIVING', false, 'search_pharmflow_transfer_history_v2');
    if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if (item_filter = '' and source_filter = '') or length(item_filter) > 160 or length(source_filter) > 160
        or length(order_filter) > 100 or p_from is null or p_to is null or p_from > p_to
        or p_offset is null or p_offset < 0 then raise exception 'Invalid transfer search'; end if;

    return query
    select d.number,d.source,d.destination,d.received_date,i.code,i.name,i.quantity
    from pharmflow_transfer_private.documents d
    join pharmflow_transfer_private.items i using (pharmacy_id,number)
    where d.pharmacy_id=p_pharmacy_id and d.received_date between p_from and p_to
        and (order_filter = '' or d.number=order_filter)
        and (item_filter = '' or lower(i.code)=item_filter or strpos(lower(i.name),item_filter)>0)
        and (source_filter = '' or d.source=upper(source_filter) or strpos(lower(d.source),source_filter)>0 or exists (
            select 1 from public.pharmacies p where p.code=d.source and strpos(lower(p.name),source_filter)>0
        ))
    order by d.received_date desc,d.number,i.line_no limit 501 offset p_offset;
end;
$$;

create function public.list_pharmflow_transfer_imports_v1(
    p_pharmacy_id uuid, p_order text, p_from date, p_to date, p_offset integer default 0)
returns table(number text, source text, received_date date, imported_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
    order_filter text := upper(btrim(coalesce(p_order,'')));
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'RECEIVING', true, 'list_pharmflow_transfer_imports_v1');
    if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if length(order_filter) > 100 or (order_filter = '' and (p_from is null or p_to is null))
        or p_from > p_to or p_offset is null or p_offset < 0 then raise exception 'Invalid import search'; end if;
    return query
    select d.number,d.source,d.received_date,d.imported_at
    from pharmflow_transfer_private.documents d
    where d.pharmacy_id=p_pharmacy_id and (order_filter = '' or d.number=order_filter)
        and (p_from is null or d.received_date >= p_from)
        and (p_to is null or d.received_date <= p_to)
    order by d.received_date desc,d.number limit 101 offset p_offset;
end;
$$;

create function public.delete_pharmflow_transfer_imports_v1(p_pharmacy_id uuid, p_imports jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
    deleted integer;
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'RECEIVING', true, 'delete_pharmflow_transfer_imports_v1');
    if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if p_imports is null or jsonb_typeof(p_imports) <> 'array' then raise exception 'Invalid import selection'; end if;
    if jsonb_array_length(p_imports) not between 1 and 100 then raise exception 'Select up to 100 imports'; end if;

    delete from pharmflow_transfer_private.documents d
    using jsonb_to_recordset(p_imports) as selected(number text, imported_at timestamptz)
    where d.pharmacy_id=p_pharmacy_id and d.number=selected.number and d.imported_at=selected.imported_at;
    get diagnostics deleted = row_count;
    if deleted <> jsonb_array_length(p_imports) then
        raise exception 'An import changed since selection. Search again before deleting.';
    end if;
    return deleted;
end;
$$;

revoke all on function public.list_pharmflow_movement_archives_v1(uuid,date,date,text),
    public.search_pharmflow_transfer_history_v2(uuid,text,text,text,date,date,integer),
    public.list_pharmflow_transfer_imports_v1(uuid,text,date,date,integer),
    public.delete_pharmflow_transfer_imports_v1(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.list_pharmflow_movement_archives_v1(uuid,date,date,text),
    public.search_pharmflow_transfer_history_v2(uuid,text,text,text,date,date,integer),
    public.list_pharmflow_transfer_imports_v1(uuid,text,date,date,integer),
    public.delete_pharmflow_transfer_imports_v1(uuid,jsonb) to authenticated;
commit;
