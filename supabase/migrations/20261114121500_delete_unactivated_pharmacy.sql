-- Only these provisioning records can be removed together with an empty pharmacy.
CREATE FUNCTION pharmflow_auth_private.pharmacy_delete_metadata_v1()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT ARRAY['public.pharmacy_members','public.pharmacy_admin_assignments',
  'public.pharmacy_invitations','public.pharmflow_pharmacy_permissions_v1',
  'public.pharmflow_permission_audit_v1','pharmflow_auth_private.account_provision_v1'];
$$;

-- Cover FK dependencies (including cascade) and operational tables with
-- pharmacy identifiers but no FK, including private Receiving and Expiry tables.
CREATE FUNCTION pharmflow_auth_private.pharmacy_delete_dependencies_v1()
RETURNS TABLE(schema_name text, table_name text, column_name text)
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT DISTINCT n.nspname::text,c.relname::text,a.attname::text
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 WHERE c.relkind IN ('r','p') AND NOT c.relispartition
 AND ((
   n.nspname IN ('public','pharmflow_auth_private','pharmflow_duty_private',
     'pharmflow_expiry_private','pharmflow_receiving_private','pharmflow_receiving_admin_private')
   AND a.attname IN ('pharmacy_id','pharmacy_code','source_pharmacy_id','target_pharmacy_id','requested_pharmacy_code')
 ) OR EXISTS (
   SELECT FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=c.oid
    AND f.confrelid='public.pharmacies'::regclass AND a.attnum=ANY(f.conkey)
 ))
 AND NOT (n.nspname||'.'||c.relname=ANY(pharmflow_auth_private.pharmacy_delete_metadata_v1()));
$$;

CREATE FUNCTION pharmflow_auth_private.assert_pharmacy_deletable_v1(p_id uuid,p_code text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE edge record; account_id uuid; blocked boolean; pharmacy public.pharmacies%ROWTYPE;
BEGIN
 SELECT * INTO pharmacy FROM public.pharmacies WHERE id=p_id AND code=p_code;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pharmacy changed or no longer exists. Refresh the list.'; END IF;
 IF upper(pharmacy.code)='HHP084' THEN RAISE EXCEPTION 'The reference pharmacy is protected.'; END IF;
 IF EXISTS(SELECT FROM pharmflow_auth_private.account_provision_v1
    WHERE pharmacy_id=p_id AND completed_at IS NULL) THEN
  RAISE EXCEPTION 'Account creation is incomplete. Finish creating it before deleting the pharmacy.';
 END IF;

 IF EXISTS(SELECT FROM public.pharmacy_members WHERE pharmacy_id=p_id) THEN
  SELECT u.id INTO account_id
  FROM public.pharmacy_members m
  JOIN auth.users u ON u.id=m.user_id
  JOIN pharmflow_auth_private.account_provision_v1 j ON j.pharmacy_id=m.pharmacy_id
    AND j.operation_id::text=u.raw_app_meta_data->>'pharmflow_provision_operation'
  WHERE m.pharmacy_id=p_id AND m.role='admin' AND m.active
    AND (u.raw_app_meta_data->'pharmflow_initial_activation_pending'='true'::jsonb
      OR (NOT (coalesce(u.raw_app_meta_data,'{}'::jsonb) ? 'pharmflow_initial_activation_pending')
          AND u.last_sign_in_at IS NULL AND u.raw_app_meta_data->'pharmflow_must_change_password'='true'::jsonb))
    AND NOT EXISTS(SELECT FROM public.system_owners WHERE user_id=u.id)
    AND NOT EXISTS(SELECT FROM public.pharmacy_members other
                    WHERE other.user_id=u.id AND other.pharmacy_id<>p_id);
  IF account_id IS NULL
     OR EXISTS(SELECT FROM public.pharmacy_members WHERE pharmacy_id=p_id AND user_id<>account_id)
     OR EXISTS(SELECT FROM public.pharmacy_registration_requests WHERE applicant_user_id=account_id)
     OR EXISTS(SELECT FROM storage.objects WHERE owner_id=account_id::text) THEN
   RAISE EXCEPTION 'Only an unactivated pharmacy with a dedicated admin can be deleted.';
  END IF;
 ELSE
  IF pharmacy.approved_at IS NOT NULL
     OR EXISTS(SELECT FROM public.pharmacy_admin_assignments WHERE pharmacy_id=p_id AND claimed_by IS NOT NULL)
     OR EXISTS(SELECT FROM public.pharmacy_invitations WHERE pharmacy_id=p_id AND used_by IS NOT NULL)
     OR EXISTS(SELECT FROM pharmflow_auth_private.account_provision_v1 WHERE pharmacy_id=p_id) THEN
   RAISE EXCEPTION 'Only an unactivated pharmacy can be deleted.';
  END IF;
 END IF;

 FOR edge IN SELECT * FROM pharmflow_auth_private.pharmacy_delete_dependencies_v1() LOOP
  EXECUTE format('SELECT EXISTS(SELECT FROM %I.%I WHERE upper(%I::text)=$1 OR %I::text=$2)',
      edge.schema_name,edge.table_name,edge.column_name,edge.column_name)
  INTO blocked USING upper(p_code),p_id::text;
  IF blocked THEN RAISE EXCEPTION 'This pharmacy has operational data and cannot be deleted.'; END IF;
 END LOOP;
 IF EXISTS(SELECT FROM storage.objects WHERE split_part(name,'/',1) IN (p_id::text,p_code)) THEN
  RAISE EXCEPTION 'This pharmacy has stored files and cannot be deleted.';
 END IF;
 RETURN account_id;
END;
$$;
REVOKE ALL ON FUNCTION pharmflow_auth_private.pharmacy_delete_metadata_v1(),
 pharmflow_auth_private.pharmacy_delete_dependencies_v1(),
 pharmflow_auth_private.assert_pharmacy_deletable_v1(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.owner_delete_unactivated_pharmacy_v1(p_pharmacy_id uuid,p_pharmacy_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account_id uuid; edge record; stored_code text;
BEGIN
 IF NOT public.is_system_owner() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='System Administrator required';
 END IF;

 -- A destructive action is infrequent. Do not wait behind active writers,
 -- or proceed while a non-FK operational row can be inserted.
 PERFORM set_config('lock_timeout','2s',true);
 LOCK TABLE public.pharmacy_members,public.pharmacy_admin_assignments,
  public.pharmacy_invitations,public.pharmflow_pharmacy_permissions_v1,
  public.pharmflow_permission_audit_v1,pharmflow_auth_private.account_provision_v1,storage.objects IN SHARE ROW EXCLUSIVE MODE;
 FOR edge IN SELECT DISTINCT schema_name,table_name FROM pharmflow_auth_private.pharmacy_delete_dependencies_v1()
             ORDER BY 1,2 LOOP
  EXECUTE format('LOCK TABLE %I.%I IN SHARE MODE',edge.schema_name,edge.table_name);
 END LOOP;
 SELECT code INTO stored_code FROM public.pharmacies WHERE id=p_pharmacy_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF p_pharmacy_code IS DISTINCT FROM stored_code THEN
  RAISE EXCEPTION 'The pharmacy code changed. Refresh and confirm the correct pharmacy.';
 END IF;
 PERFORM u.id FROM auth.users u JOIN public.pharmacy_members m ON m.user_id=u.id
  WHERE m.pharmacy_id=p_pharmacy_id FOR UPDATE OF u;
 account_id:=pharmflow_auth_private.assert_pharmacy_deletable_v1(p_pharmacy_id,stored_code);

 DELETE FROM pharmflow_auth_private.account_provision_v1 WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM public.pharmflow_permission_audit_v1 WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM public.pharmflow_pharmacy_permissions_v1 WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM public.pharmacy_members WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM public.pharmacies WHERE id=p_pharmacy_id;
 IF account_id IS NOT NULL THEN
  DELETE FROM public.profiles WHERE user_id=account_id;
  DELETE FROM auth.users WHERE id=account_id;
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.owner_delete_unactivated_pharmacy_v1(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_delete_unactivated_pharmacy_v1(uuid,text) TO authenticated;

CREATE FUNCTION public.owner_check_pharmacy_deletable_v1(p_pharmacy_id uuid,p_pharmacy_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.is_system_owner() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='System Administrator required';
 END IF;
 PERFORM pharmflow_auth_private.assert_pharmacy_deletable_v1(p_pharmacy_id,p_pharmacy_code);
END;
$$;
REVOKE ALL ON FUNCTION public.owner_check_pharmacy_deletable_v1(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_check_pharmacy_deletable_v1(uuid,text) TO authenticated;
