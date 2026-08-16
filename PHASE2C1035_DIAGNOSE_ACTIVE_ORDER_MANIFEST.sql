-- PharmFlow Phase 2C.10.3.5
-- READ-ONLY diagnostic. Does not delete or modify anything.

select
    pharmacy_id,
    revision,
    updated_at,
    jsonb_array_length(
        coalesce(manifest->'orderFiles','[]'::jsonb)
    ) as order_files,
    jsonb_array_length(
        coalesce(manifest->'orderData','[]'::jsonb)
    ) as order_items,
    manifest->>'selectedOrderNumber' as selected_order
from public.pharmflow_active_order_manifest_v1
order by updated_at desc;
