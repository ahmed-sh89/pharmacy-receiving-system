-- Staging only. No credentials are stored in the operation journal.
CREATE TABLE pharmflow_auth_private.account_provision_v1 (
 operation_id uuid PRIMARY KEY,
 actor uuid NOT NULL REFERENCES auth.users(id),
 pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id),
 pharmacy_name text NOT NULL, pharmacy_code text NOT NULL, admin_email text NOT NULL,
 completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pharmflow_auth_private.account_provision_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pharmflow_auth_private.account_provision_v1 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.owner_provision_pharmacy_v1(
 p_operation_id uuid,p_name text,p_code text,p_admin_email text,p_finish boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r pharmflow_auth_private.account_provision_v1%rowtype; pid uuid; uid uuid; marker text;
 email_value text:=lower(trim(p_admin_email)); code_value text:=upper(trim(p_code));
BEGIN
 IF NOT pharmflow_auth_private.password_change_complete() OR NOT public.is_system_owner() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='System Administrator required';
 END IF;
 IF p_operation_id IS NULL OR nullif(trim(p_name),'') IS NULL OR code_value !~ '^[A-Z0-9_-]{3,24}$'
 OR email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Valid pharmacy name, code and admin email required'; END IF;
 -- Serialize retries before creating a pharmacy, including overlapping HTTP requests.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 SELECT * INTO r FROM pharmflow_auth_private.account_provision_v1 WHERE operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND THEN
  IF p_finish THEN RAISE EXCEPTION 'Provisioning operation missing'; END IF;
  SELECT x.pharmacy_id INTO pid FROM public.owner_create_pharmacy(trim(p_name),code_value,email_value) x;
  INSERT INTO pharmflow_auth_private.account_provision_v1(operation_id,actor,pharmacy_id,pharmacy_name,pharmacy_code,admin_email)
  VALUES(p_operation_id,auth.uid(),pid,trim(p_name),code_value,email_value) RETURNING * INTO r;
 ELSIF r.actor<>auth.uid() OR r.pharmacy_name<>trim(p_name) OR r.pharmacy_code<>code_value OR r.admin_email<>email_value THEN
  RAISE EXCEPTION 'Operation ID already used for a different request';
 END IF;
 SELECT id,raw_app_meta_data->>'pharmflow_provision_operation' INTO uid,marker FROM auth.users WHERE lower(email)=email_value LIMIT 1;
 IF p_finish AND r.completed_at IS NULL THEN
  IF uid IS NULL THEN RAISE EXCEPTION 'Auth account is not ready; retry this operation'; END IF;
  PERFORM public.owner_assign_pharmacy_admin(r.pharmacy_id,email_value);
  UPDATE pharmflow_auth_private.account_provision_v1 SET completed_at=clock_timestamp() WHERE operation_id=p_operation_id RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('pharmacy_id',r.pharmacy_id,'admin_user_id',uid,'admin_email',email_value,
 'created_for_operation',coalesce(marker=p_operation_id::text,false),'completed',r.completed_at IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.owner_provision_pharmacy_v1(uuid,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_provision_pharmacy_v1(uuid,text,text,text,boolean) TO authenticated;
