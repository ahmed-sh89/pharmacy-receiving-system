-- ============================================================
-- PharmFlow Phase 2C.10.4.6
-- TENANT-SCOPED HISTORICAL DELETE ROOT FIX
--
-- Goal
--   Delete ALL Historical Data for ONE pharmacy only, atomically, while
--   preserving current/active uploaded orders, Returns Archive and the
--   Global GTIN Master.
--
-- Root cause addressed
--   Historical deletion previously depended on separate RPCs and an older
--   received-history RPC whose deployed behavior was not guaranteed to match
--   the current schema. This allowed a received order row to survive while
--   the UI appeared cleared.
--
-- Production safety
--   * Requires pharmacy-admin permission.
--   * Requires exact destructive confirmation phrase.
--   * Every DELETE is scoped by p_pharmacy_id.
--   * Active order rows (uploaded / non-historical states) are preserved.
--   * Active Order Manifest is NOT touched.
--   * Current Workspace generation is NOT touched.
--   * Returns Archive is NOT touched.
--   * Global GTIN Master is NOT touched.
--   * All statements execute in ONE PostgreSQL transaction.
-- ============================================================

create or replace function public.delete_all_pharmflow_historical_data_v2(
    p_pharmacy_id uuid,
    p_confirmation text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $$
declare
    v_historical_order_numbers text[] := '{}'::text[];
    v_orders_deleted bigint := 0;
    v_archives_deleted bigint := 0;
    v_source_rows_deleted bigint := 0;
    v_receiving_transactions_deleted bigint := 0;
    v_remaining_historical_orders bigint := 0;
    v_remaining_archives bigint := 0;
    v_active_orders_preserved bigint := 0;
begin
    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if upper(trim(coalesce(p_confirmation,''))) <> 'DELETE ALL HISTORICAL DATA' then
        raise exception 'Invalid confirmation';
    end if;

    -- Build the complete known Historical Order set BEFORE deleting anything.
    -- Include registry historical states plus Order Numbers carried only by a
    -- finalized archive (legacy/finalized-before-registry cases).
    select coalesce(array_agg(distinct x.order_number), '{}'::text[])
      into v_historical_order_numbers
      from (
          select upper(trim(o.order_number)) as order_number
            from public.pharmflow_orders o
           where o.pharmacy_id=p_pharmacy_id
             and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed')
             and nullif(trim(coalesce(o.order_number,'')),'') is not null

          union

          select upper(trim(n)) as order_number
            from public.pharmflow_finalized_archives_v1 a
            cross join lateral unnest(coalesce(a.order_numbers,'{}'::text[])) n
           where a.pharmacy_id=p_pharmacy_id
             and nullif(trim(coalesce(n,'')),'') is not null
      ) x;

    -- Immutable original-source snapshots belong to the historical order and
    -- must not survive Delete All Historical Data / Item Transfer cleanup.
    if coalesce(array_length(v_historical_order_numbers,1),0) > 0 then
        delete from public.pharmflow_order_source_items s
         where s.pharmacy_id=p_pharmacy_id
           and upper(trim(s.order_number))=any(v_historical_order_numbers);
        get diagnostics v_source_rows_deleted=row_count;

        -- Remove only receiving ledger rows for historical orders. Transactions
        -- for current active orders remain available and synchronized.
        delete from public.pharmflow_receiving_transactions_v1 t
         where t.pharmacy_id=p_pharmacy_id
           and upper(trim(coalesce(t.order_number,'')))=any(v_historical_order_numbers);
        get diagnostics v_receiving_transactions_deleted=row_count;
    end if;

    -- Finalized Archive is historical by definition and tenant-scoped.
    delete from public.pharmflow_finalized_archives_v1 a
     where a.pharmacy_id=p_pharmacy_id;
    get diagnostics v_archives_deleted=row_count;

    -- Delete ONLY received/finalized/closed lifecycle rows.
    delete from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed');
    get diagnostics v_orders_deleted=row_count;

    -- Server-side fail-fast verification. If either count is non-zero, raise;
    -- PostgreSQL rolls the entire transaction back rather than reporting a
    -- false success.
    select count(*)
      into v_remaining_historical_orders
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed');

    select count(*)
      into v_remaining_archives
      from public.pharmflow_finalized_archives_v1 a
     where a.pharmacy_id=p_pharmacy_id;

    if v_remaining_historical_orders<>0 or v_remaining_archives<>0 then
        raise exception
            'Historical deletion verification failed: orders %, archives %',
            v_remaining_historical_orders,
            v_remaining_archives;
    end if;

    select count(*)
      into v_active_orders_preserved
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    return jsonb_build_object(
        'success',true,
        'pharmacy_id',p_pharmacy_id,
        'historical_orders_deleted',v_orders_deleted,
        'finalized_archives_deleted',v_archives_deleted,
        'historical_source_rows_deleted',v_source_rows_deleted,
        'historical_receiving_transactions_deleted',v_receiving_transactions_deleted,
        'remaining_historical_orders',v_remaining_historical_orders,
        'remaining_finalized_archives',v_remaining_archives,
        'active_orders_preserved',v_active_orders_preserved,
        'verified_at',now()
    );
end;
$$;

revoke all on function public.delete_all_pharmflow_historical_data_v2(uuid,text)
from public,anon;

grant execute on function public.delete_all_pharmflow_historical_data_v2(uuid,text)
to authenticated;

-- Read-only verification RPC for operational QA. This never deletes data.
create or replace function public.verify_pharmflow_historical_state_v2(
    p_pharmacy_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
    v_historical_orders bigint;
    v_archives bigint;
    v_active_orders bigint;
begin
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    select count(*) into v_historical_orders
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed');

    select count(*) into v_archives
      from public.pharmflow_finalized_archives_v1 a
     where a.pharmacy_id=p_pharmacy_id;

    select count(*) into v_active_orders
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    return jsonb_build_object(
        'pharmacy_id',p_pharmacy_id,
        'historical_orders_remaining',v_historical_orders,
        'finalized_archives_remaining',v_archives,
        'active_orders_present',v_active_orders,
        'historical_data_empty',(v_historical_orders=0 and v_archives=0)
    );
end;
$$;

revoke all on function public.verify_pharmflow_historical_state_v2(uuid)
from public,anon;

grant execute on function public.verify_pharmflow_historical_state_v2(uuid)
to authenticated;

select pg_notify('pgrst','reload schema');

-- Expected SQL Editor result: Success. No rows returned.
