CREATE TABLE pharmflow_auth_private.pharmacy_deletion_history_v1 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 deleted_id uuid NOT NULL UNIQUE,
 deleted_name text NOT NULL,
 deleted_code text NOT NULL,
 deleted_by uuid,
 deleted_by_email text,
 deleted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE pharmflow_auth_private.pharmacy_deletion_history_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pharmflow_auth_private.pharmacy_deletion_history_v1 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION pharmflow_auth_private.record_pharmacy_deletion_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor_id uuid:=auth.uid();
BEGIN
 INSERT INTO pharmflow_auth_private.pharmacy_deletion_history_v1
  (deleted_id,deleted_name,deleted_code,deleted_by,deleted_by_email)
 VALUES (OLD.id,OLD.name,OLD.code,actor_id,(SELECT u.email FROM auth.users u WHERE u.id=actor_id));
 RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION pharmflow_auth_private.record_pharmacy_deletion_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pharmflow_record_pharmacy_deletion
 AFTER DELETE ON public.pharmacies FOR EACH ROW
 EXECUTE FUNCTION pharmflow_auth_private.record_pharmacy_deletion_v1();

CREATE FUNCTION public.owner_list_pharmacy_deletions_v1(p_before_id bigint DEFAULT NULL)
RETURNS TABLE(id bigint,pharmacy_name text,pharmacy_code text,deleted_by text,deleted_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF public.is_system_owner() IS NOT TRUE THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='System Administrator required.';
 END IF;
 RETURN QUERY
 SELECT h.id,h.deleted_name,h.deleted_code,coalesce(h.deleted_by_email,h.deleted_by::text),h.deleted_at
 FROM pharmflow_auth_private.pharmacy_deletion_history_v1 h
 WHERE p_before_id IS NULL OR h.id<p_before_id
 ORDER BY h.id DESC LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION public.owner_list_pharmacy_deletions_v1(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_list_pharmacy_deletions_v1(bigint) TO authenticated;
