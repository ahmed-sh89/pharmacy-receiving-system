-- ============================================================
-- PharmFlow Phase 2C.10.3.6
-- Active Order Manifest — Server Push / Verification Fix
--
-- Run ONCE in Supabase SQL Editor before testing.
-- Safe: does not delete Orders, Archive, Global Master or Receiving data.
-- ============================================================

create table if not exists public.pharmflow_active_order_manifest_v1(
    pharmacy_id uuid primary key references public.pharmacies(id) on delete cascade,
    manifest jsonb not null default '{}'::jsonb,
    revision bigint not null default 1,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id)
);

alter table public.pharmflow_active_order_manifest_v1 enable row level security;
revoke all on public.pharmflow_active_order_manifest_v1
from public,anon,authenticated;


-- Self-contained access check for this manifest.
-- Avoids depending on older helper RPCs whose definitions may differ
-- between deployments.
create or replace function public.pharmflow_manifest_member_v2(
    p_pharmacy_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
    select
        auth.uid() is not null
        and (
            exists(
                select 1
                from public.system_owners so
                where so.user_id=auth.uid()
            )
            or exists(
                select 1
                from public.pharmacy_members pm
                where pm.pharmacy_id=p_pharmacy_id
                  and pm.user_id=auth.uid()
            )
        );
$$;


create or replace function public.save_pharmflow_active_order_manifest_v2(
    p_pharmacy_id uuid,
    p_manifest jsonb
)
returns table(
    revision bigint,
    updated_at timestamptz,
    order_files integer,
    order_items integer
)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
    v_files integer;
    v_items integer;
begin
    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    v_files :=
        jsonb_array_length(
            coalesce(p_manifest->'orderFiles','[]'::jsonb)
        );

    v_items :=
        jsonb_array_length(
            coalesce(p_manifest->'orderData','[]'::jsonb)
        );

    if v_files <= 0 or v_items <= 0 then
        raise exception
            'Active Order Manifest requires orderFiles and orderData';
    end if;

    insert into public.pharmflow_active_order_manifest_v1(
        pharmacy_id,
        manifest,
        revision,
        updated_at,
        updated_by
    )
    values(
        p_pharmacy_id,
        p_manifest,
        1,
        now(),
        auth.uid()
    )
    on conflict(pharmacy_id)
    do update set
        manifest=excluded.manifest,
        revision=
            public.pharmflow_active_order_manifest_v1.revision+1,
        updated_at=now(),
        updated_by=auth.uid();

    return query
    select
        m.revision,
        m.updated_at,
        jsonb_array_length(
            coalesce(m.manifest->'orderFiles','[]'::jsonb)
        ),
        jsonb_array_length(
            coalesce(m.manifest->'orderData','[]'::jsonb)
        )
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id;
end;
$$;


create or replace function public.get_pharmflow_active_order_manifest_v2(
    p_pharmacy_id uuid
)
returns table(
    manifest jsonb,
    revision bigint,
    updated_at timestamptz,
    order_files integer,
    order_items integer
)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select
        m.manifest,
        m.revision,
        m.updated_at,
        jsonb_array_length(
            coalesce(m.manifest->'orderFiles','[]'::jsonb)
        ),
        jsonb_array_length(
            coalesce(m.manifest->'orderData','[]'::jsonb)
        )
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id;
end;
$$;


create or replace function public.clear_pharmflow_active_order_manifest_v2(
    p_pharmacy_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    delete from public.pharmflow_active_order_manifest_v1
    where pharmacy_id=p_pharmacy_id;

    return true;
end;
$$;


revoke all on function public.pharmflow_manifest_member_v2(uuid)
from public,anon;
revoke all on function public.save_pharmflow_active_order_manifest_v2(uuid,jsonb)
from public,anon;
revoke all on function public.get_pharmflow_active_order_manifest_v2(uuid)
from public,anon;
revoke all on function public.clear_pharmflow_active_order_manifest_v2(uuid)
from public,anon;

grant execute on function public.pharmflow_manifest_member_v2(uuid)
to authenticated;
grant execute on function public.save_pharmflow_active_order_manifest_v2(uuid,jsonb)
to authenticated;
grant execute on function public.get_pharmflow_active_order_manifest_v2(uuid)
to authenticated;
grant execute on function public.clear_pharmflow_active_order_manifest_v2(uuid)
to authenticated;

select pg_notify('pgrst','reload schema');
