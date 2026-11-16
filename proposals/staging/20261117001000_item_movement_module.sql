begin;

alter table public.pharmflow_pharmacy_permissions_v1
 add column item_movement text not null default 'DISABLED'
 check (item_movement in ('FULL','DISABLED'));

-- Retain access where the legacy Receiving reports included Item Movement.
update public.pharmflow_pharmacy_permissions_v1
set item_movement='FULL' where receiving in ('FULL','READ_ONLY');

create function pharmflow_auth_private.item_movement_allowed(pid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select pharmflow_auth_private.password_change_complete() and auth.uid() is not null
 and exists (
   select 1 from public.pharmflow_pharmacy_permissions_v1 a
   join public.pharmacies p on p.id=a.pharmacy_id
   where p.id=pid and p.active and p.status='active' and a.item_movement='FULL'
   and (public.is_system_owner() or exists (
      select 1 from public.pharmacy_members m
      where m.pharmacy_id=pid and m.user_id=auth.uid() and m.active and m.role='admin'
   ))
 )
$$;
revoke all on function pharmflow_auth_private.item_movement_allowed(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION pharmflow_auth_private.require_access(pid uuid, mod text, writing boolean, src text, op text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF NOT (CASE WHEN mod='ITEM_MOVEMENT' THEN pharmflow_auth_private.item_movement_allowed(pid)
  WHEN mod='DATA' THEN pharmflow_auth_private.data_allowed(pid,writing)
  WHEN mod='GLOBAL' THEN pharmflow_auth_private.global_allowed()
  ELSE pharmflow_auth_private.module_allowed(pid,mod,writing) END) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PHARMFLOW_PERMISSION_DENIED',DETAIL=mod;
 END IF;
 IF pid IS NOT NULL THEN PERFORM set_config('pharmflow.permission_pharmacy',pid::text,true); END IF;
 PERFORM set_config('pharmflow.permission_source',src,true);
 IF op IS NOT NULL THEN PERFORM set_config('pharmflow.permission_operation',op,true); END IF;
END $function$
;
CREATE OR REPLACE FUNCTION public.owner_set_pharmflow_permissions_v3(p_pharmacy_id uuid, p_receiving text, p_expiry text, p_data_access text, p_duty text, p_item_movement text, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare oldrow public.pharmflow_pharmacy_permissions_v1;newrow public.pharmflow_pharmacy_permissions_v1;
begin
 if not pharmflow_auth_private.password_change_complete() or not public.is_system_owner() then
  raise exception 'System Administrator required' using errcode='42501';end if;
 if p_duty is null or p_duty not in ('FULL','DISABLED') then raise exception 'Select Duty Enabled or Disabled';end if;
 if p_item_movement is null or p_item_movement not in ('FULL','DISABLED') then raise exception 'Select Item Movement Enabled or Disabled';end if;
 select * into oldrow from public.pharmflow_pharmacy_permissions_v1 where pharmacy_id=p_pharmacy_id for update;
 if not found then raise exception 'Pharmacy policy missing';end if;
 if p_expected_revision is null or oldrow.revision<>p_expected_revision then raise exception 'Permission policy changed; reload';end if;
 update public.pharmflow_pharmacy_permissions_v1 set receiving=p_receiving,expiry=p_expiry,data_access=p_data_access,duty=p_duty,item_movement=p_item_movement,
 revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where pharmacy_id=p_pharmacy_id returning * into newrow;
 insert into public.pharmflow_permission_audit_v1(pharmacy_id,actor,before_value,after_value)
 values(p_pharmacy_id,auth.uid(),to_jsonb(oldrow),to_jsonb(newrow));
 return to_jsonb(newrow);
end $function$
;
revoke all on function public.owner_set_pharmflow_permissions_v3(uuid,text,text,text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.owner_set_pharmflow_permissions_v3(uuid,text,text,text,text,text,bigint) to authenticated;

CREATE OR REPLACE FUNCTION public.delete_pharmflow_transfer_imports_v1(p_pharmacy_id uuid, p_imports jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    deleted integer;
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'ITEM_MOVEMENT', true, 'delete_pharmflow_transfer_imports_v1');
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
$function$
;

CREATE OR REPLACE FUNCTION public.import_pharmflow_transfer_history_v1(p_pharmacy_id uuid, p_transfers jsonb)
 RETURNS TABLE(number text, outcome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'ITEM_MOVEMENT', true, 'import_pharmflow_transfer_history_v1');
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
$function$
;

CREATE OR REPLACE FUNCTION public.list_pharmflow_transfer_imports_v1(p_pharmacy_id uuid, p_order text, p_from date, p_to date, p_offset integer DEFAULT 0)
 RETURNS TABLE(number text, source text, received_date date, imported_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    order_filter text := upper(btrim(coalesce(p_order,'')));
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'ITEM_MOVEMENT', true, 'list_pharmflow_transfer_imports_v1');
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
$function$
;

CREATE OR REPLACE FUNCTION public.list_pharmflow_transfer_imports_v2(p_pharmacy_id uuid, p_order text, p_from date, p_to date, p_offset integer DEFAULT 0)
 RETURNS TABLE(number text, source text, received_date date, imported_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    order_filter text := upper(btrim(coalesce(p_order,'')));
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'ITEM_MOVEMENT', true, 'list_pharmflow_transfer_imports_v2');
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
$function$
;

CREATE OR REPLACE FUNCTION public.search_pharmflow_transfer_history_v1(p_pharmacy_id uuid, p_item text, p_from date, p_to date, p_offset integer DEFAULT 0)
 RETURNS TABLE(number text, source text, destination text, received_date date, code text, name text, quantity numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'ITEM_MOVEMENT', false, 'search_pharmflow_transfer_history_v1');
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
$function$
;

CREATE OR REPLACE FUNCTION public.search_pharmflow_transfer_history_v2(p_pharmacy_id uuid, p_item text, p_source text, p_order text, p_from date, p_to date, p_offset integer DEFAULT 0)
 RETURNS TABLE(number text, source text, destination text, received_date date, code text, name text, quantity numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    item_filter text := lower(btrim(coalesce(p_item,'')));
    source_filter text := lower(btrim(coalesce(p_source,'')));
    order_filter text := upper(btrim(coalesce(p_order,'')));
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'ITEM_MOVEMENT', false, 'search_pharmflow_transfer_history_v2');
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_pharmflow_latest_transfer_import_v1(p_pharmacy_id uuid)
 RETURNS TABLE(number text, received_date date, imported_at timestamp with time zone, batch_size integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
    perform pharmflow_auth_private.require_access(p_pharmacy_id, 'ITEM_MOVEMENT', true, 'get_pharmflow_latest_transfer_import_v1');
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
$function$
;

create function public.search_pharmflow_item_movement_v1(
 p_pharmacy_id uuid, p_item text, p_source text, p_order text,
 p_from date, p_to date, p_offset integer default 0)
returns table(number text, source text, received_date date, code text, name text, quantity numeric, origin text)
language plpgsql stable security definer set search_path = ''
as $$
declare
 item_filter text := lower(btrim(coalesce(p_item,'')));
 source_filter text := lower(btrim(coalesce(p_source,'')));
 order_filter text := regexp_replace(upper(regexp_replace(coalesce(p_order,''),'[[:space:]]','','g')),
    '^(TO-[0-9]+)-[0-9]+-[0-9]+$', '\1');
 include_receiving boolean;
begin
 perform pharmflow_auth_private.require_access(p_pharmacy_id,'ITEM_MOVEMENT',false,'search_pharmflow_item_movement_v1');
 if (item_filter='' and source_filter='' and order_filter='') or length(item_filter)>160 or length(source_filter)>160
    or length(order_filter)>100 or p_from is null or p_to is null or p_from>p_to or p_offset is null or p_offset<0
    then raise exception 'Invalid movement search';
 end if;
 select a.receiving in ('FULL','READ_ONLY') into include_receiving
 from public.pharmflow_pharmacy_permissions_v1 a where a.pharmacy_id=p_pharmacy_id;
 return query
 with registry as (
    select o.id,
       regexp_replace(upper(regexp_replace(o.order_number,'[[:space:]]','','g')),
        '^(TO-[0-9]+)-[0-9]+-[0-9]+$', '\1') as number,
       nullif(btrim(o.from_warehouse),'') as source, o.order_date as movement_date,
       o.uploaded_at
    from public.pharmflow_orders o
    where include_receiving and o.pharmacy_id=p_pharmacy_id
      and exists (select 1 from public.pharmflow_order_source_items i where i.pharmacy_id=p_pharmacy_id and i.order_id=o.id)
 ), orders as (
    select distinct on (r.number) r.*
    from registry r
    where order_filter='' or r.number=order_filter
    order by r.number,r.uploaded_at desc,r.id
 ), lines as (
    select o.number,coalesce(o.source,'—') source,o.movement_date,i.item_code raw_code,i.item_name name,
       i.ordered_qty quantity,'Orders'::text origin,i.line_no::bigint as line_no
    from orders o join public.pharmflow_order_source_items i on i.order_id=o.id and i.pharmacy_id=p_pharmacy_id
    where o.movement_date between p_from and p_to
    union all
    select d.number,d.source,d.received_date,i.code,i.name,i.quantity,'Import'::text,i.line_no::bigint
    from pharmflow_transfer_private.documents d
    join pharmflow_transfer_private.items i using (pharmacy_id,number)
    where d.pharmacy_id=p_pharmacy_id and d.received_date between p_from and p_to
       and (order_filter='' or d.number=order_filter)
       and not exists (select 1 from orders o where o.number=d.number)
 ), cleaned as (
    select l.*,upper(regexp_replace(replace(regexp_replace(l.raw_code,'^''+',''),chr(160),''),'[[:space:]]','','g')) clean_code
    from lines l
 ), normalized as (
    select c.*,case when c.clean_code ~ '^[0-9]+(\.0+)?$'
      then coalesce(nullif(ltrim(split_part(c.clean_code,'.',1),'0'),''),'0') else c.clean_code end as normalized_code
    from cleaned c
 ), grouped as (
    select n.number,n.source,n.movement_date,n.normalized_code,n.origin,
       (array_agg(n.name order by n.line_no) filter (where n.name<>''))[1] as name,
       sum(coalesce(n.quantity,0)) as qty,
       bool_or(item_filter='' or lower(n.normalized_code)=item_filter or lower(n.raw_code)=item_filter
            or strpos(lower(n.name),item_filter)>0) as matches
    from normalized n
    where n.normalized_code<>''
      and (source_filter='' or strpos(lower(n.source),source_filter)>0 or exists (
          select 1 from public.pharmacies p where lower(p.code)=lower(n.source)
          and strpos(lower(p.name),source_filter)>0))
    group by n.number,n.source,n.movement_date,n.normalized_code,n.origin
 )
 select g.number,g.source,g.movement_date,g.normalized_code,g.name,g.qty,g.origin
 from grouped g where g.matches
 order by g.movement_date desc,g.number,g.normalized_code limit 501 offset p_offset;
end
$$;
revoke all on function public.search_pharmflow_item_movement_v1(uuid,text,text,text,date,date,integer) from public, anon, authenticated;
grant execute on function public.search_pharmflow_item_movement_v1(uuid,text,text,text,date,date,integer) to authenticated;

commit;
