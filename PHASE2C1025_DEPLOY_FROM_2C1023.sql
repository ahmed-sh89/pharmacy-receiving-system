-- ============================================================
-- PharmFlow Phase 2C.10.2.5
-- DEPLOY THIS ONE FILE if your live site is still on 2C.10.2.3.
--
-- Includes:
-- A) 2C.10.2.4 single-order complete delete cascade
-- B) 2C.10.2.5 atomic current-workspace reset + reset generation guard
--
-- Global GTIN Master, Returns Archive, finalized unrelated orders,
-- users and other pharmacies are NOT affected.
-- ============================================================


-- ============================================================
-- A) COMPLETE SINGLE FINALIZED ORDER DELETE
-- ============================================================

create or replace function public.delete_pharmflow_order_complete(
    p_pharmacy_id uuid,
    p_order_number text,
    p_confirmation text
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
    v_order text:=upper(trim(coalesce(p_order_number,'')));
begin
    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if v_order='' or upper(trim(coalesce(p_confirmation,'')))<>v_order then
        raise exception 'Order confirmation does not match';
    end if;

    delete from public.pharmflow_finalized_archives_v1 a
    where a.pharmacy_id=p_pharmacy_id
      and exists (
          select 1
          from unnest(coalesce(a.order_numbers,'{}'::text[])) n
          where upper(trim(n))=v_order
      );

    delete from public.pharmflow_order_source_items
    where pharmacy_id=p_pharmacy_id
      and upper(trim(order_number))=v_order;

    delete from public.pharmflow_orders
    where pharmacy_id=p_pharmacy_id
      and upper(trim(order_number))=v_order;

    return true;
end;
$$;

revoke all on function public.delete_pharmflow_order_complete(uuid,text,text)
from public,anon;

grant execute on function public.delete_pharmflow_order_complete(uuid,text,text)
to authenticated;


-- ============================================================
-- B) CURRENT-WORKSPACE RESET GENERATION
-- Every pharmacy has a monotonically increasing reset generation.
-- A PC with an older generation is never allowed to save a stale
-- workspace back after another PC has reset it.
-- ============================================================

create table if not exists public.pharmflow_workspace_generation_v1(
    pharmacy_id uuid primary key references public.pharmacies(id) on delete cascade,
    generation bigint not null default 0,
    reset_at timestamptz,
    reset_by uuid references auth.users(id),
    updated_at timestamptz not null default now()
);

alter table public.pharmflow_workspace_generation_v1 enable row level security;
revoke all on public.pharmflow_workspace_generation_v1 from public,anon,authenticated;


create or replace function public.get_pharmflow_workspace_generation(
    p_pharmacy_id uuid
)
returns bigint
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
    v_generation bigint;
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation)
    values(p_pharmacy_id,0)
    on conflict(pharmacy_id) do nothing;

    select generation
      into v_generation
      from public.pharmflow_workspace_generation_v1
     where pharmacy_id=p_pharmacy_id;

    return coalesce(v_generation,0);
end;
$$;


create or replace function public.save_pharmflow_cloud_workspace_guarded(
    p_pharmacy_id uuid,
    p_workspace jsonb,
    p_device_id text,
    p_expected_generation bigint
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
    v_generation bigint;
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation)
    values(p_pharmacy_id,0)
    on conflict(pharmacy_id) do nothing;

    select generation
      into v_generation
      from public.pharmflow_workspace_generation_v1
     where pharmacy_id=p_pharmacy_id
     for update;

    if coalesce(p_expected_generation,-1) <> coalesce(v_generation,0) then
        raise exception 'WORKSPACE_RESET_CONFLICT';
    end if;

    perform public.save_pharmflow_cloud_workspace(
        p_pharmacy_id,
        p_workspace,
        p_device_id
    );

    return true;
end;
$$;


create or replace function public.atomic_reset_pharmflow_current_workspace(
    p_pharmacy_id uuid,
    p_confirmation text
)
returns bigint
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
    v_generation bigint;
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if upper(trim(coalesce(p_confirmation,''))) <> 'RESET CURRENT WORKSPACE' then
        raise exception 'Invalid reset confirmation';
    end if;

    insert into public.pharmflow_workspace_generation_v1(
        pharmacy_id,generation,reset_at,reset_by,updated_at
    )
    values(
        p_pharmacy_id,1,now(),auth.uid(),now()
    )
    on conflict(pharmacy_id)
    do update set
        generation=public.pharmflow_workspace_generation_v1.generation+1,
        reset_at=now(),
        reset_by=auth.uid(),
        updated_at=now()
    returning generation into v_generation;

    -- Discard ONLY unfinished order source + registry rows.
    delete from public.pharmflow_order_source_items s
    using public.pharmflow_orders o
    where s.pharmacy_id=p_pharmacy_id
      and o.pharmacy_id=p_pharmacy_id
      and upper(trim(s.order_number))=upper(trim(o.order_number))
      and lower(trim(coalesce(o.status,'uploaded'))) not in
          ('received','finalized','closed');

    delete from public.pharmflow_orders o
    where o.pharmacy_id=p_pharmacy_id
      and lower(trim(coalesce(o.status,'uploaded'))) not in
          ('received','finalized','closed');

    -- Clear the shared current workspace in the SAME server transaction.
    perform public.clear_pharmflow_cloud_workspace(p_pharmacy_id);

    return v_generation;
end;
$$;


revoke all on function public.get_pharmflow_workspace_generation(uuid)
from public,anon;
revoke all on function public.save_pharmflow_cloud_workspace_guarded(uuid,jsonb,text,bigint)
from public,anon;
revoke all on function public.atomic_reset_pharmflow_current_workspace(uuid,text)
from public,anon;

grant execute on function public.get_pharmflow_workspace_generation(uuid)
to authenticated;
grant execute on function public.save_pharmflow_cloud_workspace_guarded(uuid,jsonb,text,bigint)
to authenticated;
grant execute on function public.atomic_reset_pharmflow_current_workspace(uuid,text)
to authenticated;

select pg_notify('pgrst','reload schema');
