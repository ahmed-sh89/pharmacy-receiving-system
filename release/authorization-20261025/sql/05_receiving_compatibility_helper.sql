CREATE OR REPLACE FUNCTION pharmflow_auth_private.require_receiving_compat(pid uuid,workflow text,writing boolean,src text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF workflow IS NULL OR upper(workflow)='RECEIVING' THEN
  PERFORM pharmflow_auth_private.require_access(pid,'RECEIVING',writing,src);
 END IF;
 IF workflow IS NULL OR upper(workflow)='EXPIRY' THEN
  PERFORM pharmflow_auth_private.require_access(pid,'EXPIRY',writing,src);
 END IF;
 IF workflow IS NOT NULL AND upper(workflow) NOT IN ('RECEIVING','EXPIRY') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PHARMFLOW_PERMISSION_DENIED';
 END IF;
END $$;
REVOKE ALL ON FUNCTION pharmflow_auth_private.require_receiving_compat(uuid,text,boolean,text) FROM PUBLIC,anon,authenticated;

