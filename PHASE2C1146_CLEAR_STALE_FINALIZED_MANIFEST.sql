-- PharmFlow Phase 2C.11.4.6
-- ONE-TIME GUARDED cleanup of the stale Current Workspace manifest.
--
-- Current verified situation:
--   TO-000455987 = Received and archived independently
--   TO-000457715 = Received and archived independently
-- but both still appear in Receiving because the Supabase Active Order
-- Manifest was not cleared/updated by 2C.11.4.5.
--
-- This script DOES NOT delete either archive and DOES NOT change order status.
-- It only clears the Active Order Manifest after strict validation that:
--   1) both lifecycle rows are Received;
--   2) both have independent single-order archive records;
--   3) the active manifest contains exactly these two orders and no others.
--
-- Run once AFTER deploying js/session.js from 2C.11.4.6.

begin;

do $$
declare
    v_pharmacy uuid;
    v_manifest jsonb;
    v_manifest_count integer := 0;
    v_received_count integer := 0;
    v_archive_a integer := 0;
    v_archive_b integer := 0;
    v_has_a boolean := false;
    v_has_b boolean := false;
begin
    -- Resolve exactly one pharmacy where BOTH lifecycle records are Received.
    select o1.pharmacy_id
      into v_pharmacy
      from public.pharmflow_orders o1
      join public.pharmflow_orders o2
        on o2.pharmacy_id=o1.pharmacy_id
     where o1.order_number='TO-000455987'
       and o2.order_number='TO-000457715'
       and lower(trim(coalesce(o1.status,'')))='received'
       and lower(trim(coalesce(o2.status,'')))='received'
     limit 1;

    if v_pharmacy is null then
        raise exception
            'Cleanup stopped: both orders are not verified Received in one pharmacy';
    end if;

    select count(*)
      into v_received_count
      from public.pharmflow_orders
     where pharmacy_id=v_pharmacy
       and order_number in ('TO-000455987','TO-000457715')
       and lower(trim(coalesce(status,'')))='received';

    if v_received_count <> 2 then
        raise exception
            'Cleanup stopped: expected 2 Received lifecycle rows, found %',
            v_received_count;
    end if;

    -- Each order must already have its own independent archive row.
    select count(*)
      into v_archive_a
      from public.pharmflow_finalized_archives_v1
     where pharmacy_id=v_pharmacy
       and cardinality(order_numbers)=1
       and order_numbers @> array['TO-000455987']::text[];

    select count(*)
      into v_archive_b
      from public.pharmflow_finalized_archives_v1
     where pharmacy_id=v_pharmacy
       and cardinality(order_numbers)=1
       and order_numbers @> array['TO-000457715']::text[];

    if v_archive_a < 1 or v_archive_b < 1 then
        raise exception
            'Cleanup stopped: independent archives not verified (A %, B %)',
            v_archive_a, v_archive_b;
    end if;

    select manifest
      into v_manifest
      from public.pharmflow_active_order_manifest_v1
     where pharmacy_id=v_pharmacy
     limit 1;

    if v_manifest is null then
        raise notice 'Active manifest already absent. No cleanup required.';
        return;
    end if;

    v_manifest_count=
        coalesce(jsonb_array_length(v_manifest->'orderFiles'),0);

    if v_manifest_count <> 2 then
        raise exception
            'Cleanup stopped: active manifest contains % order file(s), expected exactly 2',
            v_manifest_count;
    end if;

    select exists(
        select 1
          from jsonb_array_elements(v_manifest->'orderFiles') f
         where upper(
             regexp_replace(
                 coalesce(f->>'documentId',f->>'orderNumber',''),
                 '\s','','g'
             )
         )='TO-000455987'
    ) into v_has_a;

    select exists(
        select 1
          from jsonb_array_elements(v_manifest->'orderFiles') f
         where upper(
             regexp_replace(
                 coalesce(f->>'documentId',f->>'orderNumber',''),
                 '\s','','g'
             )
         )='TO-000457715'
    ) into v_has_b;

    if not v_has_a or not v_has_b then
        raise exception
            'Cleanup stopped: active manifest is not exactly the two finalized orders';
    end if;

    delete from public.pharmflow_active_order_manifest_v1
     where pharmacy_id=v_pharmacy;

    if not found then
        raise exception 'Cleanup stopped: Active Order Manifest was not removed';
    end if;

    raise notice
        'Cleanup successful. Removed stale Active Order Manifest for pharmacy %. Archives and lifecycle records were preserved.',
        v_pharmacy;
end $$;

commit;
