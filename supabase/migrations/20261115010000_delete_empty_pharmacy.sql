-- Keep account identities intact. Delete the pharmacy and its setup records
-- only once all operational dependencies and evidence storage are clear.
CREATE FUNCTION public.owner_delete_empty_pharmacy_v1(p_pharmacy_id uuid,p_pharmacy_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE edge record; stored_code text; blocked boolean;
BEGIN
 IF NOT public.is_system_owner() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='System Administrator required.';
 END IF;

 PERFORM set_config('lock_timeout','2s',true);
 LOCK TABLE public.pharmacy_members,public.pharmacy_admin_assignments,
  public.pharmacy_invitations,public.pharmflow_pharmacy_permissions_v1,
  public.pharmflow_permission_audit_v1,pharmflow_auth_private.account_provision_v1,storage.objects
  IN SHARE ROW EXCLUSIVE MODE;
 -- Some historical tables have no foreign key to protect against a concurrent insert.
 FOR edge IN SELECT DISTINCT schema_name,table_name
             FROM pharmflow_auth_private.pharmacy_delete_dependencies_v1() ORDER BY 1,2 LOOP
  EXECUTE format('LOCK TABLE %I.%I IN SHARE MODE',edge.schema_name,edge.table_name);
 END LOOP;

 SELECT code INTO stored_code FROM public.pharmacies WHERE id=p_pharmacy_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF p_pharmacy_code IS DISTINCT FROM stored_code THEN
  RAISE EXCEPTION 'The pharmacy code changed. Refresh the list and try again.';
 END IF;
 IF upper(stored_code)='HHP084' THEN RAISE EXCEPTION 'The reference pharmacy is protected.'; END IF;
 IF EXISTS(SELECT FROM pharmflow_auth_private.account_provision_v1
           WHERE pharmacy_id=p_pharmacy_id AND completed_at IS NULL) THEN
  RAISE EXCEPTION 'Account creation is incomplete. Finish creating it before deleting the pharmacy.';
 END IF;

 FOR edge IN SELECT * FROM pharmflow_auth_private.pharmacy_delete_dependencies_v1() LOOP
  -- First sign-in can seed generation 0. A reset or a later generation is history.
  IF edge.schema_name='public' AND edge.table_name='pharmflow_workspace_generation_v1' THEN
   SELECT EXISTS(SELECT FROM public.pharmflow_workspace_generation_v1
     WHERE pharmacy_id=p_pharmacy_id AND (generation<>0 OR reset_at IS NOT NULL OR reset_by IS NOT NULL))
   INTO blocked;
  ELSE
   EXECUTE format('SELECT EXISTS(SELECT FROM %I.%I WHERE upper(%I::text)=$1 OR %I::text=$2)',
      edge.schema_name,edge.table_name,edge.column_name,edge.column_name)
   INTO blocked USING upper(stored_code),p_pharmacy_id::text;
  END IF;
  IF blocked THEN
   IF edge.schema_name='public' AND edge.table_name='pharmacy_registration_requests' THEN
    RAISE EXCEPTION 'This pharmacy has a registration record. Use Deactivate to preserve it.';
   END IF;
   RAISE EXCEPTION 'This pharmacy has operational data or history. Use Deactivate to preserve it.';
  END IF;
 END LOOP;
 IF EXISTS(SELECT FROM storage.objects WHERE upper(split_part(name,'/',1)) IN
           (upper(p_pharmacy_id::text),upper(stored_code))) THEN
  RAISE EXCEPTION 'This pharmacy has stored files. Use Deactivate to preserve them.';
 END IF;

 DELETE FROM pharmflow_auth_private.account_provision_v1 WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM public.pharmflow_permission_audit_v1 WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM public.pharmflow_pharmacy_permissions_v1 WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM public.pharmacy_members WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM public.pharmacies WHERE id=p_pharmacy_id;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'PharmFlow is busy. Try deleting this pharmacy again in a moment.';
END;
$$;
REVOKE ALL ON FUNCTION public.owner_delete_empty_pharmacy_v1(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_delete_empty_pharmacy_v1(uuid,text) TO authenticated;
-- Retire the previous endpoint that could remove an Auth identity.
REVOKE EXECUTE ON FUNCTION public.owner_delete_unactivated_pharmacy_v1(uuid,text) FROM authenticated;
