-- Staging Phase 1. Existing UUIDs, roles, memberships and password gate remain authoritative.
CREATE TABLE public.pharmflow_pharmacy_permissions_v1 (
 pharmacy_id uuid PRIMARY KEY REFERENCES public.pharmacies(id),
 receiving text NOT NULL DEFAULT 'FULL' CHECK(receiving IN ('DISABLED','READ_ONLY','FULL')),
 expiry text NOT NULL DEFAULT 'FULL' CHECK(expiry IN ('DISABLED','READ_ONLY','FULL')),
 data_access text NOT NULL DEFAULT 'PHARMACY_ONLY' CHECK(data_access IN ('READ_ONLY','PHARMACY_ONLY','PHARMACY_GLOBAL')),
 revision bigint NOT NULL DEFAULT 1, updated_by uuid REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.pharmflow_permission_audit_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id),
 actor uuid NOT NULL REFERENCES auth.users(id), before_value jsonb NOT NULL, after_value jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.pharmflow_central_review_events_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id),
 actor uuid NOT NULL REFERENCES auth.users(id), operation_id text NOT NULL,
 mapping_id uuid NOT NULL, mapping_revision bigint NOT NULL, action text NOT NULL,
 before_value jsonb, after_value jsonb, source text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK(status='PENDING_REVIEW'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(pharmacy_id,mapping_id,mapping_revision,action)
);
ALTER TABLE public.pharmflow_pharmacy_permissions_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmflow_permission_audit_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmflow_central_review_events_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmflow_pharmacy_permissions_v1,public.pharmflow_permission_audit_v1,public.pharmflow_central_review_events_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pharmflow_pharmacy_permissions_v1,public.pharmflow_permission_audit_v1,public.pharmflow_central_review_events_v1 TO authenticated;
CREATE POLICY permissions_read ON public.pharmflow_pharmacy_permissions_v1 FOR SELECT TO authenticated USING(public.is_pharmacy_member(pharmacy_id));
CREATE POLICY permission_audit_owner ON public.pharmflow_permission_audit_v1 FOR SELECT TO authenticated USING(public.is_system_owner());
CREATE POLICY review_events_owner ON public.pharmflow_central_review_events_v1 FOR SELECT TO authenticated USING(public.is_system_owner());

-- Bootstrap the exception ONCE by code; all subsequent authorization uses the UUID row.
INSERT INTO public.pharmflow_pharmacy_permissions_v1(pharmacy_id,data_access)
 SELECT id,CASE WHEN code='HHP084' THEN 'PHARMACY_GLOBAL' ELSE 'PHARMACY_ONLY' END FROM public.pharmacies;
DO $verify$ BEGIN
 IF EXISTS(SELECT 1 FROM public.pharmacies p WHERE p.code='HHP084' AND NOT EXISTS(
  SELECT 1 FROM public.pharmflow_pharmacy_permissions_v1 a WHERE a.pharmacy_id=p.id AND a.data_access='PHARMACY_GLOBAL'))
 THEN RAISE EXCEPTION 'HHP084 UUID policy must exist before authorization cutover'; END IF;
END $verify$;

CREATE FUNCTION pharmflow_auth_private.seed_permissions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public AS $f$ BEGIN
 INSERT INTO public.pharmflow_pharmacy_permissions_v1(pharmacy_id) VALUES(new.id);
 RETURN new;
END $f$;
CREATE TRIGGER pharmflow_seed_permissions AFTER INSERT ON public.pharmacies FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.seed_permissions();

CREATE FUNCTION pharmflow_auth_private.module_allowed(pid uuid,mod text,writing boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public AS $f$
 SELECT pharmflow_auth_private.password_change_complete() AND
 (public.is_system_owner() OR EXISTS(
 SELECT 1 FROM public.pharmacy_members m JOIN public.pharmacies p ON p.id=m.pharmacy_id
 JOIN public.pharmflow_pharmacy_permissions_v1 a ON a.pharmacy_id=p.id
 WHERE m.user_id=auth.uid() AND m.pharmacy_id=pid AND m.active AND p.active AND p.status='active'
 AND CASE mod WHEN 'RECEIVING' THEN a.receiving WHEN 'EXPIRY' THEN a.expiry ELSE 'DISABLED' END
 =ANY(CASE WHEN writing THEN ARRAY['FULL'] ELSE ARRAY['FULL','READ_ONLY'] END)));
$f$;
CREATE FUNCTION pharmflow_auth_private.data_allowed(pid uuid,writing boolean DEFAULT false,global_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public AS $f$
 SELECT pharmflow_auth_private.password_change_complete() AND
 (public.is_system_owner() OR EXISTS(
 SELECT 1 FROM public.pharmacy_members m JOIN public.pharmacies p ON p.id=m.pharmacy_id
 JOIN public.pharmflow_pharmacy_permissions_v1 a ON a.pharmacy_id=p.id
 WHERE m.user_id=auth.uid() AND m.pharmacy_id=pid AND m.active AND p.active AND p.status='active'
 AND (NOT writing OR (m.role='admin' AND a.data_access=ANY(
 CASE WHEN global_write THEN ARRAY['PHARMACY_GLOBAL'] ELSE ARRAY['PHARMACY_ONLY','PHARMACY_GLOBAL'] END)))));
$f$;
CREATE FUNCTION pharmflow_auth_private.current_pharmacy() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public AS $f$
 SELECT m.pharmacy_id FROM public.pharmacy_members m JOIN public.pharmacies p ON p.id=m.pharmacy_id
 WHERE m.user_id=auth.uid() AND m.active AND p.status='active'
 ORDER BY m.created_at,m.pharmacy_id LIMIT 1;
$f$;
CREATE FUNCTION pharmflow_auth_private.global_allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public AS $f$
 SELECT CASE WHEN nullif(current_setting('pharmflow.permission_pharmacy',true),'') IS NOT NULL
 THEN pharmflow_auth_private.data_allowed(current_setting('pharmflow.permission_pharmacy')::uuid,true,true)
 ELSE pharmflow_auth_private.password_change_complete() AND (public.is_system_owner() OR EXISTS(
 SELECT 1 FROM public.pharmacy_members m JOIN public.pharmacies p ON p.id=m.pharmacy_id
 JOIN public.pharmflow_pharmacy_permissions_v1 a ON a.pharmacy_id=p.id
 WHERE m.user_id=auth.uid() AND m.active AND m.role='admin' AND p.active AND p.status='active' AND a.data_access='PHARMACY_GLOBAL')) END;
$f$;
CREATE FUNCTION pharmflow_auth_private.require_access(pid uuid,mod text,writing boolean,src text,op text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public AS $f$
BEGIN
 IF NOT (CASE WHEN mod='DATA' THEN pharmflow_auth_private.data_allowed(pid,writing)
  WHEN mod='GLOBAL' THEN pharmflow_auth_private.global_allowed()
  ELSE pharmflow_auth_private.module_allowed(pid,mod,writing) END) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PHARMFLOW_PERMISSION_DENIED',DETAIL=mod;
 END IF;
 IF pid IS NOT NULL THEN PERFORM set_config('pharmflow.permission_pharmacy',pid::text,true); END IF;
 PERFORM set_config('pharmflow.permission_source',src,true);
 IF op IS NOT NULL THEN PERFORM set_config('pharmflow.permission_operation',op,true); END IF;
END $f$;

CREATE FUNCTION public.get_my_pharmflow_permissions_v1(p_pharmacy_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public AS $f$
DECLARE a public.pharmflow_pharmacy_permissions_v1%rowtype;
BEGIN
 IF NOT pharmflow_auth_private.data_allowed(p_pharmacy_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Pharmacy access required'; END IF;
 SELECT * INTO a FROM public.pharmflow_pharmacy_permissions_v1 WHERE pharmacy_id=p_pharmacy_id;
 RETURN to_jsonb(a)||jsonb_build_object('system_administrator',public.is_system_owner());
END $f$;
CREATE FUNCTION public.owner_set_pharmflow_permissions_v1(p_pharmacy_id uuid,p_receiving text,p_expiry text,p_data_access text,p_expected_revision bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public AS $f$
DECLARE oldrow public.pharmflow_pharmacy_permissions_v1%rowtype; newrow public.pharmflow_pharmacy_permissions_v1%rowtype;
BEGIN
 IF NOT pharmflow_auth_private.password_change_complete() OR NOT public.is_system_owner() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='System Administrator required'; END IF;
 SELECT * INTO oldrow FROM public.pharmflow_pharmacy_permissions_v1 WHERE pharmacy_id=p_pharmacy_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pharmacy policy missing'; END IF;
 IF p_expected_revision IS NOT NULL AND oldrow.revision<>p_expected_revision THEN RAISE EXCEPTION 'Permission policy changed; reload'; END IF;
 UPDATE public.pharmflow_pharmacy_permissions_v1 SET receiving=p_receiving,expiry=p_expiry,data_access=p_data_access,
 revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE pharmacy_id=p_pharmacy_id RETURNING * INTO newrow;
 INSERT INTO public.pharmflow_permission_audit_v1(pharmacy_id,actor,before_value,after_value) VALUES(p_pharmacy_id,auth.uid(),to_jsonb(oldrow),to_jsonb(newrow));
 RETURN to_jsonb(newrow);
END $f$;
REVOKE ALL ON FUNCTION public.get_my_pharmflow_permissions_v1(uuid),public.owner_set_pharmflow_permissions_v1(uuid,text,text,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_pharmflow_permissions_v1(uuid),public.owner_set_pharmflow_permissions_v1(uuid,text,text,text,bigint) TO authenticated;

CREATE FUNCTION pharmflow_auth_private.mapping_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public AS $f$
DECLARE pid uuid; BEGIN
 IF auth.uid() IS NULL THEN RETURN coalesce(new,old); END IF;
 pid:=CASE WHEN TG_OP='DELETE' THEN old.pharmacy_id ELSE new.pharmacy_id END;
 IF TG_OP='UPDATE' AND old.pharmacy_id<>new.pharmacy_id THEN RAISE EXCEPTION 'Mapping pharmacy is immutable'; END IF;
 PERFORM pharmflow_auth_private.require_access(pid,'DATA',true,coalesce(nullif(current_setting('pharmflow.permission_source',true),''),TG_TABLE_NAME||':'||TG_OP));
 RETURN coalesce(new,old);
END $f$;
CREATE FUNCTION pharmflow_auth_private.capture_local_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public AS $f$
DECLARE r jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(old) ELSE to_jsonb(new) END; mode text; op text;
BEGIN
 IF auth.uid() IS NULL THEN RETURN coalesce(new,old); END IF;
 SELECT data_access INTO mode FROM public.pharmflow_pharmacy_permissions_v1 WHERE pharmacy_id=(r->>'pharmacy_id')::uuid;
 IF mode='PHARMACY_ONLY' THEN
  op:=coalesce(nullif(current_setting('pharmflow.permission_operation',true),''),gen_random_uuid()::text);
  INSERT INTO public.pharmflow_central_review_events_v1(pharmacy_id,actor,operation_id,mapping_id,mapping_revision,action,before_value,after_value,source)
  VALUES((r->>'pharmacy_id')::uuid,auth.uid(),op,(r->>'id')::uuid,coalesce((r->>'mapping_revision')::bigint,1),TG_OP,
   CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(old) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(new) END,
   coalesce(nullif(current_setting('pharmflow.permission_source',true),''),r->>'source',TG_TABLE_NAME));
 END IF;
 RETURN coalesce(new,old);
END $f$;
CREATE TRIGGER pharmflow_mapping_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_pharmacy_gtin_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.mapping_guard();
CREATE TRIGGER pharmflow_mapping_review AFTER INSERT OR UPDATE OR DELETE ON public.pharmflow_pharmacy_gtin_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.capture_local_review();

CREATE FUNCTION pharmflow_auth_private.global_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public AS $f$ BEGIN
 IF auth.uid() IS NOT NULL AND NOT pharmflow_auth_private.global_allowed() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Global data permission required'; END IF;
 RETURN coalesce(new,old);
END $f$;
CREATE TRIGGER pharmflow_global_item_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_global_items_v2 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.global_guard();
CREATE TRIGGER pharmflow_global_identifier_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_global_item_identifiers_v2 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.global_guard();

-- Current supported storage namespaces: expiry-v1 is Expiry; legacy review evidence is Receiving.
CREATE FUNCTION pharmflow_auth_private.storage_allowed(path text,writing boolean) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public AS $f$ BEGIN
 RETURN pharmflow_auth_private.module_allowed(split_part(path,'/',1)::uuid,
 CASE WHEN split_part(path,'/',2)='expiry-v1' THEN 'EXPIRY' ELSE 'RECEIVING' END,writing);
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $f$;
CREATE POLICY pharmflow_module_read ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(pharmflow_auth_private.storage_allowed(name,false));
CREATE POLICY pharmflow_module_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(pharmflow_auth_private.storage_allowed(name,true));
CREATE POLICY pharmflow_module_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(pharmflow_auth_private.storage_allowed(name,true)) WITH CHECK(pharmflow_auth_private.storage_allowed(name,true));
CREATE POLICY pharmflow_module_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(pharmflow_auth_private.storage_allowed(name,true));
CREATE POLICY pharmflow_expiry_module ON public.pharmflow_expiry_current_state_v1 AS RESTRICTIVE FOR SELECT TO authenticated USING(pharmflow_auth_private.module_allowed(pharmacy_id,'EXPIRY',false));
CREATE POLICY pharmflow_expiry_module ON public.pharmflow_expiry_events_v1 AS RESTRICTIVE FOR SELECT TO authenticated USING(pharmflow_auth_private.module_allowed(pharmacy_id,'EXPIRY',false));

-- No SQL-level schema/trigger privileges are needed by browser roles.
REVOKE TRUNCATE,REFERENCES,TRIGGER ON public.pharmflow_needs_review_v2 FROM anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION pharmflow_auth_private.business_write_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public AS $f$
DECLARE r jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(old) ELSE to_jsonb(new) END; mod text:=TG_ARGV[0];
BEGIN
 IF auth.uid() IS NULL THEN RETURN coalesce(new,old); END IF;
 IF mod='DYNAMIC' THEN mod:=upper(coalesce(r->>'workflow','RECEIVING')); END IF;
 PERFORM pharmflow_auth_private.require_access((r->>'pharmacy_id')::uuid,mod,true,TG_TABLE_NAME||':'||TG_OP);
 RETURN coalesce(new,old);
END $f$;
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_receiving_transactions_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('RECEIVING');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_orders FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('RECEIVING');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_order_source_items FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('RECEIVING');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_cloud_workspaces FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('RECEIVING');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_active_order_manifest_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('RECEIVING');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_workspace_generation_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('RECEIVING');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_finalized_archives_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('RECEIVING');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_needs_review_resolution_intents_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('RECEIVING');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_expiry_captures_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('EXPIRY');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_expiry_current_state_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('EXPIRY');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_expiry_events_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('EXPIRY');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_expiry_workers_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('EXPIRY');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_expiry_review_resolution_audit_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('EXPIRY');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_needs_review_v1 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('DYNAMIC');
CREATE TRIGGER pharmflow_business_permission BEFORE INSERT OR UPDATE OR DELETE ON public.pharmflow_needs_review_v2 FOR EACH ROW EXECUTE FUNCTION pharmflow_auth_private.business_write_guard('DYNAMIC');
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA pharmflow_auth_private FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION pharmflow_auth_private.module_allowed(uuid,text,boolean),pharmflow_auth_private.data_allowed(uuid,boolean,boolean),pharmflow_auth_private.storage_allowed(text,boolean) TO authenticated;
