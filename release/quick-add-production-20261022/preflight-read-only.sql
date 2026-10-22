-- PREPARED ONLY. Never executed in this session. Run on verified Production only after separate approval.
BEGIN READ ONLY;
-- Catalog evidence cannot prove project identity: verify dashboard/API project ref zznoshzcyxmtwfbznjyr first.
WITH expected(name,args,expected_md5) AS (VALUES
('add_pharmflow_global_identifier_v2','p_operation_id uuid, p_identifier_display text, p_item_code text, p_reason text','968eb754dbee1b218b5752b4201370fd'),
('add_pharmflow_pharmacy_identifier_v2','p_operation_id uuid, p_pharmacy_id uuid, p_identifier_display text, p_item_code text, p_item_name text, p_reason text','606f0845f221545c974354f1b50ca951'),
('append_pharmflow_receiving_action_v4','p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb','0e987e635192c4838e3151541b1d1c24'),
('create_pharmflow_global_item_v2','p_operation_id uuid, p_item_code text, p_item_name text, p_group_name text, p_category text, p_sub_category text, p_identifier_display text, p_reason text','3042a4d5d45120add3f62819ed62bff5'),
('get_pharmflow_order','p_pharmacy_id uuid, p_order_number text','0e4427460fbd825eed0596631777695d'),
('get_pharmflow_order_source_items_v2','p_pharmacy_id uuid, p_order_number text','384a77d844249be3553b014e5b9e3abc'),
('is_pharmacy_admin','p_pharmacy_id uuid','c1c335586703076ee2f8bd56ca1378a8'),
('is_pharmacy_member','p_pharmacy_id uuid','55fa22bf6f99fb2f3c30a138d7d04047'),
('pharmflow_identifier_key_v2','p_identifier_display text','11f6301337c03c9bb5ca71af9ed725eb'),
('pharmflow_is_pharmacy_identifier_admin_v2','p_pharmacy_id uuid','fe447a42acf271b8f1d855b66227867d'),
('pharmflow_is_reference_master_admin_v1','','867df474a484fccef661c74e7dc25f66'),
('pharmflow_normalize_main_group_v1','p_group_name text','30682c66e7a307016f48e9995179ffa0'),
('register_pharmflow_order_upload','p_pharmacy_id uuid, p_order_number text, p_order_date date, p_from_warehouse text, p_to_warehouse text, p_source_file text, p_item_count integer','c629de8204d6b5158a8ecb7e540d5b1c'),
('save_pharmflow_active_order_manifest_v4','p_pharmacy_id uuid, p_manifest jsonb, p_expected_generation bigint, p_expected_revision bigint','6ceeed43aef7023a4854d293320e5138'),
('save_pharmflow_order_source_items_v2','p_pharmacy_id uuid, p_order_number text, p_items jsonb, p_replace boolean','b7e2f57db774117990e64c97d404e609'))
SELECT e.*,p.oid IS NOT NULL AS present,md5(pg_get_functiondef(p.oid)) AS actual_md5,
 md5(pg_get_functiondef(p.oid))=e.expected_md5 AS exact_match,p.prosecdef,p.proconfig,p.proacl
FROM expected e LEFT JOIN pg_namespace n ON n.nspname='public'
LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name AND pg_get_function_identity_arguments(p.oid)=e.args;
-- Any mismatch requires review, not CREATE OR REPLACE of a historical function.
SELECT proname,pg_get_function_identity_arguments(oid),pg_get_function_result(oid),proacl
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('append_pharmflow_learned_transaction_v4','create_pharmflow_needs_review_v6','get_pharmflow_master_cache_meta_v2','get_pharmflow_master_cache_page_v2','get_pharmflow_receiving_groups_v1','learn_pharmflow_existing_identifier_v3','pharmflow_receiving_item_code_v1','quick_add_pharmflow_order_item_v1','set_pharmflow_needs_review_qty_v3');
-- New names should be absent; an existing identical contract requires a revised skip-only candidate.
SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('pharmflow_orders','pharmflow_order_source_items','pharmflow_receiving_transactions_v1','pharmflow_needs_review_v2','pharmflow_needs_review_resolution_intents_v1','pharmflow_global_items_v2','pharmflow_global_item_identifiers_v2','pharmflow_pharmacy_gtin_v1','pharmflow_identifier_mapping_audit_v1','pharmflow_pharmacy_identifier_mapping_audit_v2') ORDER BY table_name,ordinal_position;
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('pharmflow_orders','pharmflow_order_source_items','pharmflow_receiving_transactions_v1','pharmflow_needs_review_v2','pharmflow_global_items_v2','pharmflow_global_item_identifiers_v2','pharmflow_pharmacy_gtin_v1');
SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'pharmflow_%';
SELECT conrelid::regclass AS relation,conname,contype,convalidated,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('public.pharmflow_orders'::regclass,'public.pharmflow_order_source_items'::regclass,'public.pharmflow_receiving_transactions_v1'::regclass,'public.pharmflow_needs_review_v2'::regclass);
SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;
ROLLBACK;
