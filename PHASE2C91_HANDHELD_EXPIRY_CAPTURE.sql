
-- ============================================================
-- PHARMFLOW — PHASE 2C.9.1
-- HANDHELD NEAR EXPIRY + CAPTURED BY
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.pharmflow_expiry_workers_v1 (
    id uuid primary key default gen_random_uuid(),
    pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
    worker_name text not null,
    active boolean not null default true,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists uq_pharmflow_expiry_worker_name_v1
on public.pharmflow_expiry_workers_v1(pharmacy_id, lower(worker_name));

create index if not exists idx_pharmflow_expiry_workers_pharmacy_v1
on public.pharmflow_expiry_workers_v1(pharmacy_id, active, worker_name);

create table if not exists public.pharmflow_expiry_captures_v1 (
    id uuid primary key default gen_random_uuid(),
    pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,

    item_code text not null,
    item_name text not null,
    gtin text not null,
    category text,

    quantity integer not null check (quantity > 0),
    expiry_month integer not null check (expiry_month between 1 and 12),
    expiry_year integer not null check (expiry_year between 2020 and 2200),

    worker_id uuid references public.pharmflow_expiry_workers_v1(id),
    captured_by_name text not null,
    captured_by_user_id uuid references auth.users(id),
    captured_at timestamptz not null default now(),

    device_id text,
    source text not null default 'HANDHELD'
        check (source in ('HANDHELD','PC'))
);

create index if not exists idx_pharmflow_expiry_capture_pharmacy_v1
on public.pharmflow_expiry_captures_v1(pharmacy_id, expiry_year, expiry_month);

create index if not exists idx_pharmflow_expiry_capture_category_v1
on public.pharmflow_expiry_captures_v1(pharmacy_id, category);

create index if not exists idx_pharmflow_expiry_capture_worker_v1
on public.pharmflow_expiry_captures_v1(pharmacy_id, captured_by_name);

alter table public.pharmflow_expiry_workers_v1 enable row level security;
alter table public.pharmflow_expiry_captures_v1 enable row level security;

revoke all on public.pharmflow_expiry_workers_v1 from anon, authenticated;
revoke all on public.pharmflow_expiry_captures_v1 from anon, authenticated;

-- ------------------------------------------------------------
-- List active workers
-- ------------------------------------------------------------
create or replace function public.list_pharmacy_expiry_workers(
    p_pharmacy_id uuid
)
returns table (
    worker_id uuid,
    worker_name text,
    active boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select w.id, w.worker_name, w.active
    from public.pharmflow_expiry_workers_v1 w
    where w.pharmacy_id = p_pharmacy_id
      and w.active = true
    order by lower(w.worker_name);
end;
$$;

-- ------------------------------------------------------------
-- Add / reactivate worker (admin only)
-- ------------------------------------------------------------
create or replace function public.save_pharmacy_expiry_worker(
    p_pharmacy_id uuid,
    p_worker_name text
)
returns table (
    worker_id uuid,
    worker_name text,
    active boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_name text := trim(coalesce(p_worker_name,''));
    v_id uuid;
begin
    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if length(v_name) < 2 then
        raise exception 'Worker name is required';
    end if;

    select w.id into v_id
    from public.pharmflow_expiry_workers_v1 w
    where w.pharmacy_id = p_pharmacy_id
      and lower(w.worker_name) = lower(v_name)
    limit 1;

    if v_id is null then
        insert into public.pharmflow_expiry_workers_v1(
            pharmacy_id, worker_name, active, created_by
        )
        values (
            p_pharmacy_id, v_name, true, auth.uid()
        )
        returning id into v_id;
    else
        update public.pharmflow_expiry_workers_v1 w
        set worker_name = v_name,
            active = true,
            updated_at = now()
        where w.id = v_id;
    end if;

    return query
    select w.id, w.worker_name, w.active
    from public.pharmflow_expiry_workers_v1 w
    where w.id = v_id;
end;
$$;

-- ------------------------------------------------------------
-- Deactivate worker (admin only, history remains intact)
-- ------------------------------------------------------------
create or replace function public.deactivate_pharmacy_expiry_worker(
    p_pharmacy_id uuid,
    p_worker_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    update public.pharmflow_expiry_workers_v1 w
    set active = false,
        updated_at = now()
    where w.id = p_worker_id
      and w.pharmacy_id = p_pharmacy_id;

    return found;
end;
$$;

-- ------------------------------------------------------------
-- Save one expiry capture
-- ------------------------------------------------------------
create or replace function public.save_pharmacy_expiry_capture(
    p_pharmacy_id uuid,
    p_item_code text,
    p_item_name text,
    p_gtin text,
    p_category text,
    p_quantity integer,
    p_expiry_month integer,
    p_expiry_year integer,
    p_worker_id uuid,
    p_device_id text default null,
    p_source text default 'HANDHELD'
)
returns table (
    capture_id uuid,
    captured_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_worker_name text;
    v_capture uuid;
    v_time timestamptz;
    v_gtin text := regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g');
    v_source text := upper(trim(coalesce(p_source,'HANDHELD')));
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if nullif(trim(coalesce(p_item_code,'')),'') is null
       or nullif(trim(coalesce(p_item_name,'')),'') is null
       or v_gtin = '' then
        raise exception 'Item Code, Item Name and GTIN are required';
    end if;

    if coalesce(p_quantity,0) <= 0 then
        raise exception 'Quantity must be greater than zero';
    end if;

    if p_expiry_month not between 1 and 12 then
        raise exception 'Expiry month must be between 1 and 12';
    end if;

    if p_expiry_year not between 2020 and 2200 then
        raise exception 'Expiry year is invalid';
    end if;

    if v_source not in ('HANDHELD','PC') then
        raise exception 'Invalid expiry capture source';
    end if;

    select w.worker_name
    into v_worker_name
    from public.pharmflow_expiry_workers_v1 w
    where w.id = p_worker_id
      and w.pharmacy_id = p_pharmacy_id
      and w.active = true;

    if v_worker_name is null then
        raise exception 'Select an active worker before saving';
    end if;

    insert into public.pharmflow_expiry_captures_v1(
        pharmacy_id,
        item_code,
        item_name,
        gtin,
        category,
        quantity,
        expiry_month,
        expiry_year,
        worker_id,
        captured_by_name,
        captured_by_user_id,
        device_id,
        source
    )
    values (
        p_pharmacy_id,
        trim(p_item_code),
        trim(p_item_name),
        v_gtin,
        nullif(trim(coalesce(p_category,'')),''),
        p_quantity,
        p_expiry_month,
        p_expiry_year,
        p_worker_id,
        v_worker_name,
        auth.uid(),
        nullif(trim(coalesce(p_device_id,'')),''),
        v_source
    )
    returning id, pharmflow_expiry_captures_v1.captured_at
    into v_capture, v_time;

    return query select v_capture, v_time;
end;
$$;

-- ------------------------------------------------------------
-- Reports-ready query for future PC Expiry Reports.
-- All filters are optional.
-- ------------------------------------------------------------
create or replace function public.list_pharmacy_expiry_captures(
    p_pharmacy_id uuid,
    p_expiry_year integer default null,
    p_expiry_months integer[] default null,
    p_categories text[] default null,
    p_worker_ids uuid[] default null,
    p_search text default null
)
returns table (
    capture_id uuid,
    item_code text,
    item_name text,
    gtin text,
    category text,
    quantity integer,
    expiry_month integer,
    expiry_year integer,
    worker_id uuid,
    captured_by_name text,
    captured_at timestamptz,
    device_id text,
    source text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select
        c.id,
        c.item_code,
        c.item_name,
        c.gtin,
        coalesce(c.category,''),
        c.quantity,
        c.expiry_month,
        c.expiry_year,
        c.worker_id,
        c.captured_by_name,
        c.captured_at,
        coalesce(c.device_id,''),
        c.source
    from public.pharmflow_expiry_captures_v1 c
    where c.pharmacy_id = p_pharmacy_id
      and (p_expiry_year is null or c.expiry_year = p_expiry_year)
      and (p_expiry_months is null or c.expiry_month = any(p_expiry_months))
      and (p_categories is null or coalesce(c.category,'') = any(p_categories))
      and (p_worker_ids is null or c.worker_id = any(p_worker_ids))
      and (
          nullif(trim(coalesce(p_search,'')),'') is null
          or lower(c.item_name) like '%' || lower(trim(p_search)) || '%'
          or lower(c.item_code) like '%' || lower(trim(p_search)) || '%'
          or lower(c.gtin) like '%' || lower(trim(p_search)) || '%'
      )
    order by c.expiry_year, c.expiry_month, lower(c.item_name), c.captured_at desc;
end;
$$;

revoke all on function public.list_pharmacy_expiry_workers(uuid) from public, anon;
revoke all on function public.save_pharmacy_expiry_worker(uuid,text) from public, anon;
revoke all on function public.deactivate_pharmacy_expiry_worker(uuid,uuid) from public, anon;
revoke all on function public.save_pharmacy_expiry_capture(uuid,text,text,text,text,integer,integer,integer,uuid,text,text) from public, anon;
revoke all on function public.list_pharmacy_expiry_captures(uuid,integer,integer[],text[],uuid[],text) from public, anon;

grant execute on function public.list_pharmacy_expiry_workers(uuid) to authenticated;
grant execute on function public.save_pharmacy_expiry_worker(uuid,text) to authenticated;
grant execute on function public.deactivate_pharmacy_expiry_worker(uuid,uuid) to authenticated;
grant execute on function public.save_pharmacy_expiry_capture(uuid,text,text,text,text,integer,integer,integer,uuid,text,text) to authenticated;
grant execute on function public.list_pharmacy_expiry_captures(uuid,integer,integer[],text[],uuid[],text) to authenticated;

select pg_notify('pgrst','reload schema');
