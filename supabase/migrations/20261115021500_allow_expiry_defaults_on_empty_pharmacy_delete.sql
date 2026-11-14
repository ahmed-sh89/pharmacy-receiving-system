-- Recognize only the built-ins and their exact, single ADD audit entries.
CREATE FUNCTION pharmflow_auth_private.expiry_operator_setup_only_v1(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT NOT EXISTS(
  SELECT FROM public.pharmflow_expiry_workers_v1 w WHERE w.pharmacy_id=p_id
   AND (
    w.system_key IS NULL OR w.system_key NOT IN ('DESKTOP','HANDHELD')
    OR w.worker_name IS DISTINCT FROM CASE w.system_key WHEN 'DESKTOP' THEN 'Desktop' ELSE 'Handheld' END
    OR w.active IS NOT TRUE OR w.updated_at IS DISTINCT FROM w.created_at
    OR (SELECT count(*) FROM pharmflow_expiry_private.operator_audit_v1 a
        WHERE a.pharmacy_id=p_id AND a.worker_id=w.id AND a.action='ADD'
         AND a.previous_name IS NULL AND a.name=w.worker_name
         AND a.actor=w.created_by AND a.occurred_at=w.created_at)<>1
   )
 ) AND NOT EXISTS(
  SELECT FROM pharmflow_expiry_private.operator_audit_v1 a
  LEFT JOIN public.pharmflow_expiry_workers_v1 w ON w.pharmacy_id=a.pharmacy_id AND w.id=a.worker_id
  WHERE a.pharmacy_id=p_id AND (
    w.id IS NULL OR a.action IS DISTINCT FROM 'ADD' OR a.previous_name IS NOT NULL
    OR a.name IS DISTINCT FROM w.worker_name OR a.actor IS DISTINCT FROM w.created_by
    OR a.occurred_at IS DISTINCT FROM w.created_at
  )
 );
$$;
REVOKE ALL ON FUNCTION pharmflow_auth_private.expiry_operator_setup_only_v1(uuid) FROM PUBLIC,anon,authenticated;

create or replace function pharmflow_expiry_private.protect_system_operator_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if TG_OP='DELETE' then
  -- The parent FK may remove a built-in only after the pharmacy is gone.
  if old.system_key is not null and (
   pg_trigger_depth()=1 or exists(select from public.pharmacies where id=old.pharmacy_id)
  ) then raise exception 'Built-in Operators cannot be removed';end if;
  return old;
 end if;
 if TG_OP='UPDATE' and old.system_key is not null and
   (new.worker_name is distinct from old.worker_name or new.active is distinct from old.active or new.pharmacy_id is distinct from old.pharmacy_id or new.system_key is distinct from old.system_key) then
   raise exception 'Built-in Operators cannot be changed';
 end if;
 if new.system_key is null and lower(btrim(new.worker_name)) in ('desktop','handheld') then raise exception 'This name is reserved for a built-in Operator';end if;
 if new.system_key is not null and (new.worker_name<>case new.system_key when 'DESKTOP' then 'Desktop' else 'Handheld' end or new.active is not true) then raise exception 'Invalid built-in Operator';end if;
 return new;
end $$;

-- Keep account identities intact. Delete the pharmacy and its setup records
-- only once all operational dependencies and evidence storage are clear.
CREATE OR REPLACE FUNCTION public.owner_delete_empty_pharmacy_v1(p_pharmacy_id uuid,p_pharmacy_code text)
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
  ELSIF (edge.schema_name,edge.table_name) IN (
   ('public','pharmflow_expiry_workers_v1'),('pharmflow_expiry_private','operator_audit_v1')
  ) THEN
   CONTINUE;
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

 IF NOT pharmflow_auth_private.expiry_operator_setup_only_v1(p_pharmacy_id) THEN
  RAISE EXCEPTION 'This pharmacy has configured Expiry operators or operator history. Use Deactivate to preserve it.';
 END IF;
 DELETE FROM pharmflow_expiry_private.operator_audit_v1 WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM pharmflow_auth_private.account_provision_v1 WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM public.pharmflow_permission_audit_v1 WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM public.pharmflow_pharmacy_permissions_v1 WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM public.pharmacy_members WHERE pharmacy_id=p_pharmacy_id;
 DELETE FROM public.pharmacies WHERE id=p_pharmacy_id;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'PharmFlow is busy. Try deleting this pharmacy again in a moment.';
END;
$$;
