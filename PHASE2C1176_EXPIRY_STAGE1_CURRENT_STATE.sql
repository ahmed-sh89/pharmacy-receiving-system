-- PHARMFLOW — EXPIRY STAGE 1 / BUILD 1
-- Additive current verified state + immutable event history.
-- Existing expiry workers, captures and Needs Review data are intentionally untouched.

create table if not exists public.pharmflow_expiry_current_state_v1 (
    id uuid primary key default gen_random_uuid(),
    pharmacy_id uuid not null,
    item_code text not null,
    item_name text not null,
    identifier_display text not null,
    identifier_key text not null,
    category text,
    batch_no text,
    batch_key text not null default '',
    sample_serial text,
    expiry_month integer not null check (expiry_month between 1 and 12),
    expiry_year integer not null check (expiry_year between 2020 and 2200),
    verified_quantity integer not null check (verified_quantity >= 0),
    worker_id uuid,
    verified_by_name text not null,
    verified_by_user_id uuid,
    last_verified_at timestamptz not null default now(),
    device_id text,
    source text not null check (source in ('HANDHELD','PC')),
    status text not null default 'ACTIVE' check (status in ('ACTIVE','CLEARED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pharmflow_expiry_current_state_v1_identity_uq
        unique (pharmacy_id,item_code,batch_key,expiry_year,expiry_month)
);

create index if not exists pharmflow_expiry_current_state_v1_pharmacy_expiry_idx
    on public.pharmflow_expiry_current_state_v1(pharmacy_id,expiry_year,expiry_month,status);
create index if not exists pharmflow_expiry_current_state_v1_pharmacy_item_idx
    on public.pharmflow_expiry_current_state_v1(pharmacy_id,item_code);

create table if not exists public.pharmflow_expiry_events_v1 (
    id uuid primary key default gen_random_uuid(),
    state_id uuid not null references public.pharmflow_expiry_current_state_v1(id),
    pharmacy_id uuid not null,
    event_type text not null check (event_type in ('CAPTURE','RECOUNT','CLEARED')),
    item_code text not null,
    item_name text not null,
    identifier_display text not null,
    identifier_key text not null,
    category text,
    batch_no text,
    sample_serial text,
    expiry_month integer not null check (expiry_month between 1 and 12),
    expiry_year integer not null check (expiry_year between 2020 and 2200),
    previous_quantity integer,
    verified_quantity integer not null check (verified_quantity >= 0),
    worker_id uuid,
    verified_by_name text not null,
    verified_by_user_id uuid,
    device_id text,
    source text not null check (source in ('HANDHELD','PC')),
    occurred_at timestamptz not null default now()
);

create index if not exists pharmflow_expiry_events_v1_pharmacy_time_idx
    on public.pharmflow_expiry_events_v1(pharmacy_id,occurred_at desc);
create index if not exists pharmflow_expiry_events_v1_state_time_idx
    on public.pharmflow_expiry_events_v1(state_id,occurred_at desc);

alter table public.pharmflow_expiry_current_state_v1 enable row level security;
alter table public.pharmflow_expiry_events_v1 enable row level security;

drop policy if exists pharmflow_expiry_current_state_select_member on public.pharmflow_expiry_current_state_v1;
create policy pharmflow_expiry_current_state_select_member
on public.pharmflow_expiry_current_state_v1
for select to authenticated
using (public.is_pharmacy_member(pharmacy_id));

drop policy if exists pharmflow_expiry_events_select_member on public.pharmflow_expiry_events_v1;
create policy pharmflow_expiry_events_select_member
on public.pharmflow_expiry_events_v1
for select to authenticated
using (public.is_pharmacy_member(pharmacy_id));

revoke all on public.pharmflow_expiry_current_state_v1 from anon;
revoke all on public.pharmflow_expiry_events_v1 from anon;
revoke all on public.pharmflow_expiry_current_state_v1 from authenticated;
revoke all on public.pharmflow_expiry_events_v1 from authenticated;
grant select on public.pharmflow_expiry_current_state_v1 to authenticated;
grant select on public.pharmflow_expiry_events_v1 to authenticated;

create or replace function public.save_pharmacy_expiry_verified_state_v1(
    p_pharmacy_id uuid,
    p_item_code text,
    p_item_name text,
    p_identifier_display text,
    p_category text,
    p_quantity integer,
    p_expiry_month integer,
    p_expiry_year integer,
    p_worker_id uuid,
    p_batch_no text default null,
    p_sample_serial text default null,
    p_device_id text default null,
    p_source text default 'HANDHELD',
    p_event_type text default 'CAPTURE'
)
returns table(state_id uuid,event_id uuid,last_verified_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    v_user uuid := auth.uid();
    v_worker_name text;
    v_identifier_display text := btrim(coalesce(p_identifier_display,''));
    v_identifier_key text;
    v_item_code text := btrim(coalesce(p_item_code,''));
    v_item_name text := btrim(coalesce(p_item_name,''));
    v_batch_no text := nullif(btrim(coalesce(p_batch_no,'')),'');
    v_batch_key text := coalesce(nullif(upper(btrim(coalesce(p_batch_no,''))),''),'');
    v_source text := upper(btrim(coalesce(p_source,'HANDHELD')));
    v_event_type text := upper(btrim(coalesce(p_event_type,'CAPTURE')));
    v_state_id uuid;
    v_event_id uuid;
    v_previous_quantity integer;
    v_now timestamptz := now();
begin
    if v_user is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if v_item_code='' or v_item_name='' or v_identifier_display='' then
        raise exception 'Item Code, Item Name and Identifier are required';
    end if;

    v_identifier_key := public.pharmflow_identifier_key_v2(v_identifier_display);
    if nullif(v_identifier_key,'') is null then
        raise exception 'Identifier is invalid';
    end if;

    if p_quantity is null or p_quantity < 0 then
        raise exception 'Quantity cannot be negative';
    end if;
    if p_expiry_month not between 1 and 12 or p_expiry_year not between 2020 and 2200 then
        raise exception 'Expiry date is invalid';
    end if;
    if v_source not in ('HANDHELD','PC') then
        raise exception 'Invalid expiry source';
    end if;
    if v_event_type not in ('CAPTURE','RECOUNT','CLEARED') then
        raise exception 'Invalid expiry event type';
    end if;
    if (v_event_type='CLEARED' and p_quantity<>0) or (v_event_type<>'CLEARED' and p_quantity=0) then
        raise exception 'Zero quantity must use CLEARED and CLEARED must use zero quantity';
    end if;

    select w.worker_name
      into v_worker_name
      from public.pharmflow_expiry_workers_v1 w
     where w.id=p_worker_id and w.pharmacy_id=p_pharmacy_id and w.active=true;

    if v_worker_name is null then
        raise exception 'Select an active worker before saving';
    end if;

    select s.id,s.verified_quantity
      into v_state_id,v_previous_quantity
      from public.pharmflow_expiry_current_state_v1 s
     where s.pharmacy_id=p_pharmacy_id
       and s.item_code=v_item_code
       and s.batch_key=v_batch_key
       and s.expiry_year=p_expiry_year
       and s.expiry_month=p_expiry_month
     for update;

    if v_state_id is null then
        insert into public.pharmflow_expiry_current_state_v1(
            pharmacy_id,item_code,item_name,identifier_display,identifier_key,category,
            batch_no,batch_key,sample_serial,expiry_month,expiry_year,verified_quantity,
            worker_id,verified_by_name,verified_by_user_id,last_verified_at,device_id,
            source,status
        ) values (
            p_pharmacy_id,v_item_code,v_item_name,v_identifier_display,v_identifier_key,
            nullif(btrim(coalesce(p_category,'')),''),v_batch_no,v_batch_key,
            nullif(btrim(coalesce(p_sample_serial,'')),''),p_expiry_month,p_expiry_year,
            p_quantity,p_worker_id,v_worker_name,v_user,v_now,
            nullif(btrim(coalesce(p_device_id,'')),''),v_source,
            case when p_quantity=0 then 'CLEARED' else 'ACTIVE' end
        )
        returning id into v_state_id;
    else
        update public.pharmflow_expiry_current_state_v1
           set item_name=v_item_name,
               identifier_display=v_identifier_display,
               identifier_key=v_identifier_key,
               category=nullif(btrim(coalesce(p_category,'')),''),
               batch_no=v_batch_no,
               sample_serial=nullif(btrim(coalesce(p_sample_serial,'')),''),
               verified_quantity=p_quantity,
               worker_id=p_worker_id,
               verified_by_name=v_worker_name,
               verified_by_user_id=v_user,
               last_verified_at=v_now,
               device_id=nullif(btrim(coalesce(p_device_id,'')),''),
               source=v_source,
               status=case when p_quantity=0 then 'CLEARED' else 'ACTIVE' end,
               updated_at=v_now
         where id=v_state_id;
    end if;

    insert into public.pharmflow_expiry_events_v1(
        state_id,pharmacy_id,event_type,item_code,item_name,identifier_display,
        identifier_key,category,batch_no,sample_serial,expiry_month,expiry_year,
        previous_quantity,verified_quantity,worker_id,verified_by_name,
        verified_by_user_id,device_id,source,occurred_at
    ) values (
        v_state_id,p_pharmacy_id,v_event_type,v_item_code,v_item_name,
        v_identifier_display,v_identifier_key,nullif(btrim(coalesce(p_category,'')),''),
        v_batch_no,nullif(btrim(coalesce(p_sample_serial,'')),''),p_expiry_month,p_expiry_year,
        v_previous_quantity,p_quantity,p_worker_id,v_worker_name,v_user,
        nullif(btrim(coalesce(p_device_id,'')),''),v_source,v_now
    ) returning id into v_event_id;

    return query select v_state_id,v_event_id,v_now;
end
$function$;

revoke all on function public.save_pharmacy_expiry_verified_state_v1(uuid,text,text,text,text,integer,integer,integer,uuid,text,text,text,text,text) from public;
revoke all on function public.save_pharmacy_expiry_verified_state_v1(uuid,text,text,text,text,integer,integer,integer,uuid,text,text,text,text,text) from anon;
grant execute on function public.save_pharmacy_expiry_verified_state_v1(uuid,text,text,text,text,integer,integer,integer,uuid,text,text,text,text,text) to authenticated;

create or replace function public.list_pharmacy_expiry_current_state_v1(
    p_pharmacy_id uuid,
    p_include_cleared boolean default false,
    p_search text default null
)
returns table(
    state_id uuid,item_code text,item_name text,identifier_display text,category text,
    batch_no text,sample_serial text,expiry_month integer,expiry_year integer,
    verified_quantity integer,worker_id uuid,verified_by_name text,
    last_verified_at timestamptz,source text,status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select s.id,s.item_code,s.item_name,s.identifier_display,coalesce(s.category,''),
           s.batch_no,s.sample_serial,s.expiry_month,s.expiry_year,s.verified_quantity,
           s.worker_id,s.verified_by_name,s.last_verified_at,s.source,s.status
      from public.pharmflow_expiry_current_state_v1 s
     where s.pharmacy_id=p_pharmacy_id
       and (p_include_cleared or s.status='ACTIVE')
       and (
           nullif(btrim(coalesce(p_search,'')),'') is null
           or lower(s.item_name) like '%'||lower(btrim(p_search))||'%'
           or lower(s.item_code) like '%'||lower(btrim(p_search))||'%'
           or lower(s.identifier_display) like '%'||lower(btrim(p_search))||'%'
           or lower(coalesce(s.batch_no,'')) like '%'||lower(btrim(p_search))||'%'
       )
     order by s.expiry_year,s.expiry_month,lower(s.item_name),s.last_verified_at desc;
end
$function$;

revoke all on function public.list_pharmacy_expiry_current_state_v1(uuid,boolean,text) from public;
revoke all on function public.list_pharmacy_expiry_current_state_v1(uuid,boolean,text) from anon;
grant execute on function public.list_pharmacy_expiry_current_state_v1(uuid,boolean,text) to authenticated;
