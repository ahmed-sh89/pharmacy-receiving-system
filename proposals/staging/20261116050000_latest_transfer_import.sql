begin;

create function public.get_pharmflow_latest_transfer_import_v1(p_pharmacy_id uuid)
returns table(number text, received_date date, imported_at timestamptz, batch_size integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'RECEIVING', true, 'get_pharmflow_latest_transfer_import_v1');
    if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;

    return query
    select latest.number, latest.received_date, latest.imported_at,
        (select count(*)::integer from pharmflow_transfer_private.documents d
         where d.pharmacy_id=p_pharmacy_id and d.imported_at=latest.imported_at)
    from (
        select d.number,d.received_date,d.imported_at
        from pharmflow_transfer_private.documents d
        where d.pharmacy_id=p_pharmacy_id
        order by d.imported_at desc,d.number
        limit 1
    ) latest;
end;
$$;

revoke all on function public.get_pharmflow_latest_transfer_import_v1(uuid) from public, anon, authenticated;
grant execute on function public.get_pharmflow_latest_transfer_import_v1(uuid) to authenticated;
commit;
