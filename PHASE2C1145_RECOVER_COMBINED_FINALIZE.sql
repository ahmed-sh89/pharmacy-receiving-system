-- PharmFlow Phase 2C.11.4.5
-- ONE-TIME recovery for the accidental combined finalize observed in production.
-- Orders involved:
--   TO-000455987 = was intentionally finalized
--   TO-000457715 = was accidentally finalized with it
--
-- IMPORTANT:
-- Run this only AFTER deploying the 2C.11.4.5 JS root fix.
-- The current workspace must still contain both orders, as observed during testing.
--
-- Recovery strategy:
-- 1) Find the single pharmacy archive row that contains BOTH order numbers.
-- 2) Delete that erroneous combined archive row.
-- 3) Restore BOTH lifecycle rows to Uploaded.
-- 4) Then, in PharmFlow, select TO-000455987 and Finalize it again.
--    The new code will archive ONLY TO-000455987 and leave TO-000457715 active.
--
-- This does NOT touch Global GTIN, Returns Archive, other pharmacies, or other orders.

begin;

do $$
declare
    v_pharmacy uuid;
    v_archive text;
    v_count integer;
begin
    select count(*), min(pharmacy_id), min(archive_id)
      into v_count, v_pharmacy, v_archive
      from public.pharmflow_finalized_archives_v1
     where order_numbers @> array['TO-000455987','TO-000457715']::text[];

    if v_count <> 1 then
        raise exception 'Recovery stopped: expected exactly 1 combined archive, found %', v_count;
    end if;

    delete from public.pharmflow_finalized_archives_v1
     where pharmacy_id=v_pharmacy
       and archive_id=v_archive
       and order_numbers @> array['TO-000455987','TO-000457715']::text[];

    update public.pharmflow_orders
       set status='uploaded',
           received_at=null
     where pharmacy_id=v_pharmacy
       and order_number in ('TO-000455987','TO-000457715');

    if (select count(*) from public.pharmflow_orders
         where pharmacy_id=v_pharmacy
           and order_number in ('TO-000455987','TO-000457715')
           and status='uploaded') <> 2 then
        raise exception 'Recovery stopped: both lifecycle rows were not restored to uploaded';
    end if;
end $$;

commit;
