-- Authorization release candidate. Existing policies, UUIDs and historical timestamps are retained.
ALTER TABLE pharmflow_auth_private.account_provision_v1 ADD COLUMN initial_permissions jsonb;
ALTER TABLE public.pharmacy_registration_requests ADD COLUMN initial_permissions jsonb;
ALTER TABLE public.pharmflow_pharmacy_permissions_v1 ALTER COLUMN receiving SET DEFAULT 'DISABLED', ALTER COLUMN expiry SET DEFAULT 'DISABLED', ALTER COLUMN data_access SET DEFAULT 'READ_ONLY';
-- The existing seed trigger now inherits deny defaults; existing rows are unchanged.
CREATE OR REPLACE FUNCTION pharmflow_auth_private.seed_permissions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ BEGIN
 INSERT INTO public.pharmflow_pharmacy_permissions_v1(pharmacy_id,receiving,expiry,data_access) VALUES(new.id,'DISABLED','DISABLED','READ_ONLY');
 RETURN new;
END $$;

CREATE FUNCTION pharmflow_auth_private.validate_initial_permissions(r text,e text,d text)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF r IS NULL OR e IS NULL OR d IS NULL OR r NOT IN ('FULL','DISABLED') OR e NOT IN ('FULL','DISABLED') OR d NOT IN ('READ_ONLY','PHARMACY_ONLY','PHARMACY_GLOBAL') THEN
  RAISE EXCEPTION 'Explicit initial permissions required';
 END IF;
END $$;
REVOKE ALL ON FUNCTION pharmflow_auth_private.validate_initial_permissions(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.owner_provision_pharmacy_v2(p_operation_id uuid,p_name text,p_code text,p_admin_email text,
 p_receiving text,p_expiry text,p_data_access text,p_finish boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; j pharmflow_auth_private.account_provision_v1%rowtype;
 selected jsonb:=jsonb_build_object('receiving',p_receiving,'expiry',p_expiry,'data_access',p_data_access);
BEGIN
 IF NOT pharmflow_auth_private.password_change_complete() OR NOT public.is_system_owner() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='System Administrator required'; END IF;
 PERFORM pharmflow_auth_private.validate_initial_permissions(p_receiving,p_expiry,p_data_access);
 IF p_operation_id IS NULL THEN RAISE EXCEPTION 'Operation ID required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 result:=public.owner_provision_pharmacy_v1(p_operation_id,p_name,p_code,p_admin_email,false);
 SELECT * INTO j FROM pharmflow_auth_private.account_provision_v1 WHERE operation_id=p_operation_id FOR UPDATE;
 IF j.initial_permissions IS NULL THEN
  IF j.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Completed legacy operation cannot be reused'; END IF;
  UPDATE pharmflow_auth_private.account_provision_v1 SET initial_permissions=selected WHERE operation_id=p_operation_id;
 ELSIF j.initial_permissions<>selected THEN RAISE EXCEPTION 'Operation ID already used with different permissions'; END IF;
 IF j.completed_at IS NOT NULL THEN RETURN result; END IF;
 -- Auth creation spans requests. Keep ALL pharmacy access inactive between phases,
 -- even if an invitation is redeemed or the supplied email already has an account.
 UPDATE public.pharmacies SET active=false,status='suspended' WHERE id=j.pharmacy_id;
 IF p_finish THEN
  result:=public.owner_provision_pharmacy_v1(p_operation_id,p_name,p_code,p_admin_email,true);
  PERFORM public.owner_set_pharmflow_permissions_v1(j.pharmacy_id,p_receiving,p_expiry,p_data_access);
  UPDATE public.pharmacies SET active=true,status='active' WHERE id=j.pharmacy_id;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.owner_provision_pharmacy_v2(uuid,text,text,text,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_provision_pharmacy_v2(uuid,text,text,text,text,text,text,boolean) TO authenticated;
-- Legacy prepare/finish is internal only; a direct call cannot skip the policy transaction.
REVOKE EXECUTE ON FUNCTION public.owner_provision_pharmacy_v1(uuid,text,text,text,boolean) FROM authenticated;

CREATE FUNCTION public.owner_review_pharmacy_registration_v3(p_request_id uuid,p_decision text,
 p_official_pharmacy_name text DEFAULT NULL,p_official_pharmacy_code text DEFAULT NULL,p_note text DEFAULT NULL,
 p_receiving text DEFAULT NULL,p_expiry text DEFAULT NULL,p_data_access text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.pharmacy_registration_requests%rowtype; result jsonb;
 selected jsonb:=jsonb_build_object('receiving',p_receiving,'expiry',p_expiry,'data_access',p_data_access);
BEGIN
 IF NOT pharmflow_auth_private.password_change_complete() OR NOT public.is_system_owner() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='System Administrator required'; END IF;
 SELECT * INTO r FROM public.pharmacy_registration_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registration request not found'; END IF;
 IF lower(trim(p_decision))='approve' THEN
  PERFORM pharmflow_auth_private.validate_initial_permissions(p_receiving,p_expiry,p_data_access);
  IF r.status='approved' AND r.initial_permissions=selected AND r.requested_pharmacy_name=trim(p_official_pharmacy_name)
   AND EXISTS(SELECT 1 FROM public.pharmacies WHERE id=r.pharmacy_id AND code=upper(trim(p_official_pharmacy_code))) THEN
   RETURN jsonb_build_object('pharmacy_id',r.pharmacy_id,'request_status','approved');
  END IF;
 END IF;
 SELECT to_jsonb(x) INTO result FROM public.owner_review_pharmacy_registration_v2(p_request_id,p_decision,p_official_pharmacy_name,p_official_pharmacy_code,p_note) x;
 IF lower(trim(p_decision))='approve' THEN
  PERFORM public.owner_set_pharmflow_permissions_v1((result->>'pharmacy_id')::uuid,p_receiving,p_expiry,p_data_access);
  UPDATE public.pharmacy_registration_requests SET initial_permissions=selected WHERE id=p_request_id;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.owner_review_pharmacy_registration_v3(uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_review_pharmacy_registration_v3(uuid,text,text,text,text,text,text,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.owner_review_pharmacy_registration_v2(uuid,text,text,text,text) FROM authenticated;

-- Identity-only bootstrap: never disclose another user's membership or pharmacy data.
CREATE FUNCTION public.get_my_pharmacy_access_status_v1() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('suspended',
  EXISTS(SELECT 1 FROM public.pharmacy_members m JOIN public.pharmacies p ON p.id=m.pharmacy_id
   WHERE m.user_id=auth.uid() AND m.active AND (NOT p.active OR p.status='suspended'))
  AND NOT EXISTS(SELECT 1 FROM public.pharmacy_members m JOIN public.pharmacies p ON p.id=m.pharmacy_id
   WHERE m.user_id=auth.uid() AND m.active AND p.active AND p.status='active'));
$$;
REVOKE ALL ON FUNCTION public.get_my_pharmacy_access_status_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_pharmacy_access_status_v1() TO authenticated;
NOTIFY pgrst,'reload schema';
