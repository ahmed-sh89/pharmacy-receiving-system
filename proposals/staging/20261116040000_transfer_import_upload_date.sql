begin;

create index transfer_documents_by_upload
    on pharmflow_transfer_private.documents (pharmacy_id, imported_at desc, number);

create function public.list_pharmflow_transfer_imports_v2(
    p_pharmacy_id uuid, p_order text, p_from date, p_to date, p_offset integer default 0)
returns table(number text, source text, received_date date, imported_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
    order_filter text := upper(btrim(coalesce(p_order,'')));
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'RECEIVING', true, 'list_pharmflow_transfer_imports_v2');
    if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if length(order_filter) > 100 or (order_filter = '' and (p_from is null or p_to is null))
        or p_from > p_to or p_offset is null or p_offset < 0 then raise exception 'Invalid import search'; end if;

    return query
    select d.number,d.source,d.received_date,d.imported_at
    from pharmflow_transfer_private.documents d
    where d.pharmacy_id=p_pharmacy_id and (order_filter = '' or d.number=order_filter)
        and (p_from is null or d.imported_at >= (p_from::timestamp at time zone 'Asia/Riyadh'))
        and (p_to is null or d.imported_at < ((p_to+1)::timestamp at time zone 'Asia/Riyadh'))
    order by d.imported_at desc,d.number limit 101 offset p_offset;
end;
$$;

revoke all on function public.list_pharmflow_transfer_imports_v2(uuid,text,date,date,integer) from public, anon, authenticated;
grant execute on function public.list_pharmflow_transfer_imports_v2(uuid,text,date,date,integer) to authenticated;
commit;
