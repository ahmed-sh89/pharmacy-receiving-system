-- ============================================================
-- PharmFlow Phase 2C.10.4.2
-- RPC VOLATILITY HOTFIX
-- Fixes PostgreSQL: "INSERT is not allowed in a non-volatile function"
--
-- Root cause:
-- public.get_pharmflow_workspace_generation(uuid) was declared STABLE while
-- it performs INSERT ... ON CONFLICT DO NOTHING to lazily create the
-- generation row. PostgreSQL correctly rejects writes from a STABLE function.
--
-- Production safety:
-- * No tables are dropped.
-- * No application/business data is deleted or modified.
-- * Global GTIN Master is untouched.
-- * Historical Data and Returns Archive are untouched.
-- * Tenant/pharmacy membership check is preserved.
-- * Existing function signature and client API remain unchanged.
-- ============================================================

create or replace function public.get_pharmflow_workspace_generation(
    p_pharmacy_id uuid
)
returns bigint
language plpgsql
volatile
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

revoke all on function public.get_pharmflow_workspace_generation(uuid)
from public,anon;

grant execute on function public.get_pharmflow_workspace_generation(uuid)
to authenticated;

-- Fail-fast verification: the migration must not silently leave this RPC
-- classified as STABLE/IMMUTABLE.
do $$
declare
    v_volatility "char";
begin
    select p.provolatile
      into v_volatility
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and p.proname='get_pharmflow_workspace_generation'
       and pg_get_function_identity_arguments(p.oid)='p_pharmacy_id uuid';

    if v_volatility is distinct from 'v' then
        raise exception 'PHASE2C1042 verification failed: get_pharmflow_workspace_generation is not VOLATILE';
    end if;
end;
$$;

select pg_notify('pgrst','reload schema');

-- Expected SQL Editor result: Success. No rows returned.
