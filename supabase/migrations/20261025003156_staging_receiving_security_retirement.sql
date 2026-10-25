DO $policy$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.pharmflow_cloud_transactions'::regclass AND polname='receiving_compat_read') THEN
  CREATE POLICY receiving_compat_read ON public.pharmflow_cloud_transactions FOR SELECT TO authenticated
  USING (pharmflow_auth_private.module_allowed(pharmacy_id,'RECEIVING',false));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.pharmflow_cloud_transactions'::regclass AND tgname='receiving_compat_write') THEN
  CREATE TRIGGER receiving_compat_write BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_cloud_transactions FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('RECEIVING');
 END IF;
END $policy$;
REVOKE ALL ON public.pharmflow_cloud_transactions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pharmflow_cloud_transactions TO authenticated;
DO $policy$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.pharmflow_receiving_workspace_history_v1'::regclass AND polname='receiving_compat_read') THEN
  CREATE POLICY receiving_compat_read ON public.pharmflow_receiving_workspace_history_v1 FOR SELECT TO authenticated
  USING (pharmflow_auth_private.module_allowed(pharmacy_id,'RECEIVING',false));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.pharmflow_receiving_workspace_history_v1'::regclass AND tgname='receiving_compat_write') THEN
  CREATE TRIGGER receiving_compat_write BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_receiving_workspace_history_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('RECEIVING');
 END IF;
END $policy$;
REVOKE ALL ON public.pharmflow_receiving_workspace_history_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pharmflow_receiving_workspace_history_v1 TO authenticated;
DO $policy$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.pharmflow_receiving_history_items_v1'::regclass AND polname='receiving_compat_read') THEN
  CREATE POLICY receiving_compat_read ON public.pharmflow_receiving_history_items_v1 FOR SELECT TO authenticated
  USING (pharmflow_auth_private.module_allowed(pharmacy_id,'RECEIVING',false));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.pharmflow_receiving_history_items_v1'::regclass AND tgname='receiving_compat_write') THEN
  CREATE TRIGGER receiving_compat_write BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_receiving_history_items_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('RECEIVING');
 END IF;
END $policy$;
REVOKE ALL ON public.pharmflow_receiving_history_items_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pharmflow_receiving_history_items_v1 TO authenticated;
DO $restrict$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.pharmflow_receiving_workspace_history_v1'::regclass AND polname='receiving_compat_restrict') THEN
 CREATE POLICY receiving_compat_restrict ON public.pharmflow_receiving_workspace_history_v1 AS RESTRICTIVE FOR SELECT TO authenticated USING(pharmflow_auth_private.module_allowed(pharmacy_id,'RECEIVING',false));
 END IF;END $restrict$;
DO $restrict$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.pharmflow_receiving_history_items_v1'::regclass AND polname='receiving_compat_restrict') THEN
 CREATE POLICY receiving_compat_restrict ON public.pharmflow_receiving_history_items_v1 AS RESTRICTIVE FOR SELECT TO authenticated USING(pharmflow_auth_private.module_allowed(pharmacy_id,'RECEIVING',false));
 END IF;END $restrict$;

-- Legacy session retirement. No session tables or records are changed.
CREATE OR REPLACE FUNCTION public.bulk_upsert_session_items(p_session_id uuid, p_session_secret uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.bulk_upsert_session_items(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.create_receiving_session(p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text)
 RETURNS TABLE(session_id uuid, session_code text, session_secret uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.create_receiving_session(text,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_received_qty(p_session_id uuid, p_session_secret uuid, p_item_code text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.get_received_qty(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_session_items(p_session_id uuid, p_session_secret uuid)
 RETURNS TABLE(item_code text, item_name text, gtin text, category text, ordered_qty numeric, received_qty numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.get_session_items(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_session_snapshot(p_session_id uuid, p_session_secret uuid)
 RETURNS TABLE(item_code text, item_name text, gtin text, gtins jsonb, category text, ordered_qty numeric, received_qty numeric, transaction_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.get_session_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.join_receiving_session(p_session_code text, p_session_secret uuid)
 RETURNS TABLE(session_id uuid, session_code text, order_number text, order_name text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.join_receiving_session(text,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.join_receiving_session_by_code(p_session_code text)
 RETURNS TABLE(session_id uuid, session_code text, session_secret uuid, order_number text, order_name text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.join_receiving_session_by_code(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.pharmflow_end_session(p_session_id text, p_session_secret text, p_ended_by_device text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.pharmflow_end_session(text,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.pharmflow_is_session_ended(p_session_id text, p_session_secret text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.pharmflow_is_session_ended(text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.record_receiving_transaction(p_session_id uuid, p_session_secret uuid, p_item_code text, p_qty_change numeric DEFAULT 1, p_action_type text DEFAULT 'scan'::text, p_device_id text DEFAULT NULL::text, p_device_type text DEFAULT NULL::text, p_transaction_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.record_receiving_transaction(uuid,uuid,text,numeric,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.upsert_session_item(p_session_id uuid, p_session_secret uuid, p_item_code text, p_item_name text, p_gtin text, p_category text, p_ordered_qty numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.upsert_session_item(uuid,uuid,text,text,text,text,numeric) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
;

