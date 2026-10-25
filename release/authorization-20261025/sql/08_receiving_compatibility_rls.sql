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


DO $restrict$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.pharmflow_cloud_transactions'::regclass AND polname='receiving_compat_restrict') THEN CREATE POLICY receiving_compat_restrict ON public.pharmflow_cloud_transactions AS RESTRICTIVE FOR SELECT TO authenticated USING(pharmflow_auth_private.module_allowed(pharmacy_id,'RECEIVING',false)); END IF; END $restrict$;
