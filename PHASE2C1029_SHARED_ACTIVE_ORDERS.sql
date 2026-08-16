-- ============================================================
-- PharmFlow Phase 2C.10.2.9
-- Dedicated pharmacy-wide Active Order Manifest
--
-- WHY:
-- The operational Cloud Workspace also carries device/session state and
-- can be unsuitable as the sole authority for sharing uploaded Order Files.
-- This table is a small structural manifest shared by every authenticated
-- user/device belonging to the same pharmacy.
--
-- Run ONCE in Supabase SQL Editor before testing PC1 <-> PC2.
-- ============================================================

create table if not exists public.pharmflow_active_order_manifest_v1(
    pharmacy_id uuid primary key references public.pharmacies(id) on delete cascade,
    manifest jsonb not null default '{}'::jsonb,
    revision bigint not null default 1,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id)
);

alter table public.pharmflow_active_order_manifest_v1 enable row level security;
revoke all on public.pharmflow_active_order_manifest_v1 from public,anon,authenticated;


create or replace function public.save_pharmflow_active_order_manifest(
    p_pharmacy_id uuid,
    p_manifest jsonb
)
returns table(revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    insert into public.pharmflow_active_order_manifest_v1(
        pharmacy_id,manifest,revision,updated_at,updated_by
    )
    values(
        p_pharmacy_id,
        coalesce(p_manifest,'{}'::jsonb),
        1,
        now(),
        auth.uid()
    )
    on conflict(pharmacy_id)
    do update set
        manifest=excluded.manifest,
        revision=public.pharmflow_active_order_manifest_v1.revision+1,
        updated_at=now(),
        updated_by=auth.uid();

    return query
    select m.revision,m.updated_at
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id;
end;
$$;


create or replace function public.get_pharmflow_active_order_manifest(
    p_pharmacy_id uuid
)
returns table(
    manifest jsonb,
    revision bigint,
    updated_at timestamptz
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
    select m.manifest,m.revision,m.updated_at
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id
      and public.is_pharmacy_member(p_pharmacy_id);
$$;


create or replace function public.clear_pharmflow_active_order_manifest(
    p_pharmacy_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    delete from public.pharmflow_active_order_manifest_v1
    where pharmacy_id=p_pharmacy_id;

    return true;
end;
$$;


revoke all on function public.save_pharmflow_active_order_manifest(uuid,jsonb)
from public,anon;
revoke all on function public.get_pharmflow_active_order_manifest(uuid)
from public,anon;
revoke all on function public.clear_pharmflow_active_order_manifest(uuid)
from public,anon;

grant execute on function public.save_pharmflow_active_order_manifest(uuid,jsonb)
to authenticated;
grant execute on function public.get_pharmflow_active_order_manifest(uuid)
to authenticated;
grant execute on function public.clear_pharmflow_active_order_manifest(uuid)
to authenticated;

select pg_notify('pgrst','reload schema');
