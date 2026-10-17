-- Staging-only read-contract restoration based on read-only Production
-- catalog inspection. Apply ONLY to tovkcakucyagvbzvlnks.
-- Creates empty compatibility relations only; no Production/business data is
-- copied, and no Receiving, Expiry, or Global Master records are written.

-- Needs Review V2 list used by the existing dashboard counter and queue.
create or replace function public.list_pharmflow_needs_review_v4(
    p_pharmacy_id uuid,
    p_workflow text default 'RECEIVING',
    p_order_number text default null
)
returns table(
    review_id uuid, workflow text, session_id text, order_number text,
    order_name text, gtin text, raw_barcode text, pending_quantity integer,
    review_reason text, master_item_code_hint text, master_item_name_hint text,
    photo_path text, source text, device_id text, created_at timestamptz,
    identifier_display text, work_scope_order_numbers text[]
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    return query
    select r.id, r.workflow, coalesce(r.session_id,''), coalesce(r.order_number,''),
           coalesce(r.order_name,''), r.gtin, coalesce(r.raw_barcode,''),
           r.pending_quantity, r.review_reason,
           coalesce(r.master_item_code_hint,''), coalesce(r.master_item_name_hint,''),
           coalesce(r.photo_path,''), r.source, coalesce(r.device_id,''), r.created_at,
           coalesce(r.identifier_display,r.gtin),
           coalesce(r.work_scope_order_numbers,
               case when nullif(btrim(coalesce(r.order_number,'')),'') is null
                    then array[]::text[] else array[r.order_number] end)
    from public.pharmflow_needs_review_v2 r
    where r.pharmacy_id=p_pharmacy_id
      and r.status='PENDING'
      and r.workflow=upper(trim(coalesce(p_workflow,'RECEIVING')))
      and (nullif(trim(coalesce(p_order_number,'')),'') is null
           or r.order_number=trim(p_order_number)
           or trim(p_order_number)=any(coalesce(r.work_scope_order_numbers,array[]::text[])))
    order by r.created_at desc;
end;
$$;

revoke all on function public.list_pharmflow_needs_review_v4(uuid,text,text) from public,anon,authenticated;
grant execute on function public.list_pharmflow_needs_review_v4(uuid,text,text) to authenticated;

-- Empty Receiving order registry and finalized archive structures. Read RPCs
-- retain the approved pharmacy/admin checks; direct API table access stays denied.
create table public.pharmflow_orders (
    id uuid primary key default gen_random_uuid(),
    pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
    order_number text not null,
    order_date date,
    from_warehouse text not null default '',
    to_warehouse text not null default '',
    source_file text not null default '',
    item_count integer not null default 0,
    status text not null default 'uploaded' check (status in ('uploaded','received')),
    uploaded_at timestamptz not null default now(),
    uploaded_by uuid references auth.users(id),
    received_at timestamptz,
    received_by uuid references auth.users(id),
    unique (pharmacy_id, order_number)
);
create index pharmflow_orders_pharmacy_uploaded_idx
    on public.pharmflow_orders (pharmacy_id, uploaded_at desc);
alter table public.pharmflow_orders enable row level security;
revoke all on public.pharmflow_orders from public,anon,authenticated;

create table public.pharmflow_finalized_archives_v1 (
    pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
    archive_id text not null,
    order_numbers text[] not null default '{}'::text[],
    closed_at timestamptz not null default now(),
    archive_payload jsonb not null default '{}'::jsonb,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    primary key (pharmacy_id, archive_id)
);
create index pharmflow_finalized_archives_pharmacy_closed_idx
    on public.pharmflow_finalized_archives_v1 (pharmacy_id, closed_at desc);
alter table public.pharmflow_finalized_archives_v1 enable row level security;
revoke all on public.pharmflow_finalized_archives_v1 from public,anon,authenticated;

create or replace function public.list_pharmflow_orders(p_pharmacy_id uuid)
returns setof public.pharmflow_orders
language sql security definer
set search_path = public, pg_temp
as $$
    select * from public.pharmflow_orders
    where pharmacy_id=p_pharmacy_id
      and auth.uid() is not null
      and public.is_pharmacy_admin(p_pharmacy_id)
    order by uploaded_at desc;
$$;
revoke all on function public.list_pharmflow_orders(uuid) from public,anon,authenticated;
grant execute on function public.list_pharmflow_orders(uuid) to authenticated;

create or replace function public.list_pharmflow_finalized_archives(p_pharmacy_id uuid)
returns table(archive_id text, order_numbers text[], closed_at timestamptz, archive_payload jsonb)
language sql stable security definer
set search_path = public, pg_temp
as $$
    select a.archive_id,a.order_numbers,a.closed_at,a.archive_payload
    from public.pharmflow_finalized_archives_v1 a
    where a.pharmacy_id=p_pharmacy_id
      and public.is_pharmacy_member(p_pharmacy_id)
    order by a.closed_at desc;
$$;
revoke all on function public.list_pharmflow_finalized_archives(uuid) from public,anon,authenticated;
grant execute on function public.list_pharmflow_finalized_archives(uuid) to authenticated;

-- Global GTIN read schema and exact read contracts. Staging remains empty until
-- its independently approved dataset is loaded; this does not copy Production
-- GTIN data or fabricate a metadata record.
create table public.pharmflow_global_gtin_v1 (
    id bigserial primary key,
    item_code text not null,
    gtin text not null,
    item_name text not null default '',
    category text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    group_name text not null default '',
    sub_category text not null default '',
    unique (item_code, gtin)
);
alter table public.pharmflow_global_gtin_v1 enable row level security;
revoke all on public.pharmflow_global_gtin_v1 from public,anon,authenticated;

create table public.pharmflow_global_gtin_meta_v1 (
    singleton boolean primary key default true check (singleton),
    version text not null default gen_random_uuid()::text,
    source_file text not null default '',
    item_count integer not null default 0,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id)
);
alter table public.pharmflow_global_gtin_meta_v1 enable row level security;
revoke all on public.pharmflow_global_gtin_meta_v1 from public,anon,authenticated;

create or replace function public.get_global_master_gtin_meta()
returns table(version text, source_file text, item_count integer, updated_at timestamptz)
language plpgsql stable security definer
set search_path = public
as $$
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    return query
    select m.version,m.source_file,m.item_count,m.updated_at
    from public.pharmflow_global_gtin_meta_v1 m where m.singleton=true;
end;
$$;
revoke all on function public.get_global_master_gtin_meta() from public,anon,authenticated;
grant execute on function public.get_global_master_gtin_meta() to authenticated;

create or replace function public.get_global_master_gtin_page_v2(p_offset integer default 0,p_limit integer default 1000)
returns table(item_code text,gtin text,item_name text,group_name text,category text,sub_category text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    return query
    select g.item_code,g.gtin,g.item_name,g.group_name,g.category,g.sub_category
    from public.pharmflow_global_gtin_v1 g
    order by g.id
    offset greatest(coalesce(p_offset,0),0)
    limit least(greatest(coalesce(p_limit,1000),1),2000);
end;
$$;
revoke all on function public.get_global_master_gtin_page_v2(integer,integer) from public,anon,authenticated;
grant execute on function public.get_global_master_gtin_page_v2(integer,integer) to authenticated;

notify pgrst, 'reload schema';
