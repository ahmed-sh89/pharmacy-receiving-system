
-- ============================================================
-- PharmFlow Phase 2C.10.4.9
-- NEEDS REVIEW SUBSYSTEM REBUILD
--
-- Fresh subsystem. The application switches to V2.
-- Existing V1 data/tables are NOT dropped.
--
-- Guarantees:
-- * Pharmacy/account isolation
-- * Unknown GTIN draft is persisted immediately
-- * Optional private photo evidence
-- * Exact Physical Qty editing
-- * Explicit review reasons / resolution types
-- * PC review survives refresh/sign-in
-- * Global GTIN Master is NOT modified by this migration
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.pharmflow_needs_review_v2 (
    id uuid primary key default gen_random_uuid(),
    pharmacy_id uuid not null,
    workflow text not null default 'RECEIVING',
    session_id text,
    order_number text,
    order_name text,
    gtin text not null,
    raw_barcode text,
    pending_quantity integer not null default 1 check (pending_quantity > 0),
    review_reason text not null default 'UNKNOWN_GTIN',
    master_item_code_hint text,
    master_item_name_hint text,
    photo_path text,
    source text not null default 'HANDHELD',
    device_id text,
    status text not null default 'PENDING',
    resolved_item_code text,
    resolved_item_name text,
    resolution_type text,
    resolution_transaction_id text,
    created_by uuid not null default auth.uid(),
    resolved_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    resolved_at timestamptz,
    constraint pharmflow_needs_review_v2_workflow_check
        check (workflow in ('RECEIVING','EXPIRY')),
    constraint pharmflow_needs_review_v2_reason_check
        check (review_reason in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED')),
    constraint pharmflow_needs_review_v2_source_check
        check (source in ('HANDHELD','PC')),
    constraint pharmflow_needs_review_v2_status_check
        check (status in ('PENDING','RESOLVED','DELETED')),
    constraint pharmflow_needs_review_v2_resolution_check
        check (
            resolution_type is null
            or resolution_type in ('LINK_ORDER_ITEM','ADD_UNORDERED')
        )
);

create index if not exists idx_pf_nr_v2_pending
    on public.pharmflow_needs_review_v2(pharmacy_id, workflow, status, created_at desc);

create index if not exists idx_pf_nr_v2_gtin
    on public.pharmflow_needs_review_v2(pharmacy_id, gtin, status);

alter table public.pharmflow_needs_review_v2 enable row level security;

drop policy if exists pf_nr_v2_select on public.pharmflow_needs_review_v2;
create policy pf_nr_v2_select
on public.pharmflow_needs_review_v2
for select
to authenticated
using (public.is_pharmacy_member(pharmacy_id));

drop policy if exists pf_nr_v2_insert on public.pharmflow_needs_review_v2;
create policy pf_nr_v2_insert
on public.pharmflow_needs_review_v2
for insert
to authenticated
with check (
    public.is_pharmacy_member(pharmacy_id)
    and created_by = auth.uid()
);

drop policy if exists pf_nr_v2_update on public.pharmflow_needs_review_v2;
create policy pf_nr_v2_update
on public.pharmflow_needs_review_v2
for update
to authenticated
using (public.is_pharmacy_member(pharmacy_id))
with check (public.is_pharmacy_member(pharmacy_id));

-- ------------------------------------------------------------
-- PRIVATE PHOTO BUCKET
-- ------------------------------------------------------------
insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'pharmflow-needs-review',
    'pharmflow-needs-review',
    false,
    5242880,
    array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pf_nr_photo_select on storage.objects;
create policy pf_nr_photo_select
on storage.objects
for select
to authenticated
using (
    bucket_id = 'pharmflow-needs-review'
    and public.is_pharmacy_member(
        ((storage.foldername(name))[1])::uuid
    )
);

drop policy if exists pf_nr_photo_insert on storage.objects;
create policy pf_nr_photo_insert
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'pharmflow-needs-review'
    and public.is_pharmacy_member(
        ((storage.foldername(name))[1])::uuid
    )
);

drop policy if exists pf_nr_photo_update on storage.objects;
create policy pf_nr_photo_update
on storage.objects
for update
to authenticated
using (
    bucket_id = 'pharmflow-needs-review'
    and public.is_pharmacy_member(
        ((storage.foldername(name))[1])::uuid
    )
)
with check (
    bucket_id = 'pharmflow-needs-review'
    and public.is_pharmacy_member(
        ((storage.foldername(name))[1])::uuid
    )
);

drop policy if exists pf_nr_photo_delete on storage.objects;
create policy pf_nr_photo_delete
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'pharmflow-needs-review'
    and public.is_pharmacy_admin(
        ((storage.foldername(name))[1])::uuid
    )
);

-- ------------------------------------------------------------
-- CREATE DRAFT — one physical scan = one durable draft.
-- ------------------------------------------------------------
create or replace function public.create_pharmflow_needs_review_v2(
    p_pharmacy_id uuid,
    p_workflow text,
    p_gtin text,
    p_raw_barcode text default null,
    p_session_id text default null,
    p_order_number text default null,
    p_order_name text default null,
    p_review_reason text default 'UNKNOWN_GTIN',
    p_master_item_code_hint text default null,
    p_master_item_name_hint text default null,
    p_source text default 'HANDHELD',
    p_device_id text default null
)
returns table (
    review_id uuid,
    pending_quantity integer,
    created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $$
declare
    v_id uuid;
    v_time timestamptz;
    v_gtin text := regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g');
    v_workflow text := upper(trim(coalesce(p_workflow,'RECEIVING')));
    v_reason text := upper(trim(coalesce(p_review_reason,'UNKNOWN_GTIN')));
    v_source text := upper(trim(coalesce(p_source,'HANDHELD')));
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if v_gtin = '' then
        raise exception 'GTIN is required';
    end if;

    if v_workflow not in ('RECEIVING','EXPIRY') then
        raise exception 'Invalid workflow';
    end if;

    if v_reason not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then
        raise exception 'Invalid review reason';
    end if;

    if v_source not in ('HANDHELD','PC') then
        raise exception 'Invalid source';
    end if;

    insert into public.pharmflow_needs_review_v2 (
        pharmacy_id,
        workflow,
        session_id,
        order_number,
        order_name,
        gtin,
        raw_barcode,
        pending_quantity,
        review_reason,
        master_item_code_hint,
        master_item_name_hint,
        source,
        device_id,
        created_by
    )
    values (
        p_pharmacy_id,
        v_workflow,
        nullif(trim(coalesce(p_session_id,'')),''),
        nullif(trim(coalesce(p_order_number,'')),''),
        nullif(trim(coalesce(p_order_name,'')),''),
        v_gtin,
        nullif(p_raw_barcode,''),
        1,
        v_reason,
        nullif(trim(coalesce(p_master_item_code_hint,'')),''),
        nullif(trim(coalesce(p_master_item_name_hint,'')),''),
        v_source,
        nullif(trim(coalesce(p_device_id,'')),''),
        auth.uid()
    )
    returning id, pharmflow_needs_review_v2.created_at
    into v_id, v_time;

    return query select v_id, 1, v_time;
end;
$$;

-- ------------------------------------------------------------
-- UPDATE PHYSICAL QTY
-- ------------------------------------------------------------
create or replace function public.set_pharmflow_needs_review_qty_v2(
    p_pharmacy_id uuid,
    p_review_id uuid,
    p_pending_quantity integer
)
returns table (
    review_id uuid,
    pending_quantity integer,
    updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $$
declare
    v_qty integer := greatest(coalesce(p_pending_quantity,1),1);
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    update public.pharmflow_needs_review_v2 r
       set pending_quantity = v_qty,
           updated_at = now()
     where r.id = p_review_id
       and r.pharmacy_id = p_pharmacy_id
       and r.status = 'PENDING'
    returning r.id, r.pending_quantity, r.updated_at;

    if not found then
        raise exception 'Pending review item not found';
    end if;
end;
$$;

-- ------------------------------------------------------------
-- ATTACH OPTIONAL PHOTO PATH
-- ------------------------------------------------------------
create or replace function public.set_pharmflow_needs_review_photo_v2(
    p_pharmacy_id uuid,
    p_review_id uuid,
    p_photo_path text
)
returns boolean
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $$
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    update public.pharmflow_needs_review_v2
       set photo_path = nullif(trim(coalesce(p_photo_path,'')),''),
           updated_at = now()
     where id = p_review_id
       and pharmacy_id = p_pharmacy_id
       and status = 'PENDING';

    return found;
end;
$$;

-- ------------------------------------------------------------
-- LIST PENDING — pharmacy scoped; order filter optional.
-- ------------------------------------------------------------
create or replace function public.list_pharmflow_needs_review_v2(
    p_pharmacy_id uuid,
    p_workflow text default 'RECEIVING',
    p_order_number text default null
)
returns table (
    review_id uuid,
    workflow text,
    session_id text,
    order_number text,
    order_name text,
    gtin text,
    raw_barcode text,
    pending_quantity integer,
    review_reason text,
    master_item_code_hint text,
    master_item_name_hint text,
    photo_path text,
    source text,
    device_id text,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select
        r.id,
        r.workflow,
        coalesce(r.session_id,''),
        coalesce(r.order_number,''),
        coalesce(r.order_name,''),
        r.gtin,
        coalesce(r.raw_barcode,''),
        r.pending_quantity,
        r.review_reason,
        coalesce(r.master_item_code_hint,''),
        coalesce(r.master_item_name_hint,''),
        coalesce(r.photo_path,''),
        r.source,
        coalesce(r.device_id,''),
        r.created_at
    from public.pharmflow_needs_review_v2 r
    where r.pharmacy_id = p_pharmacy_id
      and r.status = 'PENDING'
      and r.workflow = upper(trim(coalesce(p_workflow,'RECEIVING')))
      and (
        nullif(trim(coalesce(p_order_number,'')),'') is null
        or coalesce(r.order_number,'') = trim(p_order_number)
      )
    order by r.created_at desc;
end;
$$;

-- ------------------------------------------------------------
-- FINALIZE REVIEW STATUS ONLY.
-- Receiving transaction is generated client-side with a deterministic
-- transaction id based on review_id, preventing duplicate receiving.
-- ------------------------------------------------------------
create or replace function public.resolve_pharmflow_needs_review_v2(
    p_pharmacy_id uuid,
    p_review_id uuid,
    p_item_code text,
    p_item_name text,
    p_resolution_type text,
    p_resolution_transaction_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $$
declare
    v_type text := upper(trim(coalesce(p_resolution_type,'')));
begin
    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if v_type not in ('LINK_ORDER_ITEM','ADD_UNORDERED') then
        raise exception 'Invalid resolution type';
    end if;

    update public.pharmflow_needs_review_v2
       set status = 'RESOLVED',
           resolved_item_code = trim(coalesce(p_item_code,'')),
           resolved_item_name = trim(coalesce(p_item_name,'')),
           resolution_type = v_type,
           resolution_transaction_id = nullif(trim(coalesce(p_resolution_transaction_id,'')),''),
           resolved_by = auth.uid(),
           resolved_at = now(),
           updated_at = now()
     where id = p_review_id
       and pharmacy_id = p_pharmacy_id
       and status = 'PENDING';

    return found;
end;
$$;

create or replace function public.delete_pharmflow_needs_review_v2(
    p_pharmacy_id uuid,
    p_review_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $$
begin
    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    update public.pharmflow_needs_review_v2
       set status='DELETED',
           updated_at=now()
     where id=p_review_id
       and pharmacy_id=p_pharmacy_id
       and status='PENDING';

    return found;
end;
$$;

revoke all on function public.create_pharmflow_needs_review_v2(uuid,text,text,text,text,text,text,text,text,text,text,text) from public,anon;
revoke all on function public.set_pharmflow_needs_review_qty_v2(uuid,uuid,integer) from public,anon;
revoke all on function public.set_pharmflow_needs_review_photo_v2(uuid,uuid,text) from public,anon;
revoke all on function public.list_pharmflow_needs_review_v2(uuid,text,text) from public,anon;
revoke all on function public.resolve_pharmflow_needs_review_v2(uuid,uuid,text,text,text,text) from public,anon;
revoke all on function public.delete_pharmflow_needs_review_v2(uuid,uuid) from public,anon;

grant execute on function public.create_pharmflow_needs_review_v2(uuid,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.set_pharmflow_needs_review_qty_v2(uuid,uuid,integer) to authenticated;
grant execute on function public.set_pharmflow_needs_review_photo_v2(uuid,uuid,text) to authenticated;
grant execute on function public.list_pharmflow_needs_review_v2(uuid,text,text) to authenticated;
grant execute on function public.resolve_pharmflow_needs_review_v2(uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.delete_pharmflow_needs_review_v2(uuid,uuid) to authenticated;

select pg_notify('pgrst','reload schema');
