-- PREPARED ONLY; no Production query was executed. No HHP084 account/transaction access.
BEGIN READ ONLY;
SELECT count(*) AS total_global_v2_items FROM public.pharmflow_global_items_v2;
SELECT count(*) AS identifier_mappings FROM public.pharmflow_global_item_identifiers_v2;
SELECT * FROM public.pharmflow_global_gtin_meta_v1;
SELECT item_code,group_name FROM public.pharmflow_global_items_v2 WHERE item_code='1056889';
-- Uploaded Group evidence must be restricted to a separately approved exact Order ID.
-- Inspect that Order's source/manifest classification only; do not scan HHP084 operational records.
ROLLBACK;
