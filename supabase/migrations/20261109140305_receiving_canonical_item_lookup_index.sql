-- Supports canonical exact matches without rescanning Global Master for every workspace row.
-- Non-unique: existing canonical collisions remain visible and are rejected by mapping RPCs.
SET lock_timeout='3s';
CREATE INDEX pharmflow_global_items_receiving_code_idx ON public.pharmflow_global_items_v2(public.pharmflow_receiving_item_code_v1(item_code));
