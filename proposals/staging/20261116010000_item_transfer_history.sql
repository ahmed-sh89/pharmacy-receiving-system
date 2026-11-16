-- Candidate for Staging. Apply only to the explicitly approved project.
begin;

create schema pharmflow_transfer_private;
revoke all on schema pharmflow_transfer_private from public, anon, authenticated;

create table pharmflow_transfer_private.documents (
    pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
    number text not null,
    source text not null,
    destination text not null,
    received_date date not null,
    imported_by uuid not null,
    imported_at timestamptz not null default now(),
    content_fingerprint text not null,
    primary key (pharmacy_id, number)
);
create index transfer_documents_by_date
    on pharmflow_transfer_private.documents (pharmacy_id, received_date desc, number);
create table pharmflow_transfer_private.items (
    pharmacy_id uuid not null,
    number text not null,
    code text not null,
    name text not null,
    quantity numeric not null check (quantity between 0 and 1000000000),
    line_no integer not null,
    primary key (pharmacy_id, number, line_no),
    foreign key (pharmacy_id, number) references pharmflow_transfer_private.documents on delete cascade
);
create index transfer_items_by_code on pharmflow_transfer_private.items (pharmacy_id, code, number);
alter table pharmflow_transfer_private.documents enable row level security;
alter table pharmflow_transfer_private.items enable row level security;
revoke all on all tables in schema pharmflow_transfer_private from public, anon, authenticated;

create function public.import_pharmflow_transfer_history_v1(p_pharmacy_id uuid, p_transfers jsonb)
returns table(number text, outcome text)
language plpgsql security definer set search_path = ''
as $$
declare
    pharmacy_code text;
    transfer jsonb;
    item_rows jsonb;
    fingerprint text;
    v_number text;
    v_source text;
    v_destination text;
    v_date date;
    saved_fingerprint text;
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'RECEIVING', true, 'import_pharmflow_transfer_history_v1');
    if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    select upper(p.code) into strict pharmacy_code from public.pharmacies p where p.id = p_pharmacy_id;
    if jsonb_typeof(p_transfers) is distinct from 'array' then raise exception 'Expected a transfer array'; end if;
    if jsonb_array_length(p_transfers) not between 1 and 25 or octet_length(p_transfers::text) > 2097152 then
        raise exception 'Transfer batch exceeds size limit';
    end if;

    for transfer in select value from jsonb_array_elements(p_transfers) with ordinality
        order by upper(btrim(value->>'number')), ordinality loop
        v_number := upper(btrim(transfer->>'number'));
        v_source := upper(btrim(transfer->>'source'));
        v_destination := upper(btrim(transfer->>'destination'));
        v_date := (transfer->>'date')::date;
        if upper(btrim(transfer->>'user_id')) is distinct from pharmacy_code then
            raise exception 'File User ID does not match this pharmacy' using errcode = '42501';
        end if;
        if v_number is null or v_number !~ '^TO-[0-9]{1,30}$' or v_source is null
            or length(v_source) not between 1 and 64 or v_destination is null
            or length(v_destination) not between 1 and 64 or v_date is null
            or jsonb_typeof(transfer->'items') is distinct from 'array' then
            raise exception 'Invalid transfer metadata';
        end if;
        if jsonb_array_length(transfer->'items') not between 1 and 5000 then
            raise exception 'Invalid item count';
        end if;
        if exists (select 1 from jsonb_to_recordset(transfer->'items') as r(code text, name text, quantity numeric)
            where r.code is null or length(btrim(r.code)) not between 1 and 64
               or r.name is null or length(btrim(r.name)) not between 1 and 250
               or r.quantity is null or r.quantity not between 0 and 1000000000 or scale(r.quantity) > 6) then
            raise exception 'Invalid transfer item';
        end if;
        select jsonb_agg(jsonb_build_array(btrim(r.code),btrim(r.name),trim_scale(r.quantity))
            order by btrim(r.code) collate "C", btrim(r.name) collate "C", trim_scale(r.quantity))
        into item_rows from jsonb_to_recordset(transfer->'items') as r(code text, name text, quantity numeric);
        fingerprint := encode(sha256(convert_to(jsonb_build_array(v_source,v_destination,v_date,item_rows)::text,'UTF8')), 'hex');

        insert into pharmflow_transfer_private.documents(pharmacy_id,number,source,destination,received_date,imported_by,content_fingerprint)
        values(p_pharmacy_id,v_number,v_source,v_destination,v_date,auth.uid(),fingerprint)
        on conflict on constraint documents_pkey do nothing;
        if found then
            insert into pharmflow_transfer_private.items(pharmacy_id,number,code,name,quantity,line_no)
            select p_pharmacy_id,v_number,row.value->>0,row.value->>1,(row.value->>2)::numeric,row.ordinality
            from jsonb_array_elements(item_rows) with ordinality as row(value,ordinality);
            outcome := 'imported';
        else
            select d.content_fingerprint into strict saved_fingerprint from pharmflow_transfer_private.documents d
            where d.pharmacy_id=p_pharmacy_id and d.number=v_number;
            outcome := case when saved_fingerprint = fingerprint then 'duplicate' else 'conflict' end;
        end if;
        number := v_number;
        return next;
    end loop;
end;
$$;

create function public.search_pharmflow_transfer_history_v1(
    p_pharmacy_id uuid, p_item text, p_from date, p_to date, p_offset integer default 0)
returns table(number text, source text, destination text, received_date date, code text, name text, quantity numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'RECEIVING', false, 'search_pharmflow_transfer_history_v1');
    if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if p_item is null or length(btrim(p_item)) not between 1 and 160 or p_from is null or p_to is null
        or p_from > p_to or p_offset is null or p_offset < 0 then raise exception 'Invalid transfer search'; end if;
    return query
    select d.number,d.source,d.destination,d.received_date,i.code,i.name,i.quantity
    from pharmflow_transfer_private.documents d
    join pharmflow_transfer_private.items i using (pharmacy_id,number)
    where d.pharmacy_id=p_pharmacy_id and d.received_date between p_from and p_to
        and (i.code=btrim(p_item) or strpos(lower(i.name),lower(btrim(p_item))) > 0)
    order by d.received_date desc,d.number,i.line_no limit 101 offset p_offset;
end;
$$;

revoke all on function public.import_pharmflow_transfer_history_v1(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.search_pharmflow_transfer_history_v1(uuid,text,date,date,integer) from public, anon, authenticated;
grant execute on function public.import_pharmflow_transfer_history_v1(uuid,jsonb) to authenticated;
grant execute on function public.search_pharmflow_transfer_history_v1(uuid,text,date,date,integer) to authenticated;
commit;
