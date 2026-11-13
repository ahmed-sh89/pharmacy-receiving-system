-- Account provisioning keeps the current journal and enables Duty in the same
-- transaction as the other initial permissions and pharmacy activation.
CREATE FUNCTION public.owner_provision_pharmacy_v3(p_operation_id uuid,p_name text,p_code text,p_admin_email text,
 p_receiving text,p_expiry text,p_data_access text,p_duty text,p_finish boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; j pharmflow_auth_private.account_provision_v1%rowtype;
 selected jsonb:=jsonb_build_object('receiving',p_receiving,'expiry',p_expiry,'data_access',p_data_access,'duty',p_duty);
 permission_revision bigint;
BEGIN
 IF NOT pharmflow_auth_private.password_change_complete() OR NOT public.is_system_owner() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='System Administrator required'; END IF;
 PERFORM pharmflow_auth_private.validate_initial_permissions(p_receiving,p_expiry,p_data_access);
 IF p_duty IS NULL OR p_duty NOT IN ('FULL','DISABLED') THEN RAISE EXCEPTION 'Select Duty Enabled or Disabled'; END IF;
 IF p_operation_id IS NULL THEN RAISE EXCEPTION 'Operation ID required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 result:=public.owner_provision_pharmacy_v1(p_operation_id,p_name,p_code,p_admin_email,false);
 SELECT * INTO j FROM pharmflow_auth_private.account_provision_v1 WHERE operation_id=p_operation_id FOR UPDATE;
 IF j.initial_permissions IS NULL THEN
  IF j.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Completed legacy operation cannot be reused'; END IF;
  UPDATE pharmflow_auth_private.account_provision_v1 SET initial_permissions=selected WHERE operation_id=p_operation_id;
 ELSIF j.initial_permissions<>selected THEN
  -- Drafts created by the previous client can finish with the historical Duty default.
  IF p_duty<>'DISABLED' OR j.initial_permissions<>(selected - 'duty') THEN
   RAISE EXCEPTION 'Operation ID already used with different permissions';
  END IF;
  IF j.completed_at IS NULL THEN
   UPDATE pharmflow_auth_private.account_provision_v1 SET initial_permissions=selected WHERE operation_id=p_operation_id;
  END IF;
 END IF;
 IF j.completed_at IS NOT NULL THEN RETURN result; END IF;
 -- Auth creation spans requests. Keep ALL pharmacy access inactive between phases,
 -- even if an invitation is redeemed or the supplied email already has an account.
 UPDATE public.pharmacies SET active=false,status='suspended' WHERE id=j.pharmacy_id;
 IF p_finish THEN
  result:=public.owner_provision_pharmacy_v1(p_operation_id,p_name,p_code,p_admin_email,true);
  SELECT revision INTO permission_revision FROM public.pharmflow_pharmacy_permissions_v1
    WHERE pharmacy_id=j.pharmacy_id FOR UPDATE;
  PERFORM public.owner_set_pharmflow_permissions_v2(j.pharmacy_id,p_receiving,p_expiry,p_data_access,p_duty,permission_revision);
  UPDATE public.pharmacies SET active=true,status='active' WHERE id=j.pharmacy_id;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.owner_provision_pharmacy_v3(uuid,text,text,text,text,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_provision_pharmacy_v3(uuid,text,text,text,text,text,text,text,boolean) TO authenticated;

-- The browser receives an Auth session, never an unauthenticated code-to-email lookup.
CREATE FUNCTION public.pharmflow_admin_email_for_code_v1(p_code text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN count(*)=1 THEN min(candidate.email) END
 FROM (
  SELECT u.email
  FROM public.pharmacies p
  JOIN public.pharmacy_members m ON m.pharmacy_id=p.id AND m.active AND m.role='admin'
  JOIN auth.users u ON u.id=m.user_id
  WHERE p.code=upper(trim(p_code)) AND p.active AND p.status='active'
    AND NOT EXISTS (SELECT FROM public.system_owners so WHERE so.user_id=m.user_id)
  -- Match the current ADMIN shown by owner_list_pharmacies and used for Reset.
  ORDER BY m.created_at DESC NULLS FIRST
  FETCH FIRST 1 ROW WITH TIES
 ) candidate;
$$;
REVOKE ALL ON FUNCTION public.pharmflow_admin_email_for_code_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pharmflow_admin_email_for_code_v1(text) TO service_role;
