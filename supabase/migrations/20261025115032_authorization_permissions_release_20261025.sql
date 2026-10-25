CREATE OR REPLACE FUNCTION public.owner_create_pharmacy(p_name text, p_code text, p_admin_email text)
 RETURNS TABLE(pharmacy_id uuid, pharmacy_code text, pharmacy_name text, admin_email text, invite_token uuid, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_user uuid := auth.uid();
    v_pharmacy uuid;
    v_code text;
    v_token uuid;
    v_exp timestamptz;
begin
    if v_user is null or not public.is_system_owner() then
        raise exception 'Owner permission required';
    end if;

    if nullif(trim(p_name),'') is null then
        raise exception 'Pharmacy name is required';
    end if;
    if nullif(trim(p_admin_email),'') is null then
        raise exception 'Admin email is required';
    end if;

    v_code := upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9_-]+', '', 'g'));
    if length(v_code) < 3 then
        raise exception 'Pharmacy code must be at least 3 characters';
    end if;

    insert into public.pharmacies(code, name)
    values (v_code, trim(p_name))
    returning id into v_pharmacy;

    insert into public.pharmacy_invitations(pharmacy_id,email,role,created_by)
    values (v_pharmacy, lower(trim(p_admin_email)), 'admin', v_user)
    returning pharmacy_invitations.invite_token, pharmacy_invitations.expires_at into v_token, v_exp;

    return query
    select v_pharmacy, v_code, trim(p_name), lower(trim(p_admin_email)), v_token, v_exp;
end;
$function$
;

-- Authorization release candidate. A current server-owned Auth flag gates all Data API business routes.
CREATE SCHEMA pharmflow_auth_private;
REVOKE ALL ON SCHEMA pharmflow_auth_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA pharmflow_auth_private TO authenticated;
CREATE FUNCTION pharmflow_auth_private.password_change_complete()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, auth
AS $fn$
 SELECT EXISTS (
  SELECT 1 FROM auth.users u
  WHERE u.id=auth.uid()
   AND coalesce(u.raw_app_meta_data->>'pharmflow_must_change_password','false')<>'true'
 );
$fn$;
REVOKE ALL ON FUNCTION pharmflow_auth_private.password_change_complete() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION pharmflow_auth_private.password_change_complete() TO authenticated;

CREATE FUNCTION public.pharmflow_password_change_request_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $fn$
DECLARE request_path text:=regexp_replace(coalesce(current_setting('request.path',true),''),'^/','');
BEGIN
 IF auth.uid() IS NULL THEN RETURN; END IF;
 -- Exact identity/bootstrap reads and signed-session cleanup only.
 -- Password replacement and logout use Auth/Edge endpoints, not business RPCs.
 IF request_path=ANY(ARRAY[
  'rpc/get_public_setup_status','rpc/get_my_app_context',
  'rpc/get_my_pharmacy_registration','rpc/close_pharmflow_expiry_auth_session_v1'
 ]) THEN RETURN; END IF;
 IF NOT pharmflow_auth_private.password_change_complete() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PASSWORD_CHANGE_REQUIRED',
   HINT='Replace the temporary password before accessing business data.';
 END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.pharmflow_password_change_request_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pharmflow_password_change_request_guard() TO anon,authenticated,service_role;

-- Restrictive policies cannot be ORed away by existing permissive policies.
CREATE POLICY pharmflow_password_change_gate ON public.pharmflow_expiry_current_state_v1
 AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT pharmflow_auth_private.password_change_complete()))
 WITH CHECK ((SELECT pharmflow_auth_private.password_change_complete()));
CREATE POLICY pharmflow_password_change_gate ON public.pharmflow_expiry_events_v1
 AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT pharmflow_auth_private.password_change_complete()))
 WITH CHECK ((SELECT pharmflow_auth_private.password_change_complete()));
CREATE POLICY pharmflow_password_change_gate ON storage.objects
 AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT pharmflow_auth_private.password_change_complete()))
 WITH CHECK ((SELECT pharmflow_auth_private.password_change_complete()));

DO $check$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles r,unnest(coalesce(r.rolconfig,ARRAY[]::text[])) c
   WHERE r.rolname='authenticator' AND c LIKE 'pgrst.db_pre_request=%') THEN
  RAISE EXCEPTION 'Existing request hook requires explicit composition; refusing to replace it';
 END IF;
END;
$check$;
ALTER ROLE authenticator SET pgrst.db_pre_request='public.pharmflow_password_change_request_guard';
NOTIFY pgrst,'reload config';

-- Authorization release Phase 1. Existing UUIDs, roles, memberships and password gate remain authoritative.
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
DO $optional_hook$ BEGIN
 IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated;
 END IF;
END $optional_hook$;

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

-- Production bodies with only approved authorization guards added. Existing ACLs retained.
CREATE OR REPLACE FUNCTION public.set_pharmflow_needs_review_photo_v2(p_pharmacy_id uuid, p_review_id uuid, p_photo_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'set_pharmflow_needs_review_photo_v2',NULL);

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
  perform 1 from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;


    update public.pharmflow_needs_review_v2
       set photo_path = nullif(trim(coalesce(p_photo_path,'')),''),
           updated_at = now()
     where id = p_review_id
       and pharmacy_id = p_pharmacy_id
       and status = 'PENDING';

    return found;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_pharmacy_expiry_verified_state_v1(p_pharmacy_id uuid, p_item_code text, p_item_name text, p_identifier_display text, p_category text, p_quantity integer, p_expiry_month integer, p_expiry_year integer, p_worker_id uuid, p_batch_no text DEFAULT NULL::text, p_sample_serial text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_event_type text DEFAULT 'CAPTURE'::text)
 RETURNS TABLE(state_id uuid, event_id uuid, last_verified_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_user uuid := auth.uid();
    v_worker_name text;
    v_identifier_display text := btrim(coalesce(p_identifier_display,''));
    v_identifier_key text;
    v_item_code text := btrim(coalesce(p_item_code,''));
    v_item_name text := btrim(coalesce(p_item_name,''));
    v_batch_no text := nullif(btrim(coalesce(p_batch_no,'')),'');
    v_batch_key text := coalesce(nullif(upper(btrim(coalesce(p_batch_no,''))),''),'');
    v_source text := upper(btrim(coalesce(p_source,'HANDHELD')));
    v_event_type text := upper(btrim(coalesce(p_event_type,'CAPTURE')));
    v_state_id uuid;
    v_event_id uuid;
    v_previous_quantity integer;
    v_now timestamptz := now();
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmacy_expiry_verified_state_v1',NULL);

    if v_user is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if v_item_code='' or v_item_name='' or v_identifier_display='' then
        raise exception 'Item Code, Item Name and Identifier are required';
    end if;

    v_identifier_key := public.pharmflow_identifier_key_v2(v_identifier_display);
    if nullif(v_identifier_key,'') is null then
        raise exception 'Identifier is invalid';
    end if;

    if p_quantity is null or p_quantity < 0 then
        raise exception 'Quantity cannot be negative';
    end if;
    if p_expiry_month not between 1 and 12 or p_expiry_year not between 2020 and 2200 then
        raise exception 'Expiry date is invalid';
    end if;
    if v_source not in ('HANDHELD','PC') then
        raise exception 'Invalid expiry source';
    end if;
    if v_event_type not in ('CAPTURE','RECOUNT','CLEARED') then
        raise exception 'Invalid expiry event type';
    end if;
    if (v_event_type='CLEARED' and p_quantity<>0) or (v_event_type<>'CLEARED' and p_quantity=0) then
        raise exception 'Zero quantity must use CLEARED and CLEARED must use zero quantity';
    end if;

    select w.worker_name
      into v_worker_name
      from public.pharmflow_expiry_workers_v1 w
     where w.id=p_worker_id and w.pharmacy_id=p_pharmacy_id and w.active=true;

    if v_worker_name is null then
        raise exception 'Select an active worker before saving';
    end if;

    select s.id,s.verified_quantity
      into v_state_id,v_previous_quantity
      from public.pharmflow_expiry_current_state_v1 s
     where s.pharmacy_id=p_pharmacy_id
       and s.item_code=v_item_code
       and s.batch_key=v_batch_key
       and s.expiry_year=p_expiry_year
       and s.expiry_month=p_expiry_month
     for update;

    if v_state_id is null then
        insert into public.pharmflow_expiry_current_state_v1(
            pharmacy_id,item_code,item_name,identifier_display,identifier_key,category,
            batch_no,batch_key,sample_serial,expiry_month,expiry_year,verified_quantity,
            worker_id,verified_by_name,verified_by_user_id,last_verified_at,device_id,
            source,status
        ) values (
            p_pharmacy_id,v_item_code,v_item_name,v_identifier_display,v_identifier_key,
            nullif(btrim(coalesce(p_category,'')),''),v_batch_no,v_batch_key,
            nullif(btrim(coalesce(p_sample_serial,'')),''),p_expiry_month,p_expiry_year,
            p_quantity,p_worker_id,v_worker_name,v_user,v_now,
            nullif(btrim(coalesce(p_device_id,'')),''),v_source,
            case when p_quantity=0 then 'CLEARED' else 'ACTIVE' end
        )
        returning id into v_state_id;
    else
        update public.pharmflow_expiry_current_state_v1
           set item_name=v_item_name,
               identifier_display=v_identifier_display,
               identifier_key=v_identifier_key,
               category=nullif(btrim(coalesce(p_category,'')),''),
               batch_no=v_batch_no,
               sample_serial=nullif(btrim(coalesce(p_sample_serial,'')),''),
               verified_quantity=p_quantity,
               worker_id=p_worker_id,
               verified_by_name=v_worker_name,
               verified_by_user_id=v_user,
               last_verified_at=v_now,
               device_id=nullif(btrim(coalesce(p_device_id,'')),''),
               source=v_source,
               status=case when p_quantity=0 then 'CLEARED' else 'ACTIVE' end,
               updated_at=v_now
         where id=v_state_id;
    end if;

    insert into public.pharmflow_expiry_events_v1(
        state_id,pharmacy_id,event_type,item_code,item_name,identifier_display,
        identifier_key,category,batch_no,sample_serial,expiry_month,expiry_year,
        previous_quantity,verified_quantity,worker_id,verified_by_name,
        verified_by_user_id,device_id,source,occurred_at
    ) values (
        v_state_id,p_pharmacy_id,v_event_type,v_item_code,v_item_name,
        v_identifier_display,v_identifier_key,nullif(btrim(coalesce(p_category,'')),''),
        v_batch_no,nullif(btrim(coalesce(p_sample_serial,'')),''),p_expiry_month,p_expiry_year,
        v_previous_quantity,p_quantity,p_worker_id,v_worker_name,v_user,
        nullif(btrim(coalesce(p_device_id,'')),''),v_source,v_now
    ) returning id into v_event_id;

    return query select v_state_id,v_event_id,v_now;
end
$function$
;
CREATE OR REPLACE FUNCTION public.save_pharmacy_expiry_verified_state_v2(p_pharmacy_id uuid, p_item_code text, p_item_name text, p_identifier_display text, p_category text, p_quantity integer, p_expiry_month integer, p_expiry_year integer, p_worker_id uuid DEFAULT NULL::uuid, p_batch_no text DEFAULT NULL::text, p_sample_serial text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_event_type text DEFAULT 'CAPTURE'::text)
 RETURNS TABLE(state_id uuid, event_id uuid, last_verified_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_user uuid:=auth.uid(); v_worker_name text; v_identifier_display text:=btrim(coalesce(p_identifier_display,''));
 v_identifier_key text; v_item_code text:=btrim(coalesce(p_item_code,'')); v_item_name text:=btrim(coalesce(p_item_name,''));
 v_batch_no text:=nullif(btrim(coalesce(p_batch_no,'')),''); v_batch_key text:=coalesce(nullif(upper(btrim(coalesce(p_batch_no,''))),''),'');
 v_source text:=upper(btrim(coalesce(p_source,'HANDHELD'))); v_event_type text:=upper(btrim(coalesce(p_event_type,'CAPTURE')));
 v_state_id uuid; v_event_id uuid; v_previous_quantity integer; v_new_quantity integer; v_now timestamptz:=now();
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmacy_expiry_verified_state_v2',NULL);

 if v_user is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 if v_item_code='' or v_item_name='' or v_identifier_display='' then raise exception 'Item Code, Item Name and Identifier are required'; end if;
 v_identifier_key:=public.pharmflow_identifier_key_v2(v_identifier_display);
 if nullif(v_identifier_key,'') is null then raise exception 'Identifier is invalid'; end if;
 if p_quantity is null or p_quantity<0 then raise exception 'Quantity cannot be negative'; end if;
 if p_expiry_month not between 1 and 12 or p_expiry_year not between 2020 and 2200 then raise exception 'Expiry date is invalid'; end if;
 if v_source not in ('HANDHELD','PC') then raise exception 'Invalid expiry source'; end if;
 if v_event_type not in ('CAPTURE','RECOUNT','CLEARED') then raise exception 'Invalid expiry event type'; end if;
 if (v_event_type='CLEARED' and p_quantity<>0) or (v_event_type<>'CLEARED' and p_quantity=0) then raise exception 'Invalid zero quantity event'; end if;
 if p_worker_id is not null then
   select w.worker_name into v_worker_name from public.pharmflow_expiry_workers_v1 w
   where w.id=p_worker_id and w.pharmacy_id=p_pharmacy_id and w.active=true;
   if v_worker_name is null then raise exception 'Selected operator is not active'; end if;
 elsif v_source='HANDHELD' then raise exception 'Select an active worker before saving';
 else v_worker_name:='Desktop';
 end if;
 select s.id,s.verified_quantity into v_state_id,v_previous_quantity from public.pharmflow_expiry_current_state_v1 s
 where s.pharmacy_id=p_pharmacy_id and s.item_code=v_item_code and s.batch_key=v_batch_key
 and s.expiry_year=p_expiry_year and s.expiry_month=p_expiry_month for update;
 if v_event_type='CAPTURE' then v_new_quantity:=coalesce(v_previous_quantity,0)+p_quantity;
 elsif v_event_type='RECOUNT' then v_new_quantity:=p_quantity; else v_new_quantity:=0; end if;
 if v_state_id is null then
  insert into public.pharmflow_expiry_current_state_v1(pharmacy_id,item_code,item_name,identifier_display,identifier_key,category,batch_no,batch_key,sample_serial,expiry_month,expiry_year,verified_quantity,worker_id,verified_by_name,verified_by_user_id,last_verified_at,device_id,source,status)
  values(p_pharmacy_id,v_item_code,v_item_name,v_identifier_display,v_identifier_key,nullif(btrim(coalesce(p_category,'')),''),v_batch_no,v_batch_key,nullif(btrim(coalesce(p_sample_serial,'')),''),p_expiry_month,p_expiry_year,v_new_quantity,p_worker_id,v_worker_name,v_user,v_now,nullif(btrim(coalesce(p_device_id,'')),''),v_source,case when v_new_quantity=0 then 'CLEARED' else 'ACTIVE' end)
  returning id into v_state_id;
 else
  update public.pharmflow_expiry_current_state_v1 set item_name=v_item_name,identifier_display=v_identifier_display,identifier_key=v_identifier_key,
  category=nullif(btrim(coalesce(p_category,'')),''),batch_no=v_batch_no,sample_serial=nullif(btrim(coalesce(p_sample_serial,'')),''),
  verified_quantity=v_new_quantity,worker_id=p_worker_id,verified_by_name=v_worker_name,verified_by_user_id=v_user,last_verified_at=v_now,
  device_id=nullif(btrim(coalesce(p_device_id,'')),''),source=v_source,status=case when v_new_quantity=0 then 'CLEARED' else 'ACTIVE' end,updated_at=v_now where id=v_state_id;
 end if;
 insert into public.pharmflow_expiry_events_v1(state_id,pharmacy_id,event_type,item_code,item_name,identifier_display,identifier_key,category,batch_no,sample_serial,expiry_month,expiry_year,previous_quantity,verified_quantity,worker_id,verified_by_name,verified_by_user_id,device_id,source,occurred_at)
 values(v_state_id,p_pharmacy_id,v_event_type,v_item_code,v_item_name,v_identifier_display,v_identifier_key,nullif(btrim(coalesce(p_category,'')),''),v_batch_no,nullif(btrim(coalesce(p_sample_serial,'')),''),p_expiry_month,p_expiry_year,v_previous_quantity,v_new_quantity,p_worker_id,v_worker_name,v_user,nullif(btrim(coalesce(p_device_id,'')),''),v_source,v_now) returning id into v_event_id;
 return query select v_state_id,v_event_id,v_now;
end $function$
;
CREATE OR REPLACE FUNCTION public.create_pharmflow_needs_review_v3(p_pharmacy_id uuid, p_workflow text, p_identifier_display text, p_raw_barcode text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_review_reason text DEFAULT 'UNKNOWN_GTIN'::text, p_master_item_code_hint text DEFAULT NULL::text, p_master_item_name_hint text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_device_id text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_display text:=btrim(coalesce(p_identifier_display,''));v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);v_id uuid;v_time timestamptz;begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),true,'create_pharmflow_needs_review_v3',NULL);
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;if v_key='' then raise exception 'Identifier is required';end if;if upper(trim(coalesce(p_workflow,'RECEIVING'))) <> 'RECEIVING' then raise exception 'Invalid workflow';end if;if upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))) not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason';end if;if upper(btrim(coalesce(p_source,'HANDHELD'))) not in ('HANDHELD','PC') then raise exception 'Invalid source';end if;insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,session_id,order_number,order_name,gtin,raw_barcode,identifier_display,identifier_key,pending_quantity,review_reason,master_item_code_hint,master_item_name_hint,source,device_id,created_by) values(p_pharmacy_id,'RECEIVING',nullif(btrim(coalesce(p_session_id,'')),''),nullif(btrim(coalesce(p_order_number,'')),''),nullif(btrim(coalesce(p_order_name,'')),''),v_display,nullif(p_raw_barcode,''),v_display,v_key,1,upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),nullif(btrim(coalesce(p_master_item_code_hint,'')),''),nullif(btrim(coalesce(p_master_item_name_hint,'')),''),upper(btrim(coalesce(p_source,'HANDHELD'))),nullif(btrim(coalesce(p_device_id,'')),''),auth.uid()) returning id,pharmflow_needs_review_v2.created_at into v_id,v_time;return query select v_id,1,v_time;end $function$
;
CREATE OR REPLACE FUNCTION public.save_pharmacy_expiry_capture_smart(p_pharmacy_id uuid, p_item_code text, p_item_name text, p_gtin text, p_category text, p_quantity integer, p_expiry_month integer, p_expiry_year integer, p_worker_id uuid, p_batch_no text DEFAULT NULL::text, p_sample_serial text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text)
 RETURNS TABLE(capture_id uuid, captured_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_worker_name text; v_capture uuid; v_time timestamptz; v_gtin text:=regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g'); v_source text:=upper(trim(coalesce(p_source,'HANDHELD')));
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmacy_expiry_capture_smart',NULL);

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 if nullif(trim(coalesce(p_item_code,'')),'') is null or nullif(trim(coalesce(p_item_name,'')),'') is null or v_gtin='' then raise exception 'Item Code, Item Name and GTIN are required'; end if;
 if coalesce(p_quantity,0)<=0 then raise exception 'Quantity must be greater than zero'; end if;
 if p_expiry_month not between 1 and 12 or p_expiry_year not between 2020 and 2200 then raise exception 'Expiry date is invalid'; end if;
 if v_source not in ('HANDHELD','PC') then raise exception 'Invalid expiry capture source'; end if;
 select w.worker_name into v_worker_name from public.pharmflow_expiry_workers_v1 w where w.id=p_worker_id and w.pharmacy_id=p_pharmacy_id and w.active=true;
 if v_worker_name is null then raise exception 'Select an active worker before saving'; end if;
 insert into public.pharmflow_expiry_captures_v1(pharmacy_id,item_code,item_name,gtin,category,quantity,expiry_month,expiry_year,worker_id,captured_by_name,captured_by_user_id,device_id,source,batch_no,sample_serial)
 values(p_pharmacy_id,trim(p_item_code),trim(p_item_name),v_gtin,nullif(trim(coalesce(p_category,'')),''),p_quantity,p_expiry_month,p_expiry_year,p_worker_id,v_worker_name,auth.uid(),nullif(trim(coalesce(p_device_id,'')),''),v_source,nullif(trim(coalesce(p_batch_no,'')),''),nullif(trim(coalesce(p_sample_serial,'')),''))
 returning id,pharmflow_expiry_captures_v1.captured_at into v_capture,v_time;
 return query select v_capture,v_time;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_pharmacy_needs_review(p_pharmacy_id uuid, p_workflow text, p_gtin text, p_raw_barcode text DEFAULT NULL::text, p_order_id text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_pending_quantity integer DEFAULT 1, p_expiry_month integer DEFAULT NULL::integer, p_expiry_year integer DEFAULT NULL::integer, p_worker_id uuid DEFAULT NULL::uuid, p_device_id text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text)
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_w text:=upper(trim(coalesce(p_workflow,''))); v_s text:=upper(trim(coalesce(p_source,'HANDHELD')));
 v_g text:=regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g'); v_q integer:=greatest(coalesce(p_pending_quantity,1),1);
 v_worker text; v_id uuid; v_time timestamptz;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),true,'save_pharmacy_needs_review',NULL);

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 if v_w not in ('RECEIVING','EXPIRY') or v_g='' then raise exception 'Invalid review item'; end if;
 if v_s not in ('HANDHELD','PC') then raise exception 'Invalid source'; end if;
 if v_w='EXPIRY' then
   if p_expiry_month not between 1 and 12 or p_expiry_year not between 2020 and 2200 then raise exception 'Select expiry date'; end if;
   select worker_name into v_worker from public.pharmflow_expiry_workers_v1 where id=p_worker_id and pharmacy_id=p_pharmacy_id and active=true;
   if v_worker is null then raise exception 'Select an active worker'; end if;
 end if;
 if v_w='RECEIVING' then
   select id into v_id from public.pharmflow_needs_review_v1
    where pharmacy_id=p_pharmacy_id and workflow='RECEIVING' and status='PENDING' and gtin=v_g
      and coalesce(order_id,'')=coalesce(p_order_id,'') limit 1 for update;
   if v_id is not null then
     update public.pharmflow_needs_review_v1 set pending_quantity=pharmflow_needs_review_v1.pending_quantity+v_q,updated_at=now()
      where id=v_id returning pharmflow_needs_review_v1.pending_quantity,pharmflow_needs_review_v1.created_at into v_q,v_time;
     return query select v_id,v_q,v_time; return;
   end if;
 end if;
 insert into public.pharmflow_needs_review_v1(pharmacy_id,workflow,gtin,raw_barcode,order_id,order_name,pending_quantity,expiry_month,expiry_year,worker_id,captured_by_name,device_id,source,created_by)
 values(p_pharmacy_id,v_w,v_g,nullif(p_raw_barcode,''),nullif(p_order_id,''),nullif(p_order_name,''),v_q,p_expiry_month,p_expiry_year,p_worker_id,v_worker,nullif(p_device_id,''),v_s,auth.uid())
 returning id,pharmflow_needs_review_v1.created_at into v_id,v_time;
 return query select v_id,v_q,v_time;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_pharmacy_expiry_capture(p_pharmacy_id uuid, p_item_code text, p_item_name text, p_gtin text, p_category text, p_quantity integer, p_expiry_month integer, p_expiry_year integer, p_worker_id uuid, p_device_id text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text)
 RETURNS TABLE(capture_id uuid, captured_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_worker_name text;
    v_capture uuid;
    v_time timestamptz;
    v_gtin text := regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g');
    v_source text := upper(trim(coalesce(p_source,'HANDHELD')));
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmacy_expiry_capture',NULL);

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if nullif(trim(coalesce(p_item_code,'')),'') is null
       or nullif(trim(coalesce(p_item_name,'')),'') is null
       or v_gtin = '' then
        raise exception 'Item Code, Item Name and GTIN are required';
    end if;

    if coalesce(p_quantity,0) <= 0 then
        raise exception 'Quantity must be greater than zero';
    end if;

    if p_expiry_month not between 1 and 12 then
        raise exception 'Expiry month must be between 1 and 12';
    end if;

    if p_expiry_year not between 2020 and 2200 then
        raise exception 'Expiry year is invalid';
    end if;

    if v_source not in ('HANDHELD','PC') then
        raise exception 'Invalid expiry capture source';
    end if;

    select w.worker_name
    into v_worker_name
    from public.pharmflow_expiry_workers_v1 w
    where w.id = p_worker_id
      and w.pharmacy_id = p_pharmacy_id
      and w.active = true;

    if v_worker_name is null then
        raise exception 'Select an active worker before saving';
    end if;

    insert into public.pharmflow_expiry_captures_v1(
        pharmacy_id,
        item_code,
        item_name,
        gtin,
        category,
        quantity,
        expiry_month,
        expiry_year,
        worker_id,
        captured_by_name,
        captured_by_user_id,
        device_id,
        source
    )
    values (
        p_pharmacy_id,
        trim(p_item_code),
        trim(p_item_name),
        v_gtin,
        nullif(trim(coalesce(p_category,'')),''),
        p_quantity,
        p_expiry_month,
        p_expiry_year,
        p_worker_id,
        v_worker_name,
        auth.uid(),
        nullif(trim(coalesce(p_device_id,'')),''),
        v_source
    )
    returning id, pharmflow_expiry_captures_v1.captured_at
    into v_capture, v_time;

    return query select v_capture, v_time;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_pharmacy_needs_review(p_pharmacy_id uuid, p_workflow text, p_gtin text, p_raw_barcode text DEFAULT NULL::text, p_order_id text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_pending_quantity integer DEFAULT 1, p_expiry_month integer DEFAULT NULL::integer, p_expiry_year integer DEFAULT NULL::integer, p_worker_id uuid DEFAULT NULL::uuid, p_device_id text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_review_reason text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_w text:=upper(trim(coalesce(p_workflow,'')));
 v_s text:=upper(trim(coalesce(p_source,'HANDHELD')));
 v_g text:=regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g');
 v_q integer:=greatest(coalesce(p_pending_quantity,1),1);
 v_reason text:=upper(trim(coalesce(p_review_reason,'UNKNOWN_GTIN')));
 v_worker text; v_id uuid; v_time timestamptz;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),true,'save_pharmacy_needs_review',NULL);

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 if v_w not in ('RECEIVING','EXPIRY') or v_g='' then raise exception 'Invalid review item'; end if;
 if v_s not in ('HANDHELD','PC') then raise exception 'Invalid source'; end if;
 if v_reason not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason'; end if;
 if v_w='EXPIRY' then
   if p_expiry_month not between 1 and 12 or p_expiry_year not between 2020 and 2200 then raise exception 'Select expiry date'; end if;
   select worker_name into v_worker from public.pharmflow_expiry_workers_v1
   where id=p_worker_id and pharmacy_id=p_pharmacy_id and active=true;
   if v_worker is null then raise exception 'Select an active worker'; end if;
 end if;
 if v_w='RECEIVING' then
   select id into v_id from public.pharmflow_needs_review_v1
   where pharmacy_id=p_pharmacy_id and workflow='RECEIVING' and status='PENDING'
     and gtin=v_g and coalesce(order_id,'')=coalesce(p_order_id,'')
     and coalesce(review_reason,'UNKNOWN_GTIN')=v_reason
   order by created_at desc limit 1 for update;
   if v_id is not null then
     update public.pharmflow_needs_review_v1
       set pending_quantity=pharmflow_needs_review_v1.pending_quantity+v_q,updated_at=now()
     where id=v_id
     returning pharmflow_needs_review_v1.pending_quantity,pharmflow_needs_review_v1.created_at into v_q,v_time;
     return query select v_id,v_q,v_time; return;
   end if;
 end if;
 insert into public.pharmflow_needs_review_v1(
   pharmacy_id,workflow,gtin,raw_barcode,order_id,order_name,pending_quantity,
   expiry_month,expiry_year,worker_id,captured_by_name,device_id,source,created_by,review_reason)
 values(p_pharmacy_id,v_w,v_g,nullif(p_raw_barcode,''),nullif(p_order_id,''),nullif(p_order_name,''),v_q,
   p_expiry_month,p_expiry_year,p_worker_id,v_worker,nullif(p_device_id,''),v_s,auth.uid(),v_reason)
 returning id,pharmflow_needs_review_v1.created_at into v_id,v_time;
 return query select v_id,v_q,v_time;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_pharmflow_expiry_capture_v3(p_pharmacy_id uuid, p_operation_id uuid, p_capture jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
 v_op pharmflow_expiry_private.operations%rowtype;v_kind text;v_identifier text;v_facts jsonb;v_month integer;v_year integer;v_qty integer;v_worker uuid;v_worker_name text;
 v_product text;v_expiry text;v_ack record;v_review uuid;v_result jsonb;v_date date;v_key text;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmflow_expiry_capture_v3',p_operation_id::text);

 perform pharmflow_expiry_private.valid_auth_session();
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_operation_id is null or jsonb_typeof(p_capture) is distinct from 'object' then raise exception 'Operation and capture required';end if;
 perform public.reserve_pharmflow_expiry_capture_v1(p_pharmacy_id,p_operation_id);
 select * into v_op from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id for update;
 if v_op.status='COMMITTED' then
  if v_op.payload is distinct from p_capture then raise exception 'Operation payload conflict';end if;return v_op.result;
 end if;
 if nullif(p_capture->>'worker_id','') is null then raise exception 'Select an active Operator before saving';end if;
 if not (p_capture ?& array['kind','identifier_display','raw_scan','scan_format','quantity','expiry_month','expiry_year','worker_id','device_id','source','batch_no','sample_serial']) then raise exception 'Complete capture fields required';end if;
 if jsonb_typeof(p_capture->'raw_scan') is distinct from 'string' or jsonb_typeof(p_capture->'identifier_display') is distinct from 'string' or jsonb_typeof(p_capture->'device_id') is distinct from 'string' or btrim(p_capture->>'device_id')='' then raise exception 'Exact scan, identifier and device required';end if;
 v_facts:=pharmflow_expiry_private.scan_facts(p_capture->>'raw_scan',p_capture->>'scan_format');v_identifier:=p_capture->>'identifier_display';
 if v_identifier='' or v_identifier is distinct from v_facts->>'identifier' then raise exception 'Identifier does not match raw scan';end if;
 if jsonb_typeof(p_capture->'quantity') is distinct from 'number' or (p_capture->>'quantity') !~ '^[1-9][0-9]*$' or jsonb_typeof(p_capture->'expiry_month') is distinct from 'number' or jsonb_typeof(p_capture->'expiry_year') is distinct from 'number' then raise exception 'Integer quantity and expiry required';end if;
 v_qty:=(p_capture->>'quantity')::integer;v_month:=(p_capture->>'expiry_month')::integer;v_year:=(p_capture->>'expiry_year')::integer;
 if v_month not between 1 and 12 or v_year not between 2020 and 2200 then raise exception 'Invalid expiry';end if;
 if jsonb_typeof(p_capture->'batch_no') not in ('string','null') or jsonb_typeof(p_capture->'sample_serial') not in ('string','null') then raise exception 'Invalid optional batch or serial';end if;
 if not (v_facts ? '10') and pharmflow_expiry_private.batch_is_scanner_payload(p_capture->>'batch_no') then raise exception 'Use Scan Barcode, not Batch';end if;
 if v_facts ? '10' and coalesce(p_capture->>'batch_no','')<>v_facts->>'10' then raise exception 'GS1 batch mismatch';end if;
 if v_facts ? '21' and coalesce(p_capture->>'sample_serial','')<>v_facts->>'21' then raise exception 'GS1 serial mismatch';end if;
 if v_facts ? '17' then
  if (substr(v_facts->>'17',3,2))::integer<>v_month or 2000+(left(v_facts->>'17',2))::integer<>v_year then raise exception 'GS1 expiry mismatch';end if;
  if right(v_facts->>'17',2)<>'00' then v_date:=make_date(v_year,v_month,(right(v_facts->>'17',2))::integer);end if;
 end if;
 if p_capture ? 'identification_note' and (jsonb_typeof(p_capture->'identification_note') not in ('string','null') or length(p_capture->>'identification_note')>250) then raise exception 'Invalid identification note';end if;
 v_kind:=p_capture->>'kind';if v_kind is null or v_kind not in ('KNOWN','UNKNOWN') or p_capture->>'source' is null or p_capture->>'source' not in ('HANDHELD','PC') then raise exception 'Invalid capture kind or source';end if;
 v_worker:=(p_capture->>'worker_id')::uuid;
 if v_worker is not null then
  select worker_name into v_worker_name from public.pharmflow_expiry_workers_v1 where pharmacy_id=p_pharmacy_id and id=v_worker and active=true;
  if v_worker_name is null then raise exception 'Active pharmacy worker required';end if;
 elsif p_capture->>'source'='HANDHELD' or v_kind='UNKNOWN' then raise exception 'Worker required';else v_worker_name:='Desktop';end if;
 update pharmflow_expiry_private.operations set status='COMMITTING',payload=p_capture where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if v_kind='KNOWN' then
  if exists(select 1 from pharmflow_expiry_private.photos where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and deleted_at is null) then raise exception 'Known captures cannot orphan review photos';end if;
  if jsonb_typeof(p_capture->'item_code') is distinct from 'string' or jsonb_typeof(p_capture->'item_name') is distinct from 'string' or btrim(p_capture->>'item_code')='' or btrim(p_capture->>'item_name')='' then raise exception 'Known item fields required';end if;
  v_key:=p_pharmacy_id::text||'/item/'||btrim(p_capture->>'item_code')||'/'||upper(btrim(coalesce(p_capture->>'batch_no','')))||'/'||v_year::text||'/'||v_month::text;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_ack from pharmflow_expiry_private.save_known_core(p_pharmacy_id,p_capture->>'item_code',p_capture->>'item_name',v_identifier,p_capture->>'category',v_qty,v_month,v_year,v_worker,p_capture->>'batch_no',p_capture->>'sample_serial',p_capture->>'device_id',p_capture->>'source','CAPTURE');
  if v_ack.state_id is null or v_ack.event_id is null then raise exception 'Save acknowledgement required';end if;
  v_result:=jsonb_build_object('operation_id',p_operation_id,'state_id',v_ack.state_id,'event_id',v_ack.event_id);
 else
  v_product:=coalesce(p_capture->>'product_photo_path',p_capture->>'evidence_photo_path');v_expiry:=p_capture->>'expiry_photo_path';
  if (v_product is null and v_expiry is not null) or (v_expiry is not null and v_product=v_expiry) then raise exception 'One evidence photo is required; legacy two-photo submissions remain supported';end if;
  -- The upload path remains in the existing private immutable Storage namespace.
  -- New submissions use the approved product-role slot for their single evidence image.
  if (v_product is not null and not exists(select 1 from pharmflow_expiry_private.photos p join storage.objects o on o.name=p.path and o.bucket_id='pharmflow-needs-review' where p.path=v_product and p.pharmacy_id=p_pharmacy_id and p.operation_id=p_operation_id and p.role='product' and p.created_by=auth.uid() and p.deleted_at is null))
   or (v_expiry is not null and not exists(select 1 from pharmflow_expiry_private.photos p join storage.objects o on o.name=p.path and o.bucket_id='pharmflow-needs-review' where p.path=v_expiry and p.pharmacy_id=p_pharmacy_id and p.operation_id=p_operation_id and p.role='expiry' and p.created_by=auth.uid() and p.deleted_at is null)) then raise exception 'Uploaded role-correct evidence photo required';end if;
  insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,gtin,identifier_display,identifier_key,raw_barcode,pending_quantity,review_reason,source,device_id,created_by,operation_id)
  values(p_pharmacy_id,'EXPIRY',v_identifier,v_identifier,public.pharmflow_identifier_key_v2(v_identifier),p_capture->>'raw_scan',v_qty,'UNKNOWN_GTIN',p_capture->>'source',p_capture->>'device_id',auth.uid(),p_operation_id::text) returning id into v_review;
  insert into pharmflow_expiry_private.review_details(review_id,pharmacy_id,operation_id,worker_name,product_photo_path,expiry_photo_path)
  values(v_review,p_pharmacy_id,p_operation_id,v_worker_name,v_product,v_expiry);
  v_result:=jsonb_build_object('operation_id',p_operation_id,'review_id',v_review,'quantity',v_qty,'product_photo_path',v_product,'expiry_photo_path',v_expiry,'evidence_photo_path',v_product);
 end if;
 update pharmflow_expiry_private.operations set status='COMMITTED',result=v_result where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;return v_result;
end $function$
;
CREATE OR REPLACE FUNCTION public.can_delete_pharmflow_expiry_staged_photo_v1(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM pharmflow_auth_private.require_access(split_part(p_name,'/',1)::uuid,'EXPIRY',true,'can_delete_pharmflow_expiry_staged_photo_v1',NULL);
RETURN (select auth.uid() is not null and exists(select 1 from pharmflow_expiry_private.photos p join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id) where p.path=p_name and p.created_by=auth.uid() and o.created_by=auth.uid() and o.status='RESERVED' and public.is_pharmacy_member(p.pharmacy_id) is true));
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reserve_pharmflow_expiry_capture_v1(p_pharmacy_id uuid, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_row pharmflow_expiry_private.operations%rowtype;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'reserve_pharmflow_expiry_capture_v1',p_operation_id::text);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_operation_id is null then raise exception 'Operation required';end if;
 insert into pharmflow_expiry_private.operations(pharmacy_id,operation_id,created_by) values(p_pharmacy_id,p_operation_id,auth.uid()) on conflict do nothing;
 select * into v_row from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id for update;
 if v_row.created_by<>auth.uid() then raise exception 'Operation owner conflict';end if;
 return jsonb_build_object('operation_id',p_operation_id,'status',v_row.status,'result',v_row.result);
end $function$
;
CREATE OR REPLACE FUNCTION public.authorize_pharmflow_expiry_photo_cleanup_v1(p_pharmacy_id uuid, p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare d pharmflow_expiry_private.review_details%rowtype;v_paths jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'authorize_pharmflow_expiry_photo_cleanup_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_admin(p_pharmacy_id) is not true then raise exception 'Pharmacy admin required';end if;
 select x.* into d from pharmflow_expiry_private.review_details x join public.pharmflow_needs_review_v2 r on r.id=x.review_id and r.pharmacy_id=x.pharmacy_id where x.review_id=p_review_id and x.pharmacy_id=p_pharmacy_id and r.workflow='EXPIRY' and r.status='RESOLVED';
 if not found then raise exception 'Successfully resolved Expiry review required';end if;
 perform 1 from pharmflow_expiry_private.operations where pharmacy_id=d.pharmacy_id and operation_id=d.operation_id for update;
 update pharmflow_expiry_private.photos set cleanup_by=auth.uid(),cleanup_until=now()+interval '10 minutes' where pharmacy_id=d.pharmacy_id and operation_id=d.operation_id and deleted_at is null;
 select coalesce(jsonb_agg(path),'[]'::jsonb) into v_paths from pharmflow_expiry_private.photos where pharmacy_id=d.pharmacy_id and operation_id=d.operation_id and deleted_at is null;
 return jsonb_build_object('bucket','pharmflow-needs-review','paths',v_paths,'expires_at',now()+interval '10 minutes');
end $function$
;
CREATE OR REPLACE FUNCTION public.get_pharmflow_workspace_generation(p_pharmacy_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_generation bigint;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_workspace_generation');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation)
    values(p_pharmacy_id,0)
    on conflict(pharmacy_id) do nothing;

    select generation
      into v_generation
      from public.pharmflow_workspace_generation_v1
     where pharmacy_id=p_pharmacy_id;

    return coalesce(v_generation,0);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text, p_resolution_type text, p_resolution_transaction_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_type text := upper(trim(coalesce(p_resolution_type,'')));
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'resolve_pharmflow_needs_review_v2',NULL);

    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;
  perform 1 from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;


    if v_type not in ('LINK_ORDER_ITEM','ADD_UNORDERED') then
        raise exception 'Invalid resolution type';
    end if;

    update public.pharmflow_needs_review_v2
       set status = 'RESOLVED',
           resolved_item_code = trim(coalesce(p_item_code,'')),
           resolved_item_name = trim(coalesce(p_item_name,'')),
           resolution_type = v_type,
           resolution_transaction_id = nullif(trim(coalesce(p_resolution_transaction_id,'')),''),
           resolved_by = auth.uid(),
           resolved_at = now(),
           updated_at = now()
     where id = p_review_id
       and pharmacy_id = p_pharmacy_id
       and status = 'PENDING';

    return found;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_pharmflow_active_order_manifest_v3(p_pharmacy_id uuid)
 RETURNS TABLE(manifest jsonb, revision bigint, updated_at timestamp with time zone, order_files integer, order_items integer, workspace_generation bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_active_order_manifest_v3',NULL);

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
    return query select m.manifest,m.revision,m.updated_at,
      jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
      jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),m.workspace_generation
      from public.pharmflow_active_order_manifest_v1 m where m.pharmacy_id=p_pharmacy_id;
end; $function$
;
CREATE OR REPLACE FUNCTION public.get_pharmflow_active_order_manifest_meta_v1(p_pharmacy_id uuid)
 RETURNS TABLE(manifest_present boolean, revision bigint, updated_at timestamp with time zone, order_files integer, order_items integer, workspace_generation bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_active_order_manifest_meta_v1',NULL);

    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select true,
           m.revision,
           m.updated_at,
           jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
           jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),
           m.workspace_generation
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_pharmflow_cloud_workspace(p_pharmacy_id uuid)
 RETURNS TABLE(workspace jsonb, updated_at timestamp with time zone, device_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_cloud_workspace',NULL);

    if not public.pharmflow_can_access_pharmacy(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
    return query select w.workspace,w.updated_at,w.device_id from public.pharmflow_cloud_workspaces w where w.pharmacy_id=p_pharmacy_id;
end;$function$
;
CREATE OR REPLACE FUNCTION public.save_pharmflow_expiry_session_capture_v1(p_pharmacy_id uuid, p_session_id uuid, p_operation_id uuid, p_capture jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare s pharmflow_expiry_private.active_sessions_v1%rowtype;r jsonb;c pharmflow_expiry_private.session_captures_v1%rowtype;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmflow_expiry_session_capture_v1',p_operation_id::text);

 if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id for update;
 if not found or s.pharmacy_id<>p_pharmacy_id or s.created_by<>auth.uid() or s.device_id is distinct from p_capture->>'device_id' then raise exception 'Session scope mismatch';end if;
 select * into c from pharmflow_expiry_private.session_captures_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if found then
  if c.session_id<>p_session_id then raise exception 'Operation belongs to another session';end if;
  -- Read-only acknowledgement retry remains possible after closure.
  return public.save_pharmflow_expiry_capture_v3(p_pharmacy_id,p_operation_id,p_capture);
 end if;
 if s.closed_at is not null then raise exception 'Session closed';end if;
 if p_capture->>'source' is distinct from 'HANDHELD' then raise exception 'Handheld capture required';end if;
 perform public.reserve_pharmflow_expiry_capture_v1(p_pharmacy_id,p_operation_id);
 perform 1 from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and status='COMMITTED';
 if found then raise exception 'Historical operation cannot join a session';end if;
 r:=public.save_pharmflow_expiry_capture_v3(p_pharmacy_id,p_operation_id,p_capture);
 insert into pharmflow_expiry_private.session_captures_v1(pharmacy_id,operation_id,session_id,quantity)
 values(p_pharmacy_id,p_operation_id,p_session_id,(p_capture->>'quantity')::integer);
 return r;
end $function$
;
CREATE OR REPLACE FUNCTION public.list_pharmacy_expiry_captures(p_pharmacy_id uuid, p_expiry_year integer DEFAULT NULL::integer, p_expiry_months integer[] DEFAULT NULL::integer[], p_categories text[] DEFAULT NULL::text[], p_worker_ids uuid[] DEFAULT NULL::uuid[], p_search text DEFAULT NULL::text)
 RETURNS TABLE(capture_id uuid, item_code text, item_name text, gtin text, category text, quantity integer, expiry_month integer, expiry_year integer, worker_id uuid, captured_by_name text, captured_at timestamp with time zone, device_id text, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmacy_expiry_captures',NULL);

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select
        c.id,
        c.item_code,
        c.item_name,
        c.gtin,
        coalesce(c.category,''),
        c.quantity,
        c.expiry_month,
        c.expiry_year,
        c.worker_id,
        c.captured_by_name,
        c.captured_at,
        coalesce(c.device_id,''),
        c.source
    from public.pharmflow_expiry_captures_v1 c
    where c.pharmacy_id = p_pharmacy_id
      and (p_expiry_year is null or c.expiry_year = p_expiry_year)
      and (p_expiry_months is null or c.expiry_month = any(p_expiry_months))
      and (p_categories is null or coalesce(c.category,'') = any(p_categories))
      and (p_worker_ids is null or c.worker_id = any(p_worker_ids))
      and (
          nullif(trim(coalesce(p_search,'')),'') is null
          or lower(c.item_name) like '%' || lower(trim(p_search)) || '%'
          or lower(c.item_code) like '%' || lower(trim(p_search)) || '%'
          or lower(c.gtin) like '%' || lower(trim(p_search)) || '%'
      )
    order by c.expiry_year, c.expiry_month, lower(c.item_name), c.captured_at desc;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_pharmacy_expiry_current_state_v1(p_pharmacy_id uuid, p_include_cleared boolean DEFAULT false, p_search text DEFAULT NULL::text)
 RETURNS TABLE(state_id uuid, item_code text, item_name text, identifier_display text, category text, batch_no text, sample_serial text, expiry_month integer, expiry_year integer, verified_quantity integer, worker_id uuid, verified_by_name text, last_verified_at timestamp with time zone, source text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmacy_expiry_current_state_v1',NULL);

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select s.id,s.item_code,s.item_name,s.identifier_display,coalesce(s.category,''),
           s.batch_no,s.sample_serial,s.expiry_month,s.expiry_year,s.verified_quantity,
           s.worker_id,s.verified_by_name,s.last_verified_at,s.source,s.status
      from public.pharmflow_expiry_current_state_v1 s
     where s.pharmacy_id=p_pharmacy_id
       and (p_include_cleared or s.status='ACTIVE')
       and (
           nullif(btrim(coalesce(p_search,'')),'') is null
           or lower(s.item_name) like '%'||lower(btrim(p_search))||'%'
           or lower(s.item_code) like '%'||lower(btrim(p_search))||'%'
           or lower(s.identifier_display) like '%'||lower(btrim(p_search))||'%'
           or lower(coalesce(s.batch_no,'')) like '%'||lower(btrim(p_search))||'%'
       )
     order by s.expiry_year,s.expiry_month,lower(s.item_name),s.last_verified_at desc;
end
$function$
;
CREATE OR REPLACE FUNCTION public.list_pharmflow_global_item_identifiers_v2(p_item_code text)
 RETURNS TABLE(identifier_id uuid, identifier_display text, identifier_key text, mapping_revision bigint, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'list_pharmflow_global_item_identifiers_v2',NULL);

 if auth.uid() is null then raise exception 'Authentication required'; end if;
 return query select i.id,i.identifier_display,i.identifier_key,i.mapping_revision,i.created_at,i.updated_at from public.pharmflow_global_item_identifiers_v2 i where i.item_code = btrim(coalesce(p_item_code,'')) order by i.created_at asc,i.identifier_key asc;
end $function$
;
CREATE OR REPLACE FUNCTION public.list_pharmflow_orders(p_pharmacy_id uuid)
 RETURNS SETOF pharmflow_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_orders',NULL);
RETURN QUERY select *
  from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and auth.uid() is not null
    and public.is_pharmacy_admin(p_pharmacy_id)
  order by uploaded_at desc;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_pharmflow_identifier_v2(p_pharmacy_id uuid, p_identifier_display text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_key text := public.pharmflow_identifier_key_v2(p_identifier_display);
  v_pharmacy_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_global_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_item public.pharmflow_global_items_v2%rowtype;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',false,'resolve_pharmflow_identifier_v2',NULL);

  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
    raise exception 'Pharmacy access required';
  end if;
  if v_key = '' then
    raise exception 'Identifier is required';
  end if;

  select * into v_pharmacy_mapping
    from public.pharmflow_pharmacy_gtin_v1
   where pharmacy_id = p_pharmacy_id
     and identifier_key = v_key;
  if v_pharmacy_mapping.id is not null then
    select * into v_item from public.pharmflow_global_items_v2
     where item_code = v_pharmacy_mapping.item_code;
    return jsonb_build_object(
      'found', true, 'source', 'PHARMACY_V2', 'mappingScope', 'PHARMACY',
      'identifierId', v_pharmacy_mapping.id,
      'mappingRevision', v_pharmacy_mapping.mapping_revision,
      'identifierDisplay', v_pharmacy_mapping.identifier_display,
      'identifierKey', v_pharmacy_mapping.identifier_key,
      'itemCode', v_pharmacy_mapping.item_code,
      'itemName', v_pharmacy_mapping.item_name,
      'groupName', v_item.group_name
    );
  end if;

  select * into v_global_mapping
    from public.pharmflow_global_item_identifiers_v2
   where identifier_key = v_key;
  if v_global_mapping.id is null then
    return jsonb_build_object('found', false, 'identifierDisplay', btrim(p_identifier_display), 'identifierKey', v_key);
  end if;
  select * into v_item from public.pharmflow_global_items_v2 where item_code = v_global_mapping.item_code;
  return jsonb_build_object(
    'found', true, 'source', 'GLOBAL_V2', 'mappingScope', 'GLOBAL',
    'identifierId', v_global_mapping.id, 'mappingRevision', v_global_mapping.mapping_revision,
    'identifierDisplay', v_global_mapping.identifier_display, 'identifierKey', v_global_mapping.identifier_key,
    'itemCode', v_item.item_code, 'itemName', v_item.item_name,
    'groupName', v_item.group_name, 'category', v_item.category, 'subCategory', v_item.sub_category
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_pharmflow_finalized_archives(p_pharmacy_id uuid)
 RETURNS TABLE(archive_id text, order_numbers text[], closed_at timestamp with time zone, archive_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_finalized_archives',NULL);
RETURN QUERY select
        a.archive_id,
        a.order_numbers,
        a.closed_at,
        a.archive_payload
    from public.pharmflow_finalized_archives_v1 a
    where a.pharmacy_id=p_pharmacy_id
      and public.is_pharmacy_member(p_pharmacy_id)
    order by a.closed_at desc;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.search_pharmflow_global_items_v3(p_query text, p_limit integer DEFAULT 50)
 RETURNS TABLE(item_code text, item_name text, group_name text, category text, sub_category text, identifier_display text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'search_pharmflow_global_items_v3',NULL);

  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return query
  select i.item_code,i.item_name,i.group_name,i.category,i.sub_category,id.identifier_display
  from public.pharmflow_global_items_v2 i
  left join lateral (
    select x.identifier_display
    from public.pharmflow_global_item_identifiers_v2 x
    where x.item_code=i.item_code
    order by (x.identifier_display ~ '^[0-9]{8,14}$') desc,
             x.mapping_revision desc nulls last,x.updated_at desc nulls last,x.created_at desc nulls last
    limit 1
  ) id on true
  where btrim(coalesce(p_query,''))=''
     or i.item_code ilike '%'||btrim(p_query)||'%'
     or i.item_name ilike '%'||btrim(p_query)||'%'
     or exists(select 1 from public.pharmflow_global_item_identifiers_v2 sx where sx.item_code=i.item_code and sx.identifier_display ilike '%'||btrim(p_query)||'%')
  order by case when upper(i.item_code)=upper(btrim(p_query)) then 0 when upper(i.item_name)=upper(btrim(p_query)) then 1 when i.item_code ilike btrim(p_query)||'%' then 2 when i.item_name ilike btrim(p_query)||'%' then 3 else 4 end,i.item_name,i.item_code
  limit least(greatest(coalesce(p_limit,50),1),100);
end; $function$
;
CREATE OR REPLACE FUNCTION public.get_global_master_gtin_meta()
 RETURNS TABLE(version text, source_file text, item_count integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'get_global_master_gtin_meta',NULL);

    if auth.uid() is null then raise exception 'Authentication required'; end if;
    return query
    select m.version,m.source_file,m.item_count,m.updated_at
    from public.pharmflow_global_gtin_meta_v1 m where m.singleton=true;
end $function$
;
CREATE OR REPLACE FUNCTION public.list_pharmflow_expiry_capture_receipts_v1(p_pharmacy_id uuid, p_device_id text, p_worker_id uuid, p_operation_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_rows jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmflow_expiry_capture_receipts_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then
  raise exception 'Pharmacy access required';
 end if;
 if nullif(btrim(p_device_id),'') is null or p_worker_id is null or p_operation_ids is null or cardinality(p_operation_ids)>15 then
  raise exception 'Device, operator and at most 15 operation IDs required';
 end if;
 select coalesce(jsonb_agg(q.receipt order by q.captured_at desc,q.operation_id desc),'[]'::jsonb)
 into v_rows from (
  select o.operation_id,coalesce(e.occurred_at,n.created_at,o.created_at) as captured_at,
   o.payload || jsonb_build_object(
    'operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,
    'acknowledgement',o.result,'captured_at',coalesce(e.occurred_at,n.created_at,o.created_at),
    'operator_name',coalesce(e.verified_by_name,d.worker_name,w.worker_name),
    'status',case when o.payload->>'kind'='UNKNOWN' then coalesce(n.status::text,'PENDING') else 'SAVED' end
   ) as receipt
  from pharmflow_expiry_private.operations o
  left join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>'event_id')::uuid and e.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_needs_review_v2 n on n.id=(o.result->>'review_id')::uuid and n.pharmacy_id=o.pharmacy_id
  left join pharmflow_expiry_private.review_details d on d.review_id=n.id and d.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_expiry_workers_v1 w on w.id=p_worker_id and w.pharmacy_id=o.pharmacy_id
  where o.pharmacy_id=p_pharmacy_id and o.created_by=auth.uid() and o.status='COMMITTED'
   and o.operation_id=any(p_operation_ids) and o.payload->>'source'='HANDHELD'
   and o.payload->>'device_id'=p_device_id and o.payload->>'worker_id'=p_worker_id::text
 ) q;
 return v_rows;
end $function$
;
CREATE OR REPLACE FUNCTION public.create_pharmflow_global_item_v2(p_operation_id uuid, p_item_code text, p_item_name text, p_group_name text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_sub_category text DEFAULT NULL::text, p_identifier_display text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item_code text := btrim(coalesce(p_item_code, ''));
  v_item_name text := btrim(coalesce(p_item_name, ''));
  v_identifier_display text := nullif(btrim(coalesce(p_identifier_display, '')), '');
  v_identifier_key text;
  v_group_name text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;
begin
PERFORM pharmflow_auth_private.require_access(NULL,'GLOBAL',true,'create_pharmflow_global_item_v2',p_operation_id::text);

  if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then
    raise exception 'Global Identifier write permission required';
  end if;
  if p_operation_id is null or v_item_code = '' or v_item_name = ''
     or v_identifier_display is null or v_reason = '' then
    raise exception 'Operation ID, Item Code, Item Name, identifier and reason are required';
  end if;

  v_identifier_key := public.pharmflow_identifier_key_v2(v_identifier_display);
  perform pg_advisory_xact_lock(hashtextextended(v_identifier_key,1152));
  perform pg_advisory_xact_lock(hashtextextended(v_identifier_key, 1153));

  -- A retry of a completed operation is not a new item creation. Keep its
  -- idempotent response even when the caller is an older client.
  select * into v_audit
    from public.pharmflow_identifier_mapping_audit_v1
   where operation_id = p_operation_id;
  if v_audit.id is not null then
    if v_audit.action = 'ADD'
       and v_audit.new_item_code = v_item_code
       and v_audit.identifier_key = v_identifier_key
       and exists (select 1 from public.pharmflow_global_items_v2 where item_code = v_item_code) then
      select * into v_mapping from public.pharmflow_global_item_identifiers_v2
       where identifier_key = v_identifier_key;
      if v_mapping.id is not null and v_mapping.item_code = v_item_code then
        return jsonb_build_object('success',true,'idempotent',true,'itemCode',v_item_code,
          'itemName',v_item_name,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision);
      end if;
    end if;
    raise exception 'Operation ID was already used for a different mapping operation';
  end if;

  if exists (select 1 from public.pharmflow_global_items_v2 where item_code = v_item_code) then
    raise exception 'Global Item Code already exists';
  end if;
  select * into v_mapping from public.pharmflow_global_item_identifiers_v2
   where identifier_key = v_identifier_key for update;
  if v_mapping.id is not null then
    raise exception 'Identifier is already mapped to another Item Code';
  end if;

  v_group_name := public.pharmflow_normalize_main_group_v1(p_group_name);
  if v_group_name is null then
    raise exception 'A valid approved Group is required to create a Global Item';
  end if;

  insert into public.pharmflow_global_items_v2(item_code,item_name,group_name,category,sub_category,created_by,updated_by)
  values(v_item_code,v_item_name,v_group_name,nullif(btrim(coalesce(p_category,'')),''),nullif(btrim(coalesce(p_sub_category,'')),''),auth.uid(),auth.uid());

  insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by)
  values(v_item_code,v_identifier_display,v_identifier_key,auth.uid(),auth.uid()) returning * into v_mapping;
  insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
  values(p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_item_code,v_reason,auth.uid());
  return jsonb_build_object('success',true,'idempotent',false,'itemCode',v_item_code,
    'itemName',v_item_name,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision);
end $function$
;
CREATE OR REPLACE FUNCTION public.search_pharmflow_global_items_v2(p_query text, p_limit integer DEFAULT 50)
 RETURNS TABLE(item_code text, item_name text, group_name text, category text, sub_category text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'search_pharmflow_global_items_v2',NULL);
RETURN QUERY select i.item_code,i.item_name,i.group_name,i.category,i.sub_category
from public.pharmflow_global_items_v2 i
where btrim(coalesce(p_query,''))='' or i.item_code ilike '%'||btrim(p_query)||'%' or i.item_name ilike '%'||btrim(p_query)||'%'
order by case when upper(i.item_code)=upper(btrim(p_query)) then 0 when upper(i.item_name)=upper(btrim(p_query)) then 1 when i.item_code ilike btrim(p_query)||'%' then 2 when i.item_name ilike btrim(p_query)||'%' then 3 else 4 end,i.item_name,i.item_code
limit least(greatest(coalesce(p_limit,50),1),100);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.count_pharmflow_expiry_reviews_v1(p_pharmacy_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_count bigint;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'count_pharmflow_expiry_reviews_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select count(*) into v_count from public.pharmflow_needs_review_v2 where pharmacy_id=p_pharmacy_id and workflow='EXPIRY' and status='PENDING';return v_count;
end $function$
;
CREATE OR REPLACE FUNCTION public.delete_pharmflow_expiry_review_v1(p_pharmacy_id uuid, p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_row public.pharmflow_needs_review_v2%rowtype;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'delete_pharmflow_expiry_review_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or p_review_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select * into v_row from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY' for update;
 if not found then raise exception 'Expiry review not found in authorized pharmacy';end if;
 if v_row.status='DELETED' then return jsonb_build_object('success',true,'review_id',p_review_id,'status','DELETED','already_deleted',true);end if;
 if v_row.status<>'PENDING' then raise exception 'Only pending Expiry review cases may be deleted';end if;
 update public.pharmflow_needs_review_v2 set status='DELETED',deleted_by=auth.uid(),deleted_at=clock_timestamp(),updated_at=clock_timestamp()
 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY' and status='PENDING';
 if not found then raise exception 'Expiry review changed; retry safely';end if;
 return jsonb_build_object('success',true,'review_id',p_review_id,'status','DELETED','already_deleted',false,'photo_cleanup_queued',true);
end $function$
;
CREATE OR REPLACE FUNCTION public.delete_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_review_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'delete_pharmflow_needs_review_v2',NULL);

    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;
  perform 1 from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;


    update public.pharmflow_needs_review_v2
       set status='DELETED',deleted_by=auth.uid(),deleted_at=now(),
           updated_at=now()
     where id=p_review_id
       and pharmacy_id=p_pharmacy_id
       and status='PENDING';

    return found;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_global_master_gtin_page_v2(p_offset integer DEFAULT 0, p_limit integer DEFAULT 1000)
 RETURNS TABLE(item_code text, gtin text, item_name text, group_name text, category text, sub_category text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'get_global_master_gtin_page_v2',NULL);
 if auth.uid() is null then raise exception 'Authentication required';end if;return query select g.item_code,g.gtin,g.item_name,g.group_name,g.category,g.sub_category from public.pharmflow_global_gtin_v1 g order by g.id offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,1000),1),2000);end $function$
;
CREATE OR REPLACE FUNCTION public.set_pharmflow_needs_review_qty_v2(p_pharmacy_id uuid, p_review_id uuid, p_pending_quantity integer)
 RETURNS TABLE(review_id uuid, pending_quantity integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_qty integer := greatest(coalesce(p_pending_quantity,1),1);
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'set_pharmflow_needs_review_qty_v2',NULL);

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
  perform 1 from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;


    return query
    update public.pharmflow_needs_review_v2 r
       set pending_quantity = v_qty,
           updated_at = now()
     where r.id = p_review_id
       and r.pharmacy_id = p_pharmacy_id
       and r.status = 'PENDING'
    returning r.id, r.pending_quantity, r.updated_at;

    if not found then
        raise exception 'Pending review item not found';
    end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_pharmflow_expiry_review_v1(p_pharmacy_id uuid, p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'get_pharmflow_expiry_review_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select o.payload||jsonb_build_object('review_id',r.id,'pharmacy_id',r.pharmacy_id,'identifier_key',r.identifier_key,'status',r.status,'created_by',r.created_by,'created_at',r.created_at,'review_reason',r.review_reason,'resolved_by',r.resolved_by,'resolved_item_code',r.resolved_item_code,'resolved_item_name',r.resolved_item_name,'resolved_at',r.resolved_at,'resolution_transaction_id',r.resolution_transaction_id,'worker_name',d.worker_name,'product_photo_path',d.product_photo_path,'expiry_photo_path',d.expiry_photo_path,'evidence_photo_path',coalesce(d.product_photo_path,d.expiry_photo_path),'product_photo_deleted',p.deleted_at is not null,'expiry_photo_deleted',e.deleted_at is not null,'evidence_photo_deleted',coalesce(p.deleted_at,e.deleted_at) is not null)
 into v_result from public.pharmflow_needs_review_v2 r join pharmflow_expiry_private.review_details d on d.review_id=r.id and d.pharmacy_id=r.pharmacy_id join pharmflow_expiry_private.operations o on o.pharmacy_id=d.pharmacy_id and o.operation_id=d.operation_id left join pharmflow_expiry_private.photos p on p.path=d.product_photo_path left join pharmflow_expiry_private.photos e on e.path=d.expiry_photo_path where r.id=p_review_id and r.pharmacy_id=p_pharmacy_id and r.workflow='EXPIRY';return v_result;
end $function$
;
CREATE OR REPLACE FUNCTION public.add_pharmflow_global_identifier_v2(p_operation_id uuid, p_identifier_display text, p_item_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_display text:=btrim(coalesce(p_identifier_display,''));
 v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
 v_item_code text:=btrim(coalesce(p_item_code,''));
 v_reason text:=btrim(coalesce(p_reason,''));
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
 v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;
begin
PERFORM pharmflow_auth_private.require_access(NULL,'GLOBAL',true,'add_pharmflow_global_identifier_v2',p_operation_id::text);

 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required'; end if;
 if p_operation_id is null or v_key='' or v_item_code='' or v_reason='' then raise exception 'Operation, identifier, item and reason are required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
 perform pg_advisory_xact_lock(hashtextextended(v_key,1153));
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where identifier_key=v_key for update;
 if v_mapping.id is not null and v_mapping.item_code<>v_item_code then raise exception 'Identifier is already mapped to another Item Code'; end if;
 if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_item_code) then raise exception 'Global Item Code does not exist'; end if;
 if v_mapping.id is null then
   insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by)
   values(v_item_code,v_display,v_key,auth.uid(),auth.uid()) returning * into v_mapping;
 end if;
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
 values(p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_mapping.item_code,v_reason,auth.uid())
 on conflict(operation_id) do nothing;
 -- PHASE2C1159's signature, authorization, normalized key, mapping write and
 -- audit schema stay canonical. This guard closes its DO NOTHING false-success
 -- case and still permits an exact same-operation retry only.
 select * into v_audit from public.pharmflow_identifier_mapping_audit_v1 where operation_id=p_operation_id for update;
 if not found or v_audit.action is distinct from 'ADD' or v_audit.identifier_id is distinct from v_mapping.id
    or v_audit.identifier_display is distinct from v_mapping.identifier_display or v_audit.identifier_key is distinct from v_mapping.identifier_key
    or v_audit.old_item_code is not null or v_audit.new_item_code is distinct from v_mapping.item_code
    or v_audit.reason is distinct from v_reason or v_audit.performed_by is distinct from auth.uid() then
   raise exception 'Operation ID was already used for a different identifier mapping operation';
 end if;
 return jsonb_build_object('success',true,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'itemCode',v_mapping.item_code);
end $function$
;
CREATE OR REPLACE FUNCTION public.get_pharmflow_expiry_review_contract_v1(p_pharmacy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'get_pharmflow_expiry_review_contract_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if to_regprocedure('public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb)') is null or to_regprocedure('public.get_pharmflow_expiry_review_v1(uuid,uuid)') is null or to_regprocedure('public.list_pharmflow_expiry_reviews_v1(uuid,text,integer,integer)') is null or to_regprocedure('public.count_pharmflow_expiry_reviews_v1(uuid)') is null or to_regprocedure('public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)') is null or to_regprocedure('public.add_pharmflow_global_identifier_v2(uuid,text,text,text)') is null or to_regprocedure('public.delete_pharmflow_expiry_review_v1(uuid,uuid)') is null or to_regprocedure('pharmflow_expiry_private.claim_photo_cleanup_jobs(integer)') is null or to_regprocedure('pharmflow_expiry_private.complete_photo_cleanup_job(uuid,text,uuid)') is null or to_regprocedure('pharmflow_expiry_private.fail_photo_cleanup_job(uuid,uuid,text)') is null or to_regclass('pharmflow_expiry_private.photo_cleanup_jobs') is null then raise exception 'Expiry review contract is incomplete';end if;
 return jsonb_build_object('contract_version','EXPIRY_NEEDS_REVIEW_20261010_V2');
end $function$
;
CREATE OR REPLACE FUNCTION public.list_pharmflow_cloud_transactions_delta_v3(p_pharmacy_id uuid, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_transaction_id text DEFAULT NULL::text, p_limit integer DEFAULT 500)
 RETURNS TABLE(transaction_id text, order_number text, item_code text, item_name text, gtin text, quantity integer, source text, device_id text, occurred_at timestamp with time zone, payload jsonb, sync_created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_cloud_transactions_delta_v3',NULL);

    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select t.transaction_id,t.order_number,t.item_code,t.item_name,t.gtin,
           t.quantity,t.source,t.device_id,t.occurred_at,t.payload,t.created_at
    from public.pharmflow_receiving_transactions_v1 t
    where t.pharmacy_id=p_pharmacy_id
      and (
        p_after_created_at is null
        or t.created_at > p_after_created_at
        or (
          t.created_at = p_after_created_at
          and t.transaction_id > coalesce(p_after_transaction_id,'')
        )
      )
    order by t.created_at asc,t.transaction_id asc
    limit greatest(1,least(coalesce(p_limit,500),2000));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_pharmflow_needs_review_v4(p_pharmacy_id uuid, p_workflow text DEFAULT 'RECEIVING'::text, p_order_number text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, workflow text, session_id text, order_number text, order_name text, gtin text, raw_barcode text, pending_quantity integer, review_reason text, master_item_code_hint text, master_item_name_hint text, photo_path text, source text, device_id text, created_at timestamp with time zone, identifier_display text, work_scope_order_numbers text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),false,'list_pharmflow_needs_review_v4',NULL);

if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
return query select r.id,r.workflow,coalesce(r.session_id,''),coalesce(r.order_number,''),coalesce(r.order_name,''),r.gtin,coalesce(r.raw_barcode,''),r.pending_quantity,r.review_reason,coalesce(r.master_item_code_hint,''),coalesce(r.master_item_name_hint,''),coalesce(r.photo_path,''),r.source,coalesce(r.device_id,''),r.created_at,coalesce(r.identifier_display,r.gtin),coalesce(r.work_scope_order_numbers,case when nullif(btrim(coalesce(r.order_number,'')),'') is null then array[]::text[] else array[r.order_number] end)
from public.pharmflow_needs_review_v2 r where r.pharmacy_id=p_pharmacy_id and r.status='PENDING' and r.workflow=upper(trim(coalesce(p_workflow,'RECEIVING'))) and (nullif(trim(coalesce(p_order_number,'')),'') is null or r.order_number=trim(p_order_number) or trim(p_order_number)=any(coalesce(r.work_scope_order_numbers,array[]::text[]))) order by r.created_at desc;end $function$
;
CREATE OR REPLACE FUNCTION public.save_pharmflow_cloud_workspace(p_pharmacy_id uuid, p_workspace jsonb, p_device_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_cloud_workspace',NULL);

    if not public.pharmflow_can_access_pharmacy(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
    insert into public.pharmflow_cloud_workspaces(pharmacy_id,workspace,updated_at,updated_by,device_id)
    values(p_pharmacy_id,coalesce(p_workspace,'{}'::jsonb),now(),auth.uid(),p_device_id)
    on conflict(pharmacy_id) do update set workspace=excluded.workspace,updated_at=now(),updated_by=auth.uid(),device_id=excluded.device_id;
end;$function$
;
CREATE OR REPLACE FUNCTION public.resolve_pharmflow_expiry_review_v1(p_pharmacy_id uuid, p_review_id uuid, p_operation_id uuid, p_item_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_details pharmflow_expiry_private.review_details%rowtype;
  v_capture jsonb;
  v_item public.pharmflow_global_items_v2%rowtype;
  v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_global_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_audit_mapping_id uuid;
  v_global_mapping_id uuid;
  v_mapping_scope text;
  v_audit public.pharmflow_expiry_review_resolution_audit_v1%rowtype;
  v_identifier text;
  v_key text;
  v_worker uuid;
  v_ack record;
  v_mapping_created boolean := false;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'resolve_pharmflow_expiry_review_v1',p_operation_id::text);
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'resolve_pharmflow_expiry_review_v1',p_operation_id::text);

  if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then
    raise exception 'Pharmacy access required';
  end if;
  if p_review_id is null or p_operation_id is null or nullif(btrim(coalesce(p_item_code,'')),'') is null then
    raise exception 'Review, operation, and selected Global Master item are required';
  end if;

  select * into v_review
    from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY'
   for update;
  if not found then raise exception 'Expiry review case not found in authorized pharmacy'; end if;

  if v_review.status='RESOLVED' then
    select * into v_audit from public.pharmflow_expiry_review_resolution_audit_v1
     where pharmacy_id=p_pharmacy_id and review_id=p_review_id for share;
    if v_review.resolution_transaction_id is distinct from p_operation_id::text
       or v_review.resolved_item_code is distinct from btrim(p_item_code) then
      raise exception 'Expiry review was already resolved under another operation or item';
    end if;
    return jsonb_build_object('success',true,'review_id',p_review_id,'item_code',v_review.resolved_item_code,
      'item_name',v_review.resolved_item_name,'operation_id',p_operation_id::text,'already_resolved',true,
      'state_id',v_audit.expiry_state_id,'event_id',v_audit.expiry_event_id,'scope',v_audit.mapping_scope);
  end if;
  if v_review.status<>'PENDING' then raise exception 'Only pending Expiry review cases may be resolved'; end if;

  select * into v_details from pharmflow_expiry_private.review_details
   where review_id=p_review_id and pharmacy_id=p_pharmacy_id;
  if not found then raise exception 'Expiry review capture details are unavailable'; end if;
  select o.payload into v_capture from pharmflow_expiry_private.operations o
   where o.pharmacy_id=p_pharmacy_id and o.operation_id=v_details.operation_id and o.status='COMMITTED';
  v_capture:=v_capture||coalesce((select c.facts from pharmflow_expiry_private.session_captures_v1 c where c.pharmacy_id=p_pharmacy_id and c.operation_id=v_details.operation_id),'{}'::jsonb);
  if v_capture is null or jsonb_typeof(v_capture)<>'object' then raise exception 'Committed Expiry capture payload is unavailable'; end if;
  if not (v_capture ?& array['quantity','expiry_month','expiry_year','source','device_id','batch_no','sample_serial','worker_id']) then
    raise exception 'Committed Expiry capture payload is incomplete';
  end if;

  select * into v_item from public.pharmflow_global_items_v2 where item_code=btrim(p_item_code);
  if not found then raise exception 'Selected Global Master item does not exist'; end if;
  v_identifier:=coalesce(nullif(btrim(v_review.identifier_display),''),nullif(btrim(v_review.gtin),''));
  v_key:=public.pharmflow_identifier_key_v2(v_identifier);
  if v_key='' then raise exception 'Expiry identifier is invalid'; end if;
  -- Same order in V2 and V1: Global ADD key, Global CREATE key, pharmacy key.
  -- Existing creation helpers keep their own approved lock namespaces.
  perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
  perform pg_advisory_xact_lock(hashtextextended(v_key,1153));
  perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||':'||v_key,1156));

  select * into v_global_mapping from public.pharmflow_global_item_identifiers_v2
   where identifier_key=v_key for share;

  select * into v_mapping from public.pharmflow_pharmacy_gtin_v1
   where pharmacy_id=p_pharmacy_id and identifier_key=v_key for update;
  if v_mapping.id is not null and v_mapping.item_code<>v_item.item_code then
    raise exception 'Identifier is already mapped to another item in this pharmacy';
  end if;
  if v_mapping.id is null and v_global_mapping.id is not null
     and v_global_mapping.item_code<>v_item.item_code then
    -- No silent creation of a new local override against another Global owner.
    -- A pre-existing, matching local override remains valid under pharmacy-first lookup.
    raise exception 'Global identifier is mapped to another Item Code; correct the mapping before resolving';
  end if;

  if v_mapping.id is null and v_global_mapping.id is not null
     and v_global_mapping.item_code=v_item.item_code then
    -- Global-only resolution: reference the REAL Global mapping, never a fake local ID.
    v_mapping_scope:='GLOBAL';
    v_audit_mapping_id:=v_global_mapping.id;
    v_global_mapping_id:=v_global_mapping.id;
  else
    if v_mapping.id is null then
      insert into public.pharmflow_pharmacy_gtin_v1
        (pharmacy_id,gtin,identifier_display,identifier_key,item_code,item_name,source,created_by,updated_by)
      values(p_pharmacy_id,v_identifier,v_identifier,v_key,v_item.item_code,v_item.item_name,'EXPIRY_REVIEW',auth.uid(),auth.uid())
      returning * into v_mapping;
      v_mapping_created:=true;
    end if;
    v_audit_mapping_id:=v_mapping.id;
    if v_global_mapping.id is not null and v_global_mapping.item_code=v_item.item_code then
      -- Preserve a legitimate existing local mapping; do not create or delete one.
      v_mapping_scope:='GLOBAL_AND_PHARMACY';
      v_global_mapping_id:=v_global_mapping.id;
    else
      v_mapping_scope:='PHARMACY';
      v_global_mapping_id:=null;
    end if;
  end if;

  v_worker:=nullif(v_capture->>'worker_id','')::uuid;
  select * into v_ack from pharmflow_expiry_private.save_known_core(
    p_pharmacy_id,v_item.item_code,v_item.item_name,v_identifier,
    coalesce(nullif(v_item.category,''),nullif(v_capture->>'category','')),
    coalesce((select c.quantity from pharmflow_expiry_private.session_captures_v1 c where c.pharmacy_id=p_pharmacy_id and c.operation_id=v_details.operation_id),(v_capture->>'quantity')::integer),(v_capture->>'expiry_month')::integer,(v_capture->>'expiry_year')::integer,
    v_worker,nullif(v_capture->>'batch_no',''),nullif(v_capture->>'sample_serial',''),
    nullif(v_capture->>'device_id',''),upper(v_capture->>'source'),'CAPTURE');
  if v_ack.state_id is null or v_ack.event_id is null then raise exception 'Expiry inventory acknowledgement was not created'; end if;

  update public.pharmflow_needs_review_v2
     set status='RESOLVED',resolved_by=auth.uid(),resolved_item_code=v_item.item_code,
         resolved_item_name=v_item.item_name,resolved_at=clock_timestamp(),
         resolution_transaction_id=p_operation_id::text,updated_at=clock_timestamp()
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY' and status='PENDING';
  if not found then raise exception 'Expiry review changed before resolution was committed'; end if;

  insert into public.pharmflow_expiry_review_resolution_audit_v1
    (pharmacy_id,review_id,operation_id,identifier_display,identifier_key,item_code,item_name,mapping_id,mapping_created,
     expiry_state_id,expiry_event_id,performed_by,mapping_scope,global_mapping_id)
  values(p_pharmacy_id,p_review_id,p_operation_id,v_identifier,v_key,v_item.item_code,v_item.item_name,v_audit_mapping_id,
    v_mapping_created,v_ack.state_id,v_ack.event_id,auth.uid(),v_mapping_scope,v_global_mapping_id);

  return jsonb_build_object('success',true,'review_id',p_review_id,'item_code',v_item.item_code,
    'item_name',v_item.item_name,'operation_id',p_operation_id::text,'already_resolved',false,
    'state_id',v_ack.state_id,'event_id',v_ack.event_id,'scope',v_mapping_scope,'photo_cleanup_queued',true,
    'mapping_created',v_mapping_created);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_pharmflow_cloud_workspace_guarded(p_pharmacy_id uuid, p_workspace jsonb, p_device_id text, p_expected_generation bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_generation bigint;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_cloud_workspace_guarded',NULL);

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation)
    values(p_pharmacy_id,0)
    on conflict(pharmacy_id) do nothing;

    select generation
      into v_generation
      from public.pharmflow_workspace_generation_v1
     where pharmacy_id=p_pharmacy_id
     for update;

    if coalesce(p_expected_generation,-1) <> coalesce(v_generation,0) then
        raise exception 'WORKSPACE_RESET_CONFLICT';
    end if;

    perform public.save_pharmflow_cloud_workspace(
        p_pharmacy_id,
        p_workspace,
        p_device_id
    );

    return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_pharmflow_active_order_manifest_v3(p_pharmacy_id uuid, p_manifest jsonb, p_expected_generation bigint)
 RETURNS TABLE(revision bigint, updated_at timestamp with time zone, order_files integer, order_items integer, workspace_generation bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_files integer; v_items integer; v_generation bigint;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_active_order_manifest_v3',NULL);

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
    insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation) values(p_pharmacy_id,0) on conflict(pharmacy_id) do nothing;
    select g.generation into v_generation from public.pharmflow_workspace_generation_v1 g where g.pharmacy_id=p_pharmacy_id for update;
    if coalesce(p_expected_generation,-1) <> coalesce(v_generation,0) then raise exception 'STALE_WORKSPACE_GENERATION'; end if;
    v_files:=jsonb_array_length(coalesce(p_manifest->'orderFiles','[]'::jsonb));
    v_items:=jsonb_array_length(coalesce(p_manifest->'orderData','[]'::jsonb));
    if v_files<=0 or v_items<=0 then raise exception 'Active Order Manifest requires orderFiles and orderData'; end if;
    insert into public.pharmflow_active_order_manifest_v1(pharmacy_id,manifest,revision,updated_at,updated_by,workspace_generation)
    values(p_pharmacy_id,p_manifest,1,now(),auth.uid(),v_generation)
    on conflict(pharmacy_id) do update set manifest=excluded.manifest, revision=public.pharmflow_active_order_manifest_v1.revision+1,
        updated_at=now(),updated_by=auth.uid(),workspace_generation=v_generation;
    return query select m.revision,m.updated_at,
      jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
      jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),m.workspace_generation
      from public.pharmflow_active_order_manifest_v1 m where m.pharmacy_id=p_pharmacy_id;
end; $function$
;
CREATE OR REPLACE FUNCTION public.append_pharmflow_cloud_transaction_v2(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'append_pharmflow_cloud_transaction_v2',NULL);

    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    if nullif(trim(coalesce(p_transaction_id,'')),'') is null then
        raise exception 'Transaction ID required';
    end if;
    if nullif(trim(coalesce(p_item_code,'')),'') is null then
        raise exception 'Item Code required';
    end if;

    insert into public.pharmflow_receiving_transactions_v1(
        pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,
        quantity,source,device_id,occurred_at,payload,created_by
    ) values(
        p_pharmacy_id,trim(p_transaction_id),nullif(trim(coalesce(p_order_number,'')),''),
        trim(p_item_code),coalesce(p_item_name,''),coalesce(p_gtin,''),
        coalesce(p_quantity,0),coalesce(p_source,'RECEIVING'),coalesce(p_device_id,''),
        coalesce(p_occurred_at,now()),coalesce(p_payload,'{}'::jsonb),auth.uid()
    ) on conflict(pharmacy_id,transaction_id) do nothing;

    return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.mutate_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_request_id uuid, p_action text, p_selection jsonb, p_quantity integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare payload jsonb:=jsonb_build_object('action',p_action,'selection',p_selection,'quantity',p_quantity);
 prior pharmflow_expiry_private.inventory_requests_v1%rowtype;sel jsonb;viewrow record;s public.pharmflow_expiry_current_state_v1%rowtype;
 resolved pharmflow_expiry_private.resolved_inventory_v1%rowtype;stamp timestamptz;oldqty integer;newqty integer;n integer:=0;result jsonb;lockkey text;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'mutate_pharmflow_expiry_inventory_v1',p_request_id::text);

 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_action='CLEAR_RESOLVED' and not exists (
  select 1 from public.pharmacy_members m join public.pharmacies p on p.id=m.pharmacy_id
  where m.pharmacy_id=p_pharmacy_id and m.user_id=auth.uid() and m.active=true and p.status='active'
 ) then raise exception 'Pharmacy access required';end if;
 if p_request_id is null or p_action is null or p_selection is null or p_action not in ('QUANTITY','RESOLVE','RESTORE','CLEAR_RESOLVED') or jsonb_typeof(p_selection)<>'array' or jsonb_array_length(p_selection)=0 then raise exception 'Explicit selection required';end if;
 if p_action='QUANTITY' and (jsonb_array_length(p_selection)<>1 or p_quantity is null or p_quantity<0) then raise exception 'Nonnegative integer quantity required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-inventory-request/'||p_request_id::text,0));
 select * into prior from pharmflow_expiry_private.inventory_requests_v1 where request_id=p_request_id;
 if found then if prior.pharmacy_id<>p_pharmacy_id or prior.created_by<>auth.uid() or prior.payload is distinct from payload then raise exception 'Request payload conflict';end if;return prior.result;end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_selection) x)<>jsonb_array_length(p_selection) then raise exception 'Duplicate selection';end if;
 -- Acquire the SAME canonical item locks used by captures, in a stable order.
 for lockkey in select distinct p_pharmacy_id::text||'/item/'||r.item_code||'/'||upper(btrim(coalesce(r.batch_no,'')))||'/'||r.expiry_year||'/'||r.expiry_month
 from pharmflow_expiry_private.inventory_rows_v1(p_pharmacy_id,p_action in ('RESTORE','CLEAR_RESOLVED')) r
 where r.row_id in(select (x->>'id')::uuid from jsonb_array_elements(p_selection) x) order by 1
 loop perform pg_advisory_xact_lock(hashtextextended(lockkey,0));end loop;
 for sel in select x from jsonb_array_elements(p_selection) x order by x->>'id' loop
  select * into viewrow from pharmflow_expiry_private.inventory_rows_v1(p_pharmacy_id,p_action in ('RESTORE','CLEAR_RESOLVED')) r where r.row_id=(sel->>'id')::uuid;
  if not found or viewrow.version is distinct from sel->>'version' then raise exception 'Inventory changed; refresh and confirm selection again';end if;
  if p_action='CLEAR_RESOLVED' then
   -- Same canonical advisory locks as Restore/Capture, then a row-level eligibility recheck.
   update pharmflow_expiry_private.resolved_inventory_v1 r
    set cleared_at=clock_timestamp(),cleared_by=auth.uid()
    where r.id=viewrow.row_id and r.pharmacy_id=p_pharmacy_id and r.restored_at is null and r.cleared_at is null;
   if not found then raise exception 'Resolved list changed; refresh and confirm again';end if;
   n:=n+1;
   continue;
  end if;
  select * into s from public.pharmflow_expiry_current_state_v1 where id=viewrow.state_id and pharmacy_id=p_pharmacy_id for update;
  if not found then raise exception 'Inventory state unavailable';end if;
  stamp:=clock_timestamp();oldqty:=s.verified_quantity;
  if p_action='RESOLVE' then
   insert into pharmflow_expiry_private.resolved_inventory_v1(pharmacy_id,state_id,snapshot,quantity,resolved_at,resolved_by) values(p_pharmacy_id,s.id,to_jsonb(s),oldqty,stamp,auth.uid());newqty:=0;
  elsif p_action='RESTORE' then
   select * into resolved from pharmflow_expiry_private.resolved_inventory_v1 where id=viewrow.row_id and pharmacy_id=p_pharmacy_id and restored_at is null and cleared_at is null for update;
   if not found then raise exception 'Resolved row changed';end if;
   if s.item_code is distinct from resolved.snapshot->>'item_code' or s.batch_key is distinct from resolved.snapshot->>'batch_key' or s.expiry_year<>(resolved.snapshot->>'expiry_year')::integer or s.expiry_month<>(resolved.snapshot->>'expiry_month')::integer then raise exception 'Original identity changed; restore blocked';end if;
   newqty:=case when s.status='ACTIVE' then oldqty else 0 end+resolved.quantity;
   update pharmflow_expiry_private.resolved_inventory_v1 set restored_at=stamp,restored_by=auth.uid() where id=resolved.id;
  else newqty:=p_quantity;end if;
  update public.pharmflow_expiry_current_state_v1 set verified_quantity=newqty,status=case when p_action='RESOLVE' then 'CLEARED' else 'ACTIVE' end,
   verified_by_user_id=auth.uid(),last_verified_at=stamp,updated_at=stamp where id=s.id;
  insert into public.pharmflow_expiry_events_v1(state_id,pharmacy_id,event_type,item_code,item_name,identifier_display,identifier_key,category,batch_no,sample_serial,expiry_month,expiry_year,previous_quantity,verified_quantity,worker_id,verified_by_name,verified_by_user_id,device_id,source,occurred_at)
  values(s.id,p_pharmacy_id,case when p_action='RESOLVE' then 'CLEARED' else 'RECOUNT' end,s.item_code,s.item_name,s.identifier_display,s.identifier_key,s.category,s.batch_no,s.sample_serial,s.expiry_month,s.expiry_year,oldqty,newqty,s.worker_id,s.verified_by_name,auth.uid(),s.device_id,'PC',stamp);
  n:=n+1;
 end loop;
 result:=jsonb_build_object('request_id',p_request_id,'count',n,'action',p_action);
 insert into pharmflow_expiry_private.inventory_requests_v1 values(p_request_id,p_pharmacy_id,auth.uid(),payload,result,clock_timestamp());
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.correct_pharmflow_expiry_session_v2(p_pharmacy_id uuid, p_session_id uuid, p_operation_id uuid, p_request_id uuid, p_expected_revision integer, p_correction jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare c pharmflow_expiry_private.session_captures_v1%rowtype;o pharmflow_expiry_private.operations%rowtype;
 a pharmflow_expiry_private.session_adjustments_v1%rowtype;v public.pharmflow_expiry_current_state_v1%rowtype;
 qty integer;mo integer;yr integer;batch text;oldid uuid;anchor uuid;keyold text;keynew text;lockkey text;total integer;ack record;target record;result jsonb;events jsonb:='[]'::jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'correct_pharmflow_expiry_session_v2',p_operation_id::text);

 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,false);
 if p_request_id is null or p_expected_revision is null or jsonb_typeof(p_correction)<>'object' or not(p_correction ?& array['quantity','batch_no','expiry_month','expiry_year']) or (select count(*) from jsonb_object_keys(p_correction))<>4 then raise exception 'Complete correction required';end if;
 select * into a from pharmflow_expiry_private.session_adjustments_v1 where request_id=p_request_id;
 if found then
  if a.session_id<>p_session_id or a.operation_id<>p_operation_id or a.created_by<>auth.uid() or a.expected_revision<>p_expected_revision or a.result->'correction' is distinct from p_correction then raise exception 'Correction payload conflict';end if;return a.result;
 end if;
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,true);
 if jsonb_typeof(p_correction->'quantity')<>'number' or (p_correction->>'quantity') !~ '^[0-9]+$' or jsonb_typeof(p_correction->'expiry_month')<>'number' or jsonb_typeof(p_correction->'expiry_year')<>'number' or jsonb_typeof(p_correction->'batch_no') not in ('string','null') then raise exception 'Invalid correction values';end if;
 qty:=(p_correction->>'quantity')::integer;mo:=(p_correction->>'expiry_month')::integer;yr:=(p_correction->>'expiry_year')::integer;batch:=nullif(btrim(p_correction->>'batch_no'),'');
 if mo not between 1 and 12 or yr not between 2020 and 2200 then raise exception 'Invalid corrected batch or expiry';end if;
 select * into c from pharmflow_expiry_private.session_captures_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and session_id=p_session_id for update;
 if not found or c.quantity=0 then raise exception 'Operation not editable';end if;
 if c.revision<>p_expected_revision then raise exception 'Stale revision; reload History';end if;
 select * into o from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if o.created_by<>auth.uid() then raise exception 'Operation scope mismatch';end if;
 if (pharmflow_expiry_private.gs1_source_locks(o.payload,c.facts)->>'batch')::boolean and (p_correction->>'batch_no') is not distinct from (o.payload->>'batch_no') then batch:=nullif(o.payload->>'batch_no','');end if;
 if qty>0 then
  if (pharmflow_expiry_private.gs1_source_locks(o.payload,c.facts)->>'batch')::boolean and coalesce(batch,'') is distinct from coalesce(o.payload->>'batch_no','') then raise exception 'Batch captured from GS1 is read only';end if;
  if (pharmflow_expiry_private.gs1_source_locks(o.payload,c.facts)->>'expiry')::boolean and (mo<>(o.payload->>'expiry_month')::integer or yr<>(o.payload->>'expiry_year')::integer) then raise exception 'Expiry captured from GS1 is read only';end if;
 end if;
 if batch is distinct from coalesce(c.facts->>'batch_no',o.payload->>'batch_no') and pharmflow_expiry_private.batch_is_scanner_payload(batch) then raise exception 'Use Scan Barcode, not Batch';end if;
 if batch is distinct from coalesce(c.facts->>'batch_no',o.payload->>'batch_no') and (length(coalesce(batch,''))>case when o.payload->>'scan_format'='GS1' then 20 else 128 end or coalesce(batch,'')~'[[:cntrl:]]') then raise exception 'Invalid corrected batch';end if;
 if o.payload->>'kind'='UNKNOWN' then
  perform 1 from public.pharmflow_needs_review_v2 where id=(o.result->>'review_id')::uuid and pharmacy_id=p_pharmacy_id and status='PENDING' for update;
  if not found then raise exception 'Only pending review operations are editable';end if;
  if qty=0 then perform public.delete_pharmflow_expiry_review_v1(p_pharmacy_id,(o.result->>'review_id')::uuid);end if;
 else
  oldid:=coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid);anchor:=coalesce((c.facts->>'effective_event_id')::uuid,(o.result->>'event_id')::uuid);
  select * into v from public.pharmflow_expiry_current_state_v1 where id=oldid and pharmacy_id=p_pharmacy_id;
  if not found then raise exception 'Inventory unavailable';end if;
  keyold:=p_pharmacy_id::text||'/item/'||v.item_code||'/'||v.batch_key||'/'||v.expiry_year||'/'||v.expiry_month;
  keynew:=p_pharmacy_id::text||'/item/'||v.item_code||'/'||upper(btrim(coalesce(batch,'')))||'/'||yr||'/'||mo;
  for lockkey in select distinct k from unnest(array[keyold,keynew]) k order by k loop perform pg_advisory_xact_lock(hashtextextended(lockkey,0));end loop;
  select * into v from public.pharmflow_expiry_current_state_v1 where id=oldid for update;
  if exists(select 1 from public.pharmflow_expiry_events_v1 x where x.state_id=oldid and x.occurred_at>=(select occurred_at from public.pharmflow_expiry_events_v1 where id=anchor) and x.event_type in ('RECOUNT','CLEARED') and not exists(select 1 from pharmflow_expiry_private.session_adjustments_v1 y where y.event_id=x.id or coalesce(y.result->'event_ids','[]'::jsonb) ? x.id::text)) then raise exception 'Inventory recounted; operation is read only';end if;
  total:=v.verified_quantity-c.quantity+case when keyold=keynew then qty else 0 end;
  if total<0 then raise exception 'Correction would make inventory negative';end if;
  select * into ack from pharmflow_expiry_private.save_known_core(p_pharmacy_id,v.item_code,v.item_name,v.identifier_display,v.category,total,v.expiry_month,v.expiry_year,(o.payload->>'worker_id')::uuid,v.batch_no,v.sample_serial,o.payload->>'device_id','HANDHELD',case when total=0 then 'CLEARED' else 'RECOUNT' end);
  events:=events||jsonb_build_array(ack.event_id::text);
  if keyold<>keynew and qty>0 then
   select * into target from pharmflow_expiry_private.save_known_core(p_pharmacy_id,o.payload->>'item_code',o.payload->>'item_name',o.payload->>'identifier_display',o.payload->>'category',qty,mo,yr,(o.payload->>'worker_id')::uuid,batch,o.payload->>'sample_serial',o.payload->>'device_id','HANDHELD','CAPTURE');

   insert into pharmflow_expiry_private.first_operator_v1(state_id,pharmacy_id,event_id,worker_id,operator_name,occurred_at)
   select target.state_id,f.pharmacy_id,f.event_id,f.worker_id,f.operator_name,f.occurred_at from pharmflow_expiry_private.first_operator_v1 f where f.state_id=oldid and f.pharmacy_id=p_pharmacy_id
   on conflict(state_id) do update set event_id=excluded.event_id,worker_id=excluded.worker_id,operator_name=excluded.operator_name,occurred_at=excluded.occurred_at
   where (excluded.occurred_at,excluded.event_id)<(first_operator_v1.occurred_at,first_operator_v1.event_id);
   oldid:=target.state_id;anchor:=target.event_id;events:=events||jsonb_build_array(target.event_id::text);
  else anchor:=ack.event_id;end if;
 end if;
 result:=jsonb_build_object('operation_id',p_operation_id,'request_id',p_request_id,'quantity',qty,'revision',c.revision+1,'correction',p_correction,'event_ids',events,'state_id',oldid);
 insert into pharmflow_expiry_private.session_adjustments_v1(request_id,session_id,operation_id,created_by,previous_quantity,quantity,expected_revision,result,event_id) values(p_request_id,p_session_id,p_operation_id,auth.uid(),c.quantity,qty,p_expected_revision,result,anchor);
 update pharmflow_expiry_private.session_captures_v1 set quantity=qty,revision=revision+1,facts=jsonb_build_object('gs1_source_locks',pharmflow_expiry_private.gs1_source_locks(o.payload,c.facts),'batch_no',batch,'expiry_month',mo,'expiry_year',yr,'effective_state_id',oldid,'effective_event_id',anchor,'correction_source','OPERATOR_CORRECTION') where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_pharmflow_expiry_session_capture_v2(p_pharmacy_id uuid, p_session_id uuid, p_operation_id uuid, p_capture jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare r jsonb;s pharmflow_expiry_private.active_sessions_v1%rowtype;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmflow_expiry_session_capture_v2',p_operation_id::text);

 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,false);
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id;
 -- The original per-device validation is retained. Other devices sign in with their own signed auth session.
 r:=public.save_pharmflow_expiry_session_capture_v1(p_pharmacy_id,p_session_id,p_operation_id,p_capture);
 return r||jsonb_build_object('confirmed_capture',p_capture,'pharmacy_id',p_pharmacy_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.list_pharmflow_expiry_reviews_v1(p_pharmacy_id uuid, p_status text DEFAULT 'PENDING'::text, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare v_status text:=upper(btrim(coalesce(p_status,'PENDING')));v_limit integer:=least(greatest(coalesce(p_limit,250),1),500);v_offset integer:=greatest(coalesce(p_offset,0),0);
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmflow_expiry_reviews_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if v_status not in ('PENDING','RESOLVED','ALL') then raise exception 'Invalid Expiry review status';end if;
 return query select o.payload||coalesce((select c.facts from pharmflow_expiry_private.session_captures_v1 c where c.pharmacy_id=o.pharmacy_id and c.operation_id=o.operation_id),'{}'::jsonb)||jsonb_build_object('original_quantity',o.payload->'quantity','quantity',coalesce((select c.quantity from pharmflow_expiry_private.session_captures_v1 c where c.pharmacy_id=o.pharmacy_id and c.operation_id=o.operation_id),(o.payload->>'quantity')::integer))||jsonb_build_object('review_id',r.id,'pharmacy_id',r.pharmacy_id,'identifier_key',r.identifier_key,'status',r.status,'created_by',r.created_by,'created_at',r.created_at,'review_reason',r.review_reason,'resolved_by',r.resolved_by,'resolved_item_code',r.resolved_item_code,'resolved_item_name',r.resolved_item_name,'resolved_at',r.resolved_at,'resolution_transaction_id',r.resolution_transaction_id,'worker_name',d.worker_name,'product_photo_path',d.product_photo_path,'expiry_photo_path',d.expiry_photo_path,'evidence_photo_path',coalesce(d.product_photo_path,d.expiry_photo_path),'evidence_photo_deleted',coalesce(p.deleted_at,e.deleted_at) is not null)
 from public.pharmflow_needs_review_v2 r join pharmflow_expiry_private.review_details d on d.review_id=r.id and d.pharmacy_id=r.pharmacy_id join pharmflow_expiry_private.operations o on o.pharmacy_id=d.pharmacy_id and o.operation_id=d.operation_id left join pharmflow_expiry_private.photos p on p.path=d.product_photo_path left join pharmflow_expiry_private.photos e on e.path=d.expiry_photo_path
 where r.pharmacy_id=p_pharmacy_id and r.workflow='EXPIRY' and (v_status='ALL' or r.status=v_status)
 order by r.created_at desc,r.id desc limit v_limit offset v_offset;
end $function$
;
CREATE OR REPLACE FUNCTION public.list_pharmflow_expiry_session_v2(p_pharmacy_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare r jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmflow_expiry_session_v2',NULL);

 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id);
 select coalesce(jsonb_agg(x.receipt order by x.captured_at desc,x.operation_id desc),'[]'::jsonb) into r from (
  select coalesce(e.occurred_at,n.created_at,o.created_at) captured_at,o.operation_id,o.payload||c.facts||jsonb_build_object('gs1_source_locks',pharmflow_expiry_private.gs1_source_locks(o.payload,c.facts),'operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,'acknowledgement',o.result,'quantity',c.quantity,'revision',c.revision,'captured_at',coalesce(e.occurred_at,n.created_at,o.created_at),'status',case when c.quantity=0 then 'DELETED' when o.payload->>'kind'='UNKNOWN' then n.status else 'SAVED' end,'editable',c.quantity>0 and (o.payload->>'kind'='KNOWN' or n.status='PENDING')) receipt
  from pharmflow_expiry_private.session_captures_v1 c join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id)
  left join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>'event_id')::uuid and e.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_needs_review_v2 n on n.id=(o.result->>'review_id')::uuid and n.pharmacy_id=o.pharmacy_id
  where c.session_id=p_session_id and c.quantity>0 and n.status is distinct from 'DELETED' order by coalesce(e.occurred_at,n.created_at,o.created_at) desc,o.operation_id desc limit 10
 ) x;return r;
end $function$
;
CREATE OR REPLACE FUNCTION public.summary_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare cur integer:=(extract(year from timezone('Asia/Riyadh',now()))::integer*12+extract(month from timezone('Asia/Riyadh',now()))::integer);result jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'summary_pharmflow_expiry_inventory_v1',NULL);

 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select jsonb_agg(jsonb_build_object('key',p.key,'from',p.lo,'to',p.hi,'count',q.n,'units',q.units)) into result
 from (values('EXPIRED',null::integer,cur),('NEXT1',cur+1,cur+1),('NEXT2',cur+1,cur+2),('NEXT6',cur+1,cur+6)) p(key,lo,hi)
 cross join lateral(select count(*) n,coalesce(sum(s.verified_quantity),0) units from public.pharmflow_expiry_current_state_v1 s
 where s.pharmacy_id=p_pharmacy_id and s.status='ACTIVE' and (p.lo is null or s.expiry_year*12+s.expiry_month>=p.lo) and s.expiry_year*12+s.expiry_month<=p.hi) q;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.correct_pharmflow_expiry_desktop_session_v1(p_pharmacy_id uuid, p_session_id uuid, p_operation_id uuid, p_request_id uuid, p_expected_revision integer, p_correction jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare c pharmflow_expiry_private.session_captures_v1%rowtype;o pharmflow_expiry_private.operations%rowtype;
 a pharmflow_expiry_private.session_adjustments_v1%rowtype;v public.pharmflow_expiry_current_state_v1%rowtype;
 qty integer;mo integer;yr integer;batch text;oldid uuid;anchor uuid;keyold text;keynew text;lockkey text;total integer;ack record;target record;result jsonb;events jsonb:='[]'::jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'correct_pharmflow_expiry_desktop_session_v1',p_operation_id::text);

 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,false);
 if p_request_id is null or p_expected_revision is null or jsonb_typeof(p_correction)<>'object' or not(p_correction ?& array['quantity','batch_no','expiry_month','expiry_year']) or (select count(*) from jsonb_object_keys(p_correction))<>4 then raise exception 'Complete correction required';end if;
 select * into a from pharmflow_expiry_private.session_adjustments_v1 where request_id=p_request_id;
 if found then
  if a.session_id<>p_session_id or a.operation_id<>p_operation_id or a.created_by<>auth.uid() or a.expected_revision<>p_expected_revision or a.result->'correction' is distinct from p_correction then raise exception 'Correction payload conflict';end if;return a.result;
 end if;
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,true);
 if jsonb_typeof(p_correction->'quantity')<>'number' or (p_correction->>'quantity') !~ '^[0-9]+$' or jsonb_typeof(p_correction->'expiry_month')<>'number' or jsonb_typeof(p_correction->'expiry_year')<>'number' or jsonb_typeof(p_correction->'batch_no') not in ('string','null') then raise exception 'Invalid correction values';end if;
 qty:=(p_correction->>'quantity')::integer;mo:=(p_correction->>'expiry_month')::integer;yr:=(p_correction->>'expiry_year')::integer;batch:=nullif(btrim(p_correction->>'batch_no'),'');
 if mo not between 1 and 12 or yr not between 2020 and 2200 then raise exception 'Invalid corrected batch or expiry';end if;
 select * into c from pharmflow_expiry_private.session_captures_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and session_id=p_session_id for update;
 if not found or c.quantity=0 then raise exception 'Operation not editable';end if;
 if c.revision<>p_expected_revision then raise exception 'Stale revision; reload History';end if;
 select * into o from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if o.payload->>'source' is distinct from 'PC' then raise exception 'Desktop operation required';end if;
 if o.created_by<>auth.uid() then raise exception 'Operation scope mismatch';end if;
 if batch is distinct from coalesce(c.facts->>'batch_no',o.payload->>'batch_no') and pharmflow_expiry_private.batch_is_scanner_payload(batch) then raise exception 'Use Scan Barcode, not Batch';end if;
 if batch is distinct from coalesce(c.facts->>'batch_no',o.payload->>'batch_no') and (length(coalesce(batch,''))>case when o.payload->>'scan_format'='GS1' then 20 else 128 end or coalesce(batch,'')~'[[:cntrl:]]') then raise exception 'Invalid corrected batch';end if;
 if o.payload->>'kind'='UNKNOWN' then
  perform 1 from public.pharmflow_needs_review_v2 where id=(o.result->>'review_id')::uuid and pharmacy_id=p_pharmacy_id and status='PENDING' for update;
  if not found then raise exception 'Only pending review operations are editable';end if;
  if qty=0 then perform public.delete_pharmflow_expiry_review_v1(p_pharmacy_id,(o.result->>'review_id')::uuid);end if;
 else
  oldid:=coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid);anchor:=coalesce((c.facts->>'effective_event_id')::uuid,(o.result->>'event_id')::uuid);
  select * into v from public.pharmflow_expiry_current_state_v1 where id=oldid and pharmacy_id=p_pharmacy_id;
  if not found then raise exception 'Inventory unavailable';end if;
  keyold:=p_pharmacy_id::text||'/item/'||v.item_code||'/'||v.batch_key||'/'||v.expiry_year||'/'||v.expiry_month;
  keynew:=p_pharmacy_id::text||'/item/'||v.item_code||'/'||upper(coalesce(batch,''))||'/'||yr||'/'||mo;
  for lockkey in select distinct k from unnest(array[keyold,keynew]) k order by k loop perform pg_advisory_xact_lock(hashtextextended(lockkey,0));end loop;
  select * into v from public.pharmflow_expiry_current_state_v1 where id=oldid for update;
  if exists(select 1 from public.pharmflow_expiry_events_v1 x where x.state_id=oldid and x.occurred_at>=(select occurred_at from public.pharmflow_expiry_events_v1 where id=anchor) and x.event_type in ('RECOUNT','CLEARED') and not exists(select 1 from pharmflow_expiry_private.session_adjustments_v1 y where y.event_id=x.id or coalesce(y.result->'event_ids','[]'::jsonb) ? x.id::text)) then raise exception 'Inventory recounted; operation is read only';end if;
  total:=v.verified_quantity-c.quantity+case when keyold=keynew then qty else 0 end;
  if total<0 then raise exception 'Correction would make inventory negative';end if;
  select * into ack from pharmflow_expiry_private.save_known_core(p_pharmacy_id,v.item_code,v.item_name,v.identifier_display,v.category,total,v.expiry_month,v.expiry_year,(o.payload->>'worker_id')::uuid,v.batch_no,v.sample_serial,o.payload->>'device_id','PC',case when total=0 then 'CLEARED' else 'RECOUNT' end);
  events:=events||jsonb_build_array(ack.event_id::text);
  if keyold<>keynew and qty>0 then
   select * into target from pharmflow_expiry_private.save_known_core(p_pharmacy_id,o.payload->>'item_code',o.payload->>'item_name',o.payload->>'identifier_display',o.payload->>'category',qty,mo,yr,(o.payload->>'worker_id')::uuid,batch,o.payload->>'sample_serial',o.payload->>'device_id','PC','CAPTURE');
   oldid:=target.state_id;anchor:=target.event_id;events:=events||jsonb_build_array(target.event_id::text);
  else anchor:=ack.event_id;end if;
 end if;
 result:=jsonb_build_object('operation_id',p_operation_id,'request_id',p_request_id,'quantity',qty,'revision',c.revision+1,'correction',p_correction,'event_ids',events,'state_id',oldid);
 insert into pharmflow_expiry_private.session_adjustments_v1(request_id,session_id,operation_id,created_by,previous_quantity,quantity,expected_revision,result,event_id) values(p_request_id,p_session_id,p_operation_id,auth.uid(),c.quantity,qty,p_expected_revision,result,anchor);
 update pharmflow_expiry_private.session_captures_v1 set quantity=qty,revision=revision+1,facts=jsonb_build_object('batch_no',batch,'expiry_month',mo,'expiry_year',yr,'effective_state_id',oldid,'effective_event_id',anchor,'correction_source','OPERATOR_CORRECTION') where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.list_pharmflow_expiry_desktop_session_v1(p_pharmacy_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare r jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmflow_expiry_desktop_session_v1',NULL);

 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id);
 select coalesce(jsonb_agg(x.receipt order by x.captured_at desc,x.operation_id desc),'[]'::jsonb) into r from (
  select coalesce(e.occurred_at,n.created_at,o.created_at) captured_at,o.operation_id,o.payload||c.facts||jsonb_build_object('group_name',(select public.pharmflow_normalize_main_group_v1(g.group_name) from public.pharmflow_global_items_v2 g where g.item_code=coalesce(c.facts->>'item_code',o.payload->>'item_code')),'worker_name',coalesce(e.verified_by_name,'Desktop'),'operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,'acknowledgement',o.result,'quantity',c.quantity,'revision',c.revision,'captured_at',coalesce(e.occurred_at,n.created_at,o.created_at),'status',case when c.quantity=0 then 'DELETED' when o.payload->>'kind'='UNKNOWN' then n.status else 'SAVED' end,'editable',c.quantity>0 and (o.payload->>'kind'='KNOWN' or n.status='PENDING') and
   (o.payload->>'kind'<>'KNOWN' or not exists(
    select 1 from public.pharmflow_expiry_events_v1 external_event
    where external_event.state_id=coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid)
    and external_event.occurred_at>=(select occurred_at from public.pharmflow_expiry_events_v1 where id=coalesce((c.facts->>'effective_event_id')::uuid,(o.result->>'event_id')::uuid))
    and external_event.event_type in ('RECOUNT','CLEARED')
    and not exists(select 1 from pharmflow_expiry_private.session_adjustments_v1 adjustment where adjustment.event_id=external_event.id or coalesce(adjustment.result->'event_ids','[]'::jsonb) ? external_event.id::text)
   ))) receipt
  from pharmflow_expiry_private.session_captures_v1 c join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id)
  left join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>'event_id')::uuid and e.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_needs_review_v2 n on n.id=(o.result->>'review_id')::uuid and n.pharmacy_id=o.pharmacy_id
  where c.session_id=p_session_id and o.payload->>'source'='PC' order by coalesce(e.occurred_at,n.created_at,o.created_at) desc,o.operation_id desc
 ) x;return r;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_pharmflow_expiry_desktop_capture_v1(p_pharmacy_id uuid, p_session_id uuid, p_operation_id uuid, p_capture jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare s pharmflow_expiry_private.active_sessions_v1%rowtype;r jsonb;c pharmflow_expiry_private.session_captures_v1%rowtype;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmflow_expiry_desktop_capture_v1',p_operation_id::text);

 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,false);
 if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id for update;
 if not found or s.pharmacy_id<>p_pharmacy_id or s.created_by<>auth.uid() or s.device_id is distinct from p_capture->>'device_id' then raise exception 'Session scope mismatch';end if;
 select * into c from pharmflow_expiry_private.session_captures_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if found then
  if c.session_id<>p_session_id then raise exception 'Operation belongs to another session';end if;
  -- Read-only acknowledgement retry remains possible after closure.
  return public.save_pharmflow_expiry_capture_v3(p_pharmacy_id,p_operation_id,p_capture);
 end if;
 if s.closed_at is not null then raise exception 'Session closed';end if;
 if p_capture->>'source' is distinct from 'PC' then raise exception 'Desktop capture required';end if;
 perform public.reserve_pharmflow_expiry_capture_v1(p_pharmacy_id,p_operation_id);
 perform 1 from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and status='COMMITTED';
 if found then raise exception 'Historical operation cannot join a session';end if;
 r:=public.save_pharmflow_expiry_capture_v3(p_pharmacy_id,p_operation_id,p_capture);
 insert into pharmflow_expiry_private.session_captures_v1(pharmacy_id,operation_id,session_id,quantity)
 values(p_pharmacy_id,p_operation_id,p_session_id,(p_capture->>'quantity')::integer);
 return r;
end $function$
;
CREATE OR REPLACE FUNCTION public.correct_pharmflow_expiry_desktop_group_v1(p_pharmacy_id uuid, p_session_id uuid, p_state_id uuid, p_request_id uuid, p_expected_members jsonb, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 prior pharmflow_expiry_private.session_group_adjustments_v1%rowtype;
 v public.pharmflow_expiry_current_state_v1%rowtype;
 member record;
 expected jsonb;actual jsonb;results jsonb:='[]'::jsonb;
 old_total bigint;delta bigint;new_qty integer;child jsonb;answer jsonb;
 added_operation uuid;device text;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'correct_pharmflow_expiry_desktop_group_v1',p_request_id::text);

 -- Existing helper validates pharmacy membership, auth.uid(), live auth.sessions
 -- and exact signed auth-session ownership; it locks the session row first.
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,false);
 if p_state_id is null or p_request_id is null or p_quantity is null or p_quantity<0
    or p_expected_members is null or jsonb_typeof(p_expected_members)<>'array' then
  raise exception 'Complete group correction required';
 end if;
 if jsonb_array_length(p_expected_members) not between 1 and 500 then
  raise exception 'Unsupported group size';
 end if;
 for member in select value entry from jsonb_array_elements(p_expected_members) loop
  if jsonb_typeof(member.entry)<>'object'
     or not(member.entry ?& array['operation_id','revision'])
     or (select count(*) from jsonb_object_keys(member.entry))<>2
     or jsonb_typeof(member.entry->'operation_id')<>'string'
     or jsonb_typeof(member.entry->'revision')<>'number'
     or (member.entry->>'revision') !~ '^[0-9]+$' then
   raise exception 'Invalid expected membership';
  end if;
 end loop;
 select jsonb_agg(jsonb_build_object('operation_id',(value->>'operation_id')::uuid,
     'revision',(value->>'revision')::integer) order by (value->>'operation_id')::uuid)
 into expected from jsonb_array_elements(p_expected_members);
 if (select count(distinct (value->>'operation_id')::uuid)
     from jsonb_array_elements(expected))<>jsonb_array_length(expected) then
  raise exception 'Duplicate expected member';
 end if;
 -- Serialize a request ID across sessions; scope/payload conflicts never return
 -- another owner's result. Transaction locks disappear on error/rollback.
 perform pg_advisory_xact_lock(hashtextextended('expiry-group-request/'||p_request_id::text,0));
 select * into prior from pharmflow_expiry_private.session_group_adjustments_v1 where request_id=p_request_id;
 if found then
  if prior.pharmacy_id<>p_pharmacy_id or prior.session_id<>p_session_id
     or prior.state_id<>p_state_id or prior.created_by<>auth.uid()
     or prior.expected_members is distinct from expected or prior.quantity<>p_quantity then
   raise exception 'Group request payload conflict';
  end if;
  return prior.result;
 end if;
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,true);
 select * into v from public.pharmflow_expiry_current_state_v1 where id=p_state_id and pharmacy_id=p_pharmacy_id;
 if not found then raise exception 'Group inventory unavailable';end if;
 -- Reuse exact canonical lock used by capture and single corrections.
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'/item/'||v.item_code||'/'||v.batch_key||'/'||v.expiry_year||'/'||v.expiry_month,0));
 select * into v from public.pharmflow_expiry_current_state_v1 where id=p_state_id and pharmacy_id=p_pharmacy_id for update;
 -- The session lock serializes same-session new captures/corrections. The
 -- canonical/state locks serialize other sessions' Inventory changes.
 perform c.operation_id from pharmflow_expiry_private.session_captures_v1 c
 join pharmflow_expiry_private.operations o on o.pharmacy_id=c.pharmacy_id and o.operation_id=c.operation_id
 where c.pharmacy_id=p_pharmacy_id and c.session_id=p_session_id and c.quantity>0
   and o.created_by=auth.uid() and o.payload->>'kind'='KNOWN'
   and coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid)=p_state_id
 order by c.operation_id for update of c;
 select jsonb_agg(jsonb_build_object('operation_id',c.operation_id,'revision',c.revision) order by c.operation_id),sum(c.quantity)
 into actual,old_total from pharmflow_expiry_private.session_captures_v1 c
 join pharmflow_expiry_private.operations o on o.pharmacy_id=c.pharmacy_id and o.operation_id=c.operation_id
 where c.pharmacy_id=p_pharmacy_id and c.session_id=p_session_id and c.quantity>0
   and o.created_by=auth.uid() and o.payload->>'kind'='KNOWN'
   and coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid)=p_state_id;
 if actual is null or actual is distinct from expected then raise exception 'Stale group membership; reload Session Activity';end if;
 if v.verified_quantity::bigint-old_total+p_quantity not between 0 and 2147483647 then
  raise exception 'Invalid resulting Inventory quantity';
 end if;
 delta:=p_quantity-old_total;
 -- Reduce serial-free group adjustments first, then original captures.
 -- NEVER increase an original capture quantity or copy its serial to new units.
 -- Calls below execute INSIDE THIS ONE database transaction, never client loops.
 for member in
  select c.*,o.payload from pharmflow_expiry_private.session_captures_v1 c
  join pharmflow_expiry_private.operations o on o.pharmacy_id=c.pharmacy_id and o.operation_id=c.operation_id
  where c.pharmacy_id=p_pharmacy_id and c.session_id=p_session_id and c.quantity>0
    and o.created_by=auth.uid() and o.payload->>'kind'='KNOWN'
    and coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid)=p_state_id
  order by case when exists(select 1 from pharmflow_expiry_private.session_group_adjustments_v1 g
    where g.pharmacy_id=p_pharmacy_id and g.session_id=p_session_id and g.created_by=auth.uid()
      and g.result->>'added_operation_id'=c.operation_id::text) then 0 else 1 end,c.operation_id desc
 loop
  if member.payload->>'source' is distinct from 'PC' then raise exception 'Desktop group required';end if;
  -- Preserve the existing external recount/read-only check even for no-op members.
  if exists(select 1 from public.pharmflow_expiry_events_v1 e
    where e.state_id=p_state_id and e.occurred_at >= (
      select occurred_at from public.pharmflow_expiry_events_v1 where id=coalesce(
        (member.facts->>'effective_event_id')::uuid,
        (select (o.result->>'event_id')::uuid from pharmflow_expiry_private.operations o where o.pharmacy_id=p_pharmacy_id and o.operation_id=member.operation_id)))
    and e.event_type in ('RECOUNT','CLEARED') and not exists(
      select 1 from pharmflow_expiry_private.session_adjustments_v1 a
      where a.event_id=e.id or coalesce(a.result->'event_ids','[]'::jsonb) ? e.id::text)) then
   raise exception 'Inventory recounted; group read only';
  end if;
  new_qty:=case when delta<0 then greatest(0,member.quantity::bigint+delta)::integer else member.quantity end;
  delta:=delta-(new_qty-member.quantity);
  if new_qty<>member.quantity then
   child:=public.correct_pharmflow_expiry_desktop_session_v1(p_pharmacy_id,p_session_id,
     member.operation_id,gen_random_uuid(),member.revision,jsonb_build_object(
       'quantity',new_qty,'batch_no',coalesce(member.facts->>'batch_no',member.payload->>'batch_no'),
       'expiry_month',v.expiry_month,'expiry_year',v.expiry_year));
   results:=results||jsonb_build_array(child);
  end if;
 end loop;
 if delta>0 then
  select device_id into device from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id;
  added_operation:=gen_random_uuid();
  -- Reuse the existing signed-session capture transaction for a new serial-free
  -- quantity contribution. Explicit provenance says this is a group adjustment,
  -- NOT a physical scan. raw_scan is required by the existing PLAIN validator;
  -- it contains only the derived exact identifier, no invented GS1/serial.
  child:=public.save_pharmflow_expiry_desktop_capture_v1(p_pharmacy_id,p_session_id,
    added_operation,jsonb_build_object('kind','KNOWN','source','PC','worker_id',null,
      'device_id',device,'item_code',v.item_code,'item_name',v.item_name,
      'identifier_display',v.identifier_display,'category',v.category,
      'raw_scan',v.identifier_display,'scan_format','PLAIN','sample_serial',null,
      'batch_no',v.batch_no,'expiry_month',v.expiry_month,'expiry_year',v.expiry_year,
      'quantity',delta::integer,'contribution_type','GROUP_QUANTITY_ADJUSTMENT',
      'origin_request_id',p_request_id,'raw_scan_origin','SERVER_DERIVED_IDENTIFIER_NOT_SCANNER'));
  if (child->>'state_id')::uuid is distinct from p_state_id then raise exception 'Adjustment group identity mismatch';end if;
  update pharmflow_expiry_private.session_captures_v1
   set facts=facts||jsonb_build_object('contribution_type','GROUP_QUANTITY_ADJUSTMENT',
       'origin_request_id',p_request_id,'serial_attribution','NONE')
   where pharmacy_id=p_pharmacy_id and operation_id=added_operation and session_id=p_session_id;
  results:=results||jsonb_build_array(child||jsonb_build_object('contribution_type','GROUP_QUANTITY_ADJUSTMENT'));
  delta:=0;
 end if;
 if delta<>0 then raise exception 'Group allocation failed';end if;
 answer:=jsonb_build_object('request_id',p_request_id,'state_id',p_state_id,
   'session_id',p_session_id,'previous_quantity',old_total,'quantity',p_quantity,'adjustments',results,
   'added_operation_id',added_operation,'serial_policy','ORIGINALS_UNCHANGED_ADDITIONS_UNSERIALIZED');
 insert into pharmflow_expiry_private.session_group_adjustments_v1
  (request_id,pharmacy_id,session_id,state_id,created_by,expected_members,previous_quantity,quantity,result)
 values(p_request_id,p_pharmacy_id,p_session_id,p_state_id,auth.uid(),expected,old_total,p_quantity,answer);
 return answer;
end $function$
;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_expiry_desktop_session_v1(p_pharmacy_id uuid, p_session_id uuid, p_request_id uuid, p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare sid uuid:=pharmflow_expiry_private.valid_auth_session();s pharmflow_expiry_private.active_sessions_v1%rowtype;
 a pharmflow_expiry_private.session_clear_requests_v1%rowtype; nextid uuid; result jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'clear_pharmflow_expiry_desktop_session_v1',p_request_id::text);

 if public.is_pharmacy_member(p_pharmacy_id) is not true or p_request_id is null or p_session_id is null or nullif(btrim(p_device_id),'') is null then raise exception 'Clear scope and request required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth-lifecycle/'||auth.uid()::text||'/'||sid::text,0));
 perform pharmflow_expiry_private.valid_auth_session();
 if exists(select 1 from pharmflow_expiry_private.closed_auth_sessions_v1 where created_by=auth.uid() and auth_session_id=sid) then raise exception 'Session closed; Sign In required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth/'||p_pharmacy_id::text||'/'||sid::text,0));
 -- Validate signed scope before returning any retained receipt.
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,false);
 select * into a from pharmflow_expiry_private.session_clear_requests_v1 where request_id=p_request_id;
 if found then
  if a.pharmacy_id<>p_pharmacy_id or a.created_by<>auth.uid() or a.auth_session_id<>sid or a.previous_session_id<>p_session_id or a.device_id<>p_device_id then raise exception 'Clear payload conflict';end if;
  return a.result;
 end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id for update;
 if s.device_id is distinct from p_device_id then raise exception 'Session device mismatch';end if;
 if s.closed_at is not null then raise exception 'Stale session; reload before clearing';end if;
 nextid:=gen_random_uuid();
 update pharmflow_expiry_private.active_sessions_v1 set closed_at=clock_timestamp() where id=s.id;
 insert into pharmflow_expiry_private.active_sessions_v1(id,pharmacy_id,created_by,device_id,auth_session_id)
 values(nextid,p_pharmacy_id,auth.uid(),s.device_id,sid);
 result:=jsonb_build_object('status','CLEARED','request_id',p_request_id,'previous_session_id',s.id,'session_id',nextid,'auth_session_id',sid);
 insert into pharmflow_expiry_private.session_clear_requests_v1(request_id,pharmacy_id,created_by,auth_session_id,previous_session_id,next_session_id,device_id,result)
 values(p_request_id,p_pharmacy_id,auth.uid(),sid,s.id,nextid,p_device_id,result);
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.get_pharmflow_expiry_auth_session_v1(p_pharmacy_id uuid, p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare sid uuid:=pharmflow_expiry_private.valid_auth_session();s pharmflow_expiry_private.active_sessions_v1%rowtype;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'get_pharmflow_expiry_auth_session_v1',NULL);

 if public.is_pharmacy_member(p_pharmacy_id) is not true or nullif(btrim(p_device_id),'') is null then raise exception 'Pharmacy and device required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth-lifecycle/'||auth.uid()::text||'/'||sid::text,0));
 perform pharmflow_expiry_private.valid_auth_session();
 if exists(select 1 from pharmflow_expiry_private.closed_auth_sessions_v1 where created_by=auth.uid() and auth_session_id=sid) then raise exception 'Session closed; Sign In required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth/'||p_pharmacy_id::text||'/'||sid::text,0));
 select * into s from pharmflow_expiry_private.active_sessions_v1 where pharmacy_id=p_pharmacy_id and created_by=auth.uid() and auth_session_id=sid and closed_at is null;
 if not found then
  if exists(select 1 from pharmflow_expiry_private.active_sessions_v1 where pharmacy_id=p_pharmacy_id and created_by=auth.uid() and auth_session_id=sid) then raise exception 'Session closed; Sign In required';end if;
  insert into pharmflow_expiry_private.active_sessions_v1(id,pharmacy_id,created_by,device_id,auth_session_id,created_at)
  values(gen_random_uuid(),p_pharmacy_id,auth.uid(),p_device_id,sid,coalesce((select created_at from auth.sessions where id=sid),clock_timestamp())) returning * into s;
 end if;
 return jsonb_build_object('session_id',s.id,'auth_session_id',sid,'status','OPEN');
end $function$
;
CREATE OR REPLACE FUNCTION public.get_pharmflow_master_cache_page_v2(p_offset integer DEFAULT 0, p_limit integer DEFAULT 1000)
 RETURNS TABLE(item_code text, gtin text, item_name text, group_name text, category text, sub_category text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'get_pharmflow_master_cache_page_v2',NULL);

 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required';END IF;
 RETURN QUERY SELECT g.item_code,i.identifier_display,g.item_name,g.group_name,g.category,g.sub_category
 FROM public.pharmflow_global_item_identifiers_v2 i JOIN public.pharmflow_global_items_v2 g ON g.item_code=i.item_code
 WHERE i.identifier_display ~ '^[0-9]+$' ORDER BY i.identifier_key,i.id
 OFFSET greatest(coalesce(p_offset,0),0) LIMIT least(greatest(coalesce(p_limit,1000),1),2000);
END $function$
;
CREATE OR REPLACE FUNCTION public.count_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_workflow text DEFAULT 'RECEIVING'::text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_count integer;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),false,'count_pharmflow_needs_review_v2',NULL);

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    select count(*)::integer
      into v_count
      from (
        select r.gtin, coalesce(r.order_number,''), r.review_reason
          from public.pharmflow_needs_review_v2 r
         where r.pharmacy_id=p_pharmacy_id
           and r.status='PENDING'
           and r.workflow=upper(trim(coalesce(p_workflow,'RECEIVING')))
         group by r.gtin, coalesce(r.order_number,''), r.review_reason
      ) grouped_cases;

    return coalesce(v_count,0);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.select_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_filters jsonb, p_resolved boolean, p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare result jsonb; filters jsonb:=coalesce(p_filters,'{}'::jsonb);
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'select_pharmflow_expiry_inventory_v1',NULL);

  perform pharmflow_expiry_private.valid_auth_session();
  if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required'; end if;
  if p_filters is null or p_resolved is null or jsonb_typeof(filters)<>'object'
     or (filters ? 'groups' and jsonb_typeof(filters->'groups')<>'array')
     or (filters ? 'departments' and jsonb_typeof(filters->'departments')<>'array')
     or (filters ? 'operators' and (jsonb_typeof(filters->'operators')<>'array' or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(filters->'operators')='array' then filters->'operators' else '[]'::jsonb end) v where jsonb_typeof(v)<>'string')))
     or (filters ? 'months' and jsonb_typeof(filters->'months')<>'array')
     or (filters ? 'include_unassigned' and jsonb_typeof(filters->'include_unassigned')<>'boolean') then
    raise exception 'Invalid inventory query';
  end if;
  select jsonb_build_object('count',count(*),'units',coalesce(sum(r.quantity),0),
    'selection',coalesce(jsonb_agg(jsonb_build_object('id',r.row_id,'version',r.version) order by r.row_id),'[]'::jsonb))
  into result
  from pharmflow_expiry_private.inventory_rows_group_v1(p_pharmacy_id,p_resolved) r
  where pharmflow_expiry_private.inventory_match_v1(case when coalesce(jsonb_array_length(filters->'operators'),0)>0 then pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(r)) else to_jsonb(r) end,filters)
    and (p_ids is null or r.row_id=any(p_ids));
  return result;
end
$function$
;
CREATE OR REPLACE FUNCTION public.list_pharmflow_needs_review_history_v3(p_pharmacy_id uuid, p_workflow text DEFAULT 'RECEIVING'::text, p_order_number text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, workflow text, session_id text, order_number text, order_name text, gtin text, raw_barcode text, pending_quantity integer, review_reason text, master_item_code_hint text, master_item_name_hint text, photo_path text, source text, device_id text, status text, resolved_item_code text, resolved_item_name text, resolution_type text, resolution_transaction_id text, created_at timestamp with time zone, updated_at timestamp with time zone, resolved_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),false,'list_pharmflow_needs_review_history_v3',NULL);

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
 return query select r.id,r.workflow,coalesce(r.session_id,''),coalesce(r.order_number,''),coalesce(r.order_name,''),r.gtin,coalesce(r.raw_barcode,''),r.pending_quantity,r.review_reason,coalesce(r.master_item_code_hint,''),coalesce(r.master_item_name_hint,''),coalesce(r.photo_path,''),r.source,coalesce(r.device_id,''),r.status,coalesce(r.resolved_item_code,''),coalesce(r.resolved_item_name,''),coalesce(r.resolution_type,''),coalesce(r.resolution_transaction_id,''),r.created_at,r.updated_at,r.resolved_at from public.pharmflow_needs_review_v2 r where r.pharmacy_id=p_pharmacy_id and r.workflow=upper(trim(coalesce(p_workflow,'RECEIVING'))) and (nullif(trim(coalesce(p_order_number,'')),'') is null or coalesce(r.order_number,'')=trim(p_order_number)) order by r.updated_at desc,r.created_at desc;
end $function$
;
CREATE OR REPLACE FUNCTION public.assign_pharmflow_needs_review_order_v1(p_pharmacy_id uuid, p_review_id uuid, p_order_number text)
 RETURNS TABLE(success boolean, order_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_order text := btrim(coalesce(p_order_number,''));
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'assign_pharmflow_needs_review_order_v1',NULL);

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy admin access required';
  end if;
  perform 1 from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;


  select r.*
    into v_review
    from public.pharmflow_needs_review_v2 as r
   where r.id = p_review_id
     and r.pharmacy_id = p_pharmacy_id
   for update;

  if v_review.id is null or v_review.status <> 'PENDING' then
    raise exception 'Needs Review case is unavailable';
  end if;

  if nullif(v_order,'') is null
     or not (v_order = any(coalesce(v_review.work_scope_order_numbers,array[]::text[]))) then
    raise exception 'Order is outside the captured Receiving work scope';
  end if;

  if not exists (
    select 1
      from public.pharmflow_orders as o
     where o.pharmacy_id = p_pharmacy_id
       and o.order_number = v_order
       and o.status = 'uploaded'
  ) then
    raise exception 'Selected Order is unavailable';
  end if;

  update public.pharmflow_needs_review_v2 as r
     set order_number = v_order,
         order_name = v_order,
         updated_at = now(),
         resolution_block_code = null,
         resolution_block_detail = null
   where r.id = v_review.id;

  return query select true, v_order;
end
$function$
;
CREATE OR REPLACE FUNCTION public.request_pharmflow_needs_review_resolution_v4(p_operation_id uuid, p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text, p_resolution_transaction_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_review public.pharmflow_needs_review_v2%rowtype;
 v_existing public.pharmflow_needs_review_resolution_intents_v1%rowtype;
 v_item_code text:=btrim(coalesce(p_item_code,''));
 v_transaction_id text:=btrim(coalesce(p_resolution_transaction_id,''));
 v_item_name text:=btrim(coalesce(p_item_name,''));
 v_manifest jsonb;
 v_order_active boolean:=false;
 v_item_in_order boolean:=false;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'request_pharmflow_needs_review_resolution_v4',p_operation_id::text);

 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
  perform 1 from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;

 if p_operation_id is null or p_review_id is null or v_item_code='' or v_transaction_id='' then raise exception 'Operation, review, Item Code and Receiving transaction are required'; end if;
 select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where operation_id=p_operation_id;
 if v_existing.id is not null then
   if v_existing.pharmacy_id=p_pharmacy_id and v_existing.review_id=p_review_id and v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name then
     return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id);
   end if;
   raise exception 'Operation ID was already used for different resolution input';
 end if;
 select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id for update;
 if v_review.id is null then raise exception 'Needs Review case is unavailable'; end if;
 if v_review.status<>'PENDING' then return jsonb_build_object('success',v_review.status='RESOLVED','status',v_review.status,'reviewId',v_review.id); end if;
 if nullif(btrim(coalesce(v_review.order_number,'')),'') is null then return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE'); end if;

 select m.manifest into v_manifest from public.pharmflow_active_order_manifest_v1 m where m.pharmacy_id=p_pharmacy_id;
 if v_manifest is not null and coalesce((v_manifest->>'active')::boolean,false) then
   select exists(
     select 1 from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb)) x
     where coalesce(x->'orderNumbers','[]'::jsonb) ? v_review.order_number
   ) into v_order_active;
   select exists(
     select 1 from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb)) x
     where coalesce(x->'orderNumbers','[]'::jsonb) ? v_review.order_number
       and btrim(coalesce(x->>'itemCode',''))=v_item_code
   ) into v_item_in_order;
 end if;

 /* Backward-compatible fallback for workspaces that still persist source rows. */
 if not v_order_active then
   select exists(select 1 from public.pharmflow_orders o where o.pharmacy_id=p_pharmacy_id and o.order_number=v_review.order_number and o.status in ('uploaded','receiving'))
      or exists(select 1 from public.pharmflow_order_source_items s where s.pharmacy_id=p_pharmacy_id and s.order_number=v_review.order_number)
   into v_order_active;
 end if;
 if not v_item_in_order then
   select exists(select 1 from public.pharmflow_order_source_items s where s.pharmacy_id=p_pharmacy_id and s.order_number=v_review.order_number and s.item_code=v_item_code)
   into v_item_in_order;
 end if;

 if not v_order_active then return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE'); end if;
 if not v_item_in_order then return jsonb_build_object('success',false,'status','BLOCKED','code','ITEM_NOT_IN_ORIGINAL_ORDER'); end if;

 select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where pharmacy_id=p_pharmacy_id and review_id=p_review_id for update;
 if v_existing.id is not null then
   if v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name then
     return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id);
   end if;
   raise exception 'A different resolution intent already exists for this Needs Review case';
 end if;
 insert into public.pharmflow_needs_review_resolution_intents_v1(operation_id,pharmacy_id,review_id,transaction_id,item_code,item_name,requested_by)
 values(p_operation_id,p_pharmacy_id,p_review_id,v_transaction_id,v_item_code,v_item_name,auth.uid()) returning * into v_existing;
 return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id);
end $function$
;
CREATE OR REPLACE FUNCTION public.create_pharmflow_needs_review_v4(p_pharmacy_id uuid, p_workflow text, p_identifier_display text, p_raw_barcode text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_review_reason text DEFAULT 'UNKNOWN_GTIN'::text, p_master_item_code_hint text DEFAULT NULL::text, p_master_item_name_hint text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_device_id text DEFAULT NULL::text, p_work_scope_order_numbers text[] DEFAULT NULL::text[])
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_display text:=btrim(coalesce(p_identifier_display,''));v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);v_order text:=nullif(btrim(coalesce(p_order_number,'')),'');v_scope text[];v_id uuid;v_time timestamptz;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),true,'create_pharmflow_needs_review_v4',NULL);

if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
if v_key='' then raise exception 'Identifier is required';end if;
if upper(trim(coalesce(p_workflow,'RECEIVING'))) <> 'RECEIVING' then raise exception 'Invalid workflow';end if;
if upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))) not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason';end if;
if upper(btrim(coalesce(p_source,'HANDHELD'))) not in ('HANDHELD','PC') then raise exception 'Invalid source';end if;
select coalesce(array_agg(distinct btrim(x) order by btrim(x)),array[]::text[]) into v_scope from unnest(coalesce(p_work_scope_order_numbers,array[]::text[])) x where btrim(coalesce(x,''))<>'';
if v_order is not null and not(v_order=any(v_scope)) then v_scope:=array_append(v_scope,v_order);end if;
if coalesce(array_length(v_scope,1),0)=0 then raise exception 'Receiving work scope is required';end if;
if v_order is null and array_length(v_scope,1)=1 then v_order:=v_scope[1];end if;
if exists(select 1 from unnest(v_scope) s where not exists(select 1 from public.pharmflow_orders o where o.pharmacy_id=p_pharmacy_id and o.order_number=s and o.status='uploaded')) then raise exception 'Receiving work scope contains an unavailable Order';end if;
insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,session_id,order_number,order_name,gtin,raw_barcode,identifier_display,identifier_key,pending_quantity,review_reason,master_item_code_hint,master_item_name_hint,source,device_id,created_by,work_scope_order_numbers)
values(p_pharmacy_id,'RECEIVING',nullif(btrim(coalesce(p_session_id,'')),''),v_order,nullif(btrim(coalesce(p_order_name,'')),''),v_display,nullif(p_raw_barcode,''),v_display,v_key,1,upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),nullif(btrim(coalesce(p_master_item_code_hint,'')),''),nullif(btrim(coalesce(p_master_item_name_hint,'')),''),upper(btrim(coalesce(p_source,'HANDHELD'))),nullif(btrim(coalesce(p_device_id,'')),''),auth.uid(),v_scope) returning id,pharmflow_needs_review_v2.created_at into v_id,v_time;
return query select v_id,1,v_time;end $function$
;
CREATE OR REPLACE FUNCTION public.list_pharmacy_expiry_workers(p_pharmacy_id uuid)
 RETURNS TABLE(worker_id uuid, worker_name text, active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmacy_expiry_workers',NULL);

 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 -- Same lock used by existing management RPCs. Stable rows, not a client-only attribution.
 perform pg_advisory_xact_lock(hashtextextended('expiry-operators/'||p_pharmacy_id::text,0));
 with added as (
  insert into public.pharmflow_expiry_workers_v1 as inserted(pharmacy_id,worker_name,active,created_by,system_key)
  select p_pharmacy_id,v.name,true,auth.uid(),v.key from (values('Desktop','DESKTOP'),('Handheld','HANDHELD')) v(name,key)
  where not exists(select 1 from public.pharmflow_expiry_workers_v1 w where w.pharmacy_id=p_pharmacy_id and w.system_key=v.key)
  returning inserted.id,inserted.pharmacy_id,inserted.worker_name
 ) insert into pharmflow_expiry_private.operator_audit_v1(pharmacy_id,worker_id,actor,action,name)
 select a.pharmacy_id,a.id,auth.uid(),'ADD',a.worker_name from added a;
 return query select w.id,w.worker_name,w.active from public.pharmflow_expiry_workers_v1 w where w.pharmacy_id=p_pharmacy_id and w.active=true order by (w.system_key is null),lower(w.worker_name);
end $function$
;
CREATE OR REPLACE FUNCTION public.save_pharmflow_order_source_items_v2(p_pharmacy_id uuid, p_order_number text, p_items jsonb, p_replace boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_order_id uuid;v_count integer:=0;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_order_source_items_v2',NULL);

 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access required';end if;
 select id into v_order_id from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and upper(regexp_replace(order_number,'\\s','','g'))=upper(regexp_replace(p_order_number,'\\s','','g')) limit 1;if v_order_id is null then raise exception 'Order % is not registered',p_order_number;end if;
 if p_replace then if exists(select 1 from public.pharmflow_orders where id=v_order_id and status='received') then raise exception 'Received order source data is immutable';end if;delete from public.pharmflow_order_source_items where order_id=v_order_id;end if;
 insert into public.pharmflow_order_source_items(pharmacy_id,order_id,order_number,line_no,item_code,item_name,ordered_qty,group_name,category,sub_category,source_sheet,source_row)
 select p_pharmacy_id,v_order_id,upper(regexp_replace(trim(p_order_number),'\\s','','g')),(x->>'line_no')::integer,trim(x->>'item_code'),coalesce(x->>'item_name',''),(x->>'ordered_qty')::numeric,coalesce(x->>'group_name',''),coalesce(x->>'category',''),coalesce(x->>'sub_category',''),coalesce(x->>'source_sheet',''),nullif(x->>'source_row','')::integer from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where nullif(trim(x->>'item_code'),'') is not null and coalesce((x->>'ordered_qty')::numeric,0)>0
 on conflict(order_id,line_no) do update set item_code=excluded.item_code,item_name=excluded.item_name,ordered_qty=excluded.ordered_qty,group_name=excluded.group_name,category=excluded.category,sub_category=excluded.sub_category,source_sheet=excluded.source_sheet,source_row=excluded.source_row;
 get diagnostics v_count=row_count;return v_count;
end $function$
;
CREATE OR REPLACE FUNCTION public.get_pharmflow_order_source_items_v2(p_pharmacy_id uuid, p_order_number text)
 RETURNS SETOF pharmflow_order_source_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_order_source_items_v2',NULL);
RETURN QUERY select i.* from public.pharmflow_order_source_items i where i.pharmacy_id=p_pharmacy_id and upper(regexp_replace(i.order_number,'\\s','','g'))=upper(regexp_replace(p_order_number,'\\s','','g')) and auth.uid() is not null and public.is_pharmacy_admin(p_pharmacy_id) order by i.line_no;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.request_pharmflow_needs_review_resolution_v5(p_operation_id uuid, p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text, p_resolution_transaction_id text, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_review public.pharmflow_needs_review_v2%rowtype; v_existing public.pharmflow_needs_review_resolution_intents_v1%rowtype;
 v_item_code text:=btrim(coalesce(p_item_code,'')); v_transaction_id text:=btrim(coalesce(p_resolution_transaction_id,'')); v_item_name text:=btrim(coalesce(p_item_name,''));
 v_alloc jsonb; v_manifest jsonb; v_order text; v_qty integer; v_total integer:=0; v_item_in_order boolean; v_scope text[];
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'request_pharmflow_needs_review_resolution_v5',p_operation_id::text);

 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
  perform 1 from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;

 if p_operation_id is null or p_review_id is null or v_item_code='' or v_transaction_id='' then raise exception 'Operation, review, Item Code and Receiving transaction are required'; end if;
 if p_allocations is null or jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations)=0 then raise exception 'At least one Receiving allocation is required'; end if;
 if exists(select 1 from jsonb_array_elements(p_allocations) a(value) group by value->>'transactionId' having count(*)>1) then raise exception 'Each Receiving transaction can appear only once in an allocation'; end if;
 select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where operation_id=p_operation_id;
 if v_existing.id is not null then
   if v_existing.pharmacy_id=p_pharmacy_id and v_existing.review_id=p_review_id and v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name and v_existing.allocations=p_allocations then return public.try_finalize_pharmflow_needs_review_resolution_intent_v2(v_existing.id); end if;
   raise exception 'Operation ID was already used for different resolution input';
 end if;
 select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id for update;
 if v_review.id is null then raise exception 'Needs Review case is unavailable'; end if;
 if v_review.status<>'PENDING' then return jsonb_build_object('success',v_review.status='RESOLVED','status',v_review.status,'reviewId',v_review.id); end if;
 v_scope:=coalesce(v_review.work_scope_order_numbers,'{}'::text[]);
 if cardinality(v_scope)=0 and nullif(btrim(coalesce(v_review.order_number,'')),'') is not null then v_scope:=array[v_review.order_number]; end if;
 select m.manifest into v_manifest from public.pharmflow_active_order_manifest_v1 m where m.pharmacy_id=p_pharmacy_id;
 if v_manifest is null or not coalesce((v_manifest->>'active')::boolean,false) then return jsonb_build_object('success',false,'status','BLOCKED','code','ACTIVE_ORDER_MANIFEST_UNAVAILABLE'); end if;
 for v_alloc in select value from jsonb_array_elements(p_allocations) loop
   v_order:=btrim(coalesce(v_alloc->>'orderNumber','')); v_qty:=coalesce((v_alloc->>'quantity')::integer,0);
   if btrim(coalesce(v_alloc->>'transactionId',''))='' or v_order='' or v_qty<=0 then raise exception 'Invalid Needs Review allocation'; end if;
   if not (v_scope @> array[v_order]) then return jsonb_build_object('success',false,'status','BLOCKED','code','ORDER_OUTSIDE_CAPTURED_WORK_SCOPE'); end if;
   select exists(select 1 from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb)) x where coalesce(x->'orderNumbers','[]'::jsonb) ? v_order and btrim(coalesce(x->>'itemCode',''))=v_item_code) into v_item_in_order;
   if not v_item_in_order then return jsonb_build_object('success',false,'status','BLOCKED','code','ITEM_NOT_IN_ACTIVE_ORDER'); end if;
   v_total:=v_total+v_qty;
 end loop;
 if v_total<>v_review.pending_quantity then return jsonb_build_object('success',false,'status','BLOCKED','code','ALLOCATION_QUANTITY_MISMATCH'); end if;
 select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where pharmacy_id=p_pharmacy_id and review_id=p_review_id for update;
 if v_existing.id is not null then
   if v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name and v_existing.allocations=p_allocations then return public.try_finalize_pharmflow_needs_review_resolution_intent_v2(v_existing.id); end if;
   raise exception 'A different resolution intent already exists for this Needs Review case';
 end if;
 insert into public.pharmflow_needs_review_resolution_intents_v1(operation_id,pharmacy_id,review_id,transaction_id,item_code,item_name,resolution_type,requested_by,allocations)
 values(p_operation_id,p_pharmacy_id,p_review_id,v_transaction_id,v_item_code,v_item_name,'AUTO_ALLOCATED',auth.uid(),p_allocations) returning * into v_existing;
 return public.try_finalize_pharmflow_needs_review_resolution_intent_v2(v_existing.id);
end $function$
;
CREATE OR REPLACE FUNCTION public.export_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_filters jsonb, p_resolved boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare result jsonb; filters jsonb:=coalesce(p_filters,'{}'::jsonb);
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'export_pharmflow_expiry_inventory_v1',NULL);

  perform pharmflow_expiry_private.valid_auth_session();
  if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required'; end if;
  if p_filters is null or p_resolved is null or jsonb_typeof(filters)<>'object'
     or (filters ? 'groups' and jsonb_typeof(filters->'groups')<>'array')
     or (filters ? 'departments' and jsonb_typeof(filters->'departments')<>'array')
     or (filters ? 'operators' and (jsonb_typeof(filters->'operators')<>'array' or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(filters->'operators')='array' then filters->'operators' else '[]'::jsonb end) v where jsonb_typeof(v)<>'string')))
     or (filters ? 'months' and jsonb_typeof(filters->'months')<>'array')
     or (filters ? 'include_unassigned' and jsonb_typeof(filters->'include_unassigned')<>'boolean') then
    raise exception 'Invalid inventory query';
  end if;
  select coalesce(jsonb_agg(pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(x)) order by x.expiry_year,x.expiry_month,x.item_name,x.row_id),'[]'::jsonb)
  into result
  from pharmflow_expiry_private.inventory_rows_group_v1(p_pharmacy_id,p_resolved) x
  where pharmflow_expiry_private.inventory_match_v1(case when coalesce(jsonb_array_length(filters->'operators'),0)>0 then pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(x)) else to_jsonb(x) end,filters);
  return result;
end
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_all_filtered_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_request_id uuid, p_filters jsonb, p_selection jsonb, p_expected_count integer, p_expected_units bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  expected_payload jsonb := jsonb_build_object('action','RESOLVE','selection',p_selection,'quantity',null);
  prior pharmflow_expiry_private.inventory_requests_v1%rowtype;
  prior_scope pharmflow_expiry_private.filtered_inventory_requests_v1%rowtype;
  current_scope jsonb;
  remaining_scope jsonb;
  result jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'resolve_all_filtered_pharmflow_expiry_inventory_v1',p_request_id::text);

  perform pharmflow_expiry_private.valid_auth_session();
  if public.is_pharmacy_member(p_pharmacy_id) is not true then
    raise exception 'Pharmacy access required';
  end if;
  if p_request_id is null or p_filters is null or jsonb_typeof(p_filters)<>'object'
     or p_selection is null or jsonb_typeof(p_selection)<>'array'
     or p_expected_count is null or p_expected_count<1
     or p_expected_units is null or p_expected_units<0
     or jsonb_array_length(p_selection)<>p_expected_count then
    raise exception 'Invalid filtered resolve confirmation';
  end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_selection) x)<>p_expected_count
     or exists(select 1 from jsonb_array_elements(p_selection) x
               where jsonb_typeof(x)<>'object' or nullif(x->>'id','') is null or nullif(x->>'version','') is null) then
    raise exception 'Invalid filtered resolve selection';
  end if;

  -- Serialize retries with the existing mutation RPC's durable request lock.
  perform pg_advisory_xact_lock(hashtextextended('expiry-inventory-request/'||p_request_id::text,0));
  select * into prior from pharmflow_expiry_private.inventory_requests_v1 where request_id=p_request_id;
  if found then
    if prior.pharmacy_id<>p_pharmacy_id or prior.created_by<>auth.uid()
       or prior.payload is distinct from expected_payload then
      raise exception 'Request payload conflict';
    end if;
    select * into prior_scope from pharmflow_expiry_private.filtered_inventory_requests_v1 where request_id=p_request_id;
    if not found or prior_scope.pharmacy_id<>p_pharmacy_id or prior_scope.created_by<>auth.uid()
       or prior_scope.filters is distinct from p_filters
       or prior_scope.expected_count<>p_expected_count
       or prior_scope.expected_units<>p_expected_units then
      raise exception 'Request scope conflict';
    end if;
    return prior.result;
  end if;

  current_scope := public.select_pharmflow_expiry_inventory_v1(
    p_pharmacy_id,p_filters,false,null
  );
  if (current_scope->>'count')::integer is distinct from p_expected_count
     or (current_scope->>'units')::bigint is distinct from p_expected_units
     or current_scope->'selection' is distinct from p_selection then
    raise exception 'Filtered inventory changed; refresh and confirm again';
  end if;

  -- Reuse the established mutation contract for item locks, version checks,
  -- resolved snapshots, per-row events and durable idempotency.
  result := public.mutate_pharmflow_expiry_inventory_v1(
    p_pharmacy_id,p_request_id,'RESOLVE',p_selection,null
  );

  -- The existing mutation locks and versions only the submitted rows. A new
  -- matching inventory row can appear after the preflight selection without
  -- sharing any of those item locks. Recheck inside the same transaction;
  -- if any matching active row remains, raising rolls back the whole mutation
  -- (including its events and idempotency record) so the user must reconfirm.
  remaining_scope := public.select_pharmflow_expiry_inventory_v1(
    p_pharmacy_id,p_filters,false,null
  );
  if (remaining_scope->>'count')::integer is distinct from 0
     or (remaining_scope->>'units')::bigint is distinct from 0
     or remaining_scope->'selection' is distinct from '[]'::jsonb then
    raise exception 'Filtered inventory changed during resolution; refresh and confirm again';
  end if;

  insert into pharmflow_expiry_private.filtered_inventory_requests_v1(
    request_id,pharmacy_id,created_by,filters,expected_count,expected_units
  ) values (
    p_request_id,p_pharmacy_id,auth.uid(),p_filters,p_expected_count,p_expected_units
  );
  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_pharmflow_pharmacy_item_identifiers_v1(p_pharmacy_id uuid, p_item_code text)
 RETURNS TABLE(identifier_id uuid, identifier_display text, identifier_key text, mapping_revision bigint, item_code text, item_name text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',false,'list_pharmflow_pharmacy_item_identifiers_v1',NULL);

  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
    raise exception 'Pharmacy access required';
  end if;

  return query
  select
    m.id,
    m.identifier_display,
    m.identifier_key,
    m.mapping_revision,
    m.item_code,
    m.item_name,
    m.created_at,
    m.updated_at
  from public.pharmflow_pharmacy_gtin_v1 m
  where m.pharmacy_id = p_pharmacy_id
    and m.item_code = btrim(coalesce(p_item_code,''))
  order by m.created_at asc, m.identifier_key asc;
end
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_pharmflow_expiry_review_v2(p_pharmacy_id uuid, p_review_id uuid, p_operation_id uuid, p_item_code text, p_reason text, p_new_item jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
 r public.pharmflow_needs_review_v2%rowtype;
 item public.pharmflow_global_items_v2%rowtype;
 answer jsonb; global_result jsonb; can_global boolean;
 code text:=btrim(coalesce(p_item_code,'')); normalized_group text;
BEGIN
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'resolve_pharmflow_expiry_review_v2',p_operation_id::text);
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'resolve_pharmflow_expiry_review_v2',p_operation_id::text);

 IF auth.uid() IS NULL OR p_pharmacy_id IS NULL OR public.is_pharmacy_member(p_pharmacy_id) IS NOT TRUE THEN
  RAISE EXCEPTION 'Pharmacy access required';
 END IF;
 IF p_review_id IS NULL OR p_operation_id IS NULL OR code='' THEN RAISE EXCEPTION 'Review, operation and Item Code required'; END IF;
 SELECT * INTO r FROM public.pharmflow_needs_review_v2
  WHERE id=p_review_id AND pharmacy_id=p_pharmacy_id AND workflow='EXPIRY' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expiry review case not found in authorized pharmacy'; END IF;
 can_global:=public.pharmflow_is_reference_master_admin_v1() IS TRUE;
 IF p_new_item IS NOT NULL THEN
  IF NOT can_global THEN RAISE EXCEPTION 'Global Identifier write permission required'; END IF;
  IF jsonb_typeof(p_new_item) IS DISTINCT FROM 'object'
    OR NOT(p_new_item ?& ARRAY['item_name','group_name'])
    OR (SELECT count(*) FROM jsonb_object_keys(p_new_item))<>2
    OR jsonb_typeof(p_new_item->'item_name') IS DISTINCT FROM 'string'
    OR nullif(btrim(p_new_item->>'item_name'),'') IS NULL
    OR jsonb_typeof(p_new_item->'group_name') IS DISTINCT FROM 'string' THEN
   RAISE EXCEPTION 'Item Name and approved Group required';
  END IF;
  normalized_group:=public.pharmflow_normalize_main_group_v1(p_new_item->>'group_name');
  IF normalized_group IS NULL THEN RAISE EXCEPTION 'Select one of the six approved Groups'; END IF;
 END IF;
 -- Resolve retry before any Global effects, including retries from another mode.
 IF r.status='RESOLVED' THEN
  IF p_new_item IS NOT NULL THEN
   SELECT * INTO item FROM public.pharmflow_global_items_v2 WHERE item_code=code;
   IF NOT FOUND OR item.item_name IS DISTINCT FROM btrim(p_new_item->>'item_name')
      OR item.group_name IS DISTINCT FROM normalized_group THEN RAISE EXCEPTION 'Resolution payload conflict'; END IF;
  END IF;
  RETURN public.resolve_pharmflow_expiry_review_v1(p_pharmacy_id,p_review_id,p_operation_id,code,p_reason);
 END IF;
 IF r.status<>'PENDING' THEN RAISE EXCEPTION 'Only pending Expiry review cases may be resolved'; END IF;
 -- A reused operation cannot create/link before the V1 audit detects the conflict.
 IF EXISTS(SELECT 1 FROM public.pharmflow_expiry_review_resolution_audit_v1
   WHERE pharmacy_id=p_pharmacy_id AND operation_id=p_operation_id) THEN RAISE EXCEPTION 'Resolution operation already used'; END IF;
 -- Serialize both identifier creation paths before invoking either helper.
 PERFORM pg_advisory_xact_lock(hashtextextended(public.pharmflow_identifier_key_v2(
   coalesce(nullif(btrim(r.identifier_display),''),r.gtin)),1152));
 PERFORM pg_advisory_xact_lock(hashtextextended(public.pharmflow_identifier_key_v2(
   coalesce(nullif(btrim(r.identifier_display),''),r.gtin)),1153));
 IF p_new_item IS NOT NULL THEN
  global_result:=public.create_pharmflow_global_item_v2(p_operation_id,code,
    btrim(p_new_item->>'item_name'),normalized_group,NULL,NULL,
    coalesce(nullif(btrim(r.identifier_display),''),r.gtin),p_reason);
 ELSIF can_global THEN
  global_result:=public.add_pharmflow_global_identifier_v2(p_operation_id,
    coalesce(nullif(btrim(r.identifier_display),''),r.gtin),code,p_reason);
 END IF;
 answer:=public.resolve_pharmflow_expiry_review_v1(p_pharmacy_id,p_review_id,p_operation_id,code,p_reason);
 -- V1 reports the scope actually used, not an inference from caller privileges.
 RETURN answer||jsonb_build_object('global_item_created',p_new_item IS NOT NULL);
END $function$
;
CREATE OR REPLACE FUNCTION public.correct_pharmflow_global_identifier_v2(p_operation_id uuid, p_identifier_id uuid, p_expected_mapping_revision bigint, p_new_item_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
 v_old_item_code text; v_new_item_code text:=btrim(coalesce(p_new_item_code,''));
 v_reason text:=btrim(coalesce(p_reason,''));
begin
PERFORM pharmflow_auth_private.require_access(NULL,'GLOBAL',true,'correct_pharmflow_global_identifier_v2',p_operation_id::text);

 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required';end if;
  perform pg_advisory_xact_lock(hashtextextended(m.identifier_key,1152)) from public.pharmflow_global_item_identifiers_v2 m where m.id=p_identifier_id;
  perform pg_advisory_xact_lock(hashtextextended(m.identifier_key,1153)) from public.pharmflow_global_item_identifiers_v2 m where m.id=p_identifier_id;

 if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_new_item_code='' or v_reason='' then raise exception 'Operation, identifier, revision, item and reason are required';end if;
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id for update;
 if v_mapping.id is null then raise exception 'Identifier mapping is missing';end if;
 if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Identifier mapping changed; refresh before correcting';end if;
 if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_new_item_code) then raise exception 'Global Item Code does not exist';end if;
 v_old_item_code:=v_mapping.item_code;
 update public.pharmflow_global_item_identifiers_v2 set item_code=v_new_item_code,mapping_revision=mapping_revision+1,updated_at=now(),updated_by=auth.uid() where id=v_mapping.id returning * into v_mapping;
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
 values(p_operation_id,'CORRECT',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,v_old_item_code,v_mapping.item_code,v_reason,auth.uid());
 return jsonb_build_object('success',true,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'itemCode',v_mapping.item_code);
end $function$
;
CREATE OR REPLACE FUNCTION public.remove_pharmflow_global_identifier_v2(p_operation_id uuid, p_identifier_id uuid, p_expected_mapping_revision bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
 v_reason text:=btrim(coalesce(p_reason,''));
begin
PERFORM pharmflow_auth_private.require_access(NULL,'GLOBAL',true,'remove_pharmflow_global_identifier_v2',p_operation_id::text);

 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required';end if;
  perform pg_advisory_xact_lock(hashtextextended(m.identifier_key,1152)) from public.pharmflow_global_item_identifiers_v2 m where m.id=p_identifier_id;
  perform pg_advisory_xact_lock(hashtextextended(m.identifier_key,1153)) from public.pharmflow_global_item_identifiers_v2 m where m.id=p_identifier_id;

 if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_reason='' then raise exception 'Operation, identifier, revision and reason are required';end if;
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id for update;
 if v_mapping.id is null then raise exception 'Identifier mapping is missing';end if;
 if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Identifier mapping changed; refresh before removing';end if;
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
 values(p_operation_id,'REMOVE',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,v_mapping.item_code,null,v_reason,auth.uid());
 delete from public.pharmflow_global_item_identifiers_v2 where id=v_mapping.id;
 return jsonb_build_object('success',true,'removedIdentifierId',v_mapping.id,'itemCode',v_mapping.item_code);
end $function$
;
CREATE OR REPLACE FUNCTION public.correct_pharmflow_pharmacy_identifier_v2(p_operation_id uuid, p_pharmacy_id uuid, p_identifier_id uuid, p_expected_mapping_revision bigint, p_new_item_code text, p_new_item_name text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_code text := btrim(coalesce(p_new_item_code,'')); v_name text := btrim(coalesce(p_new_item_name,'')); v_reason text := btrim(coalesce(p_reason,''));
  v_audit public.pharmflow_pharmacy_identifier_mapping_audit_v2%rowtype; v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype; v_old_item_code text; v_result jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'correct_pharmflow_pharmacy_identifier_v2',p_operation_id::text);

  if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(m.identifier_key,1152)) from public.pharmflow_pharmacy_gtin_v1 m where m.id=p_identifier_id and m.pharmacy_id=p_pharmacy_id;
  perform pg_advisory_xact_lock(hashtextextended(m.identifier_key,1153)) from public.pharmflow_pharmacy_gtin_v1 m where m.id=p_identifier_id and m.pharmacy_id=p_pharmacy_id;

  if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_code='' or v_name='' or v_reason='' then raise exception 'Operation, mapping, revision, Item Code, Item Name and reason are required'; end if;
  select * into v_audit from public.pharmflow_pharmacy_identifier_mapping_audit_v2 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
  if v_audit.id is not null then
    if v_audit.action<>'CORRECT' or v_audit.mapping_id<>p_identifier_id or coalesce(v_audit.new_item_code,'')<>v_code then raise exception 'Operation ID was already used with different pharmacy mapping input'; end if;
    return v_audit.result;
  end if;
  select * into v_mapping from public.pharmflow_pharmacy_gtin_v1 where pharmacy_id=p_pharmacy_id and id=p_identifier_id for update;
  if v_mapping.id is null then raise exception 'Pharmacy identifier mapping not found'; end if;
  if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Pharmacy identifier mapping changed; reload before correcting'; end if;
  v_old_item_code:=v_mapping.item_code;
  update public.pharmflow_pharmacy_gtin_v1 set item_code=v_code,item_name=v_name,updated_by=auth.uid(),updated_at=now(),mapping_revision=mapping_revision+1 where id=v_mapping.id returning * into v_mapping;
  v_result:=jsonb_build_object('success',true,'scope','PHARMACY','action','CORRECT','identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'itemCode',v_mapping.item_code,'itemName',v_mapping.item_name);
  insert into public.pharmflow_pharmacy_identifier_mapping_audit_v2(pharmacy_id,operation_id,action,identifier_display,identifier_key,mapping_id,old_item_code,new_item_code,reason,result)
  values(p_pharmacy_id,p_operation_id,'CORRECT',v_mapping.identifier_display,v_mapping.identifier_key,v_mapping.id,v_old_item_code,v_code,v_reason,v_result);
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.append_pharmflow_learned_transaction_v4(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb, p_mapping_id uuid, p_mapping_revision bigint, p_mapping_scope text)
 RETURNS TABLE(acknowledged boolean, inserted boolean, authoritative_received bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
 v_scope text:=upper(btrim(coalesce(p_mapping_scope,'')));
 v_key text:=public.pharmflow_identifier_key_v2(p_gtin);
 v_kind text; v_existing public.pharmflow_receiving_transactions_v1%rowtype;
 v_mapping_id uuid; v_revision bigint; v_code text; v_ack record;
BEGIN
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'append_pharmflow_learned_transaction_v4',NULL);

 IF auth.uid() IS NULL OR NOT public.is_pharmacy_member(p_pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy access required'; END IF;
 IF v_scope NOT IN ('GLOBAL','PHARMACY') OR p_mapping_id IS NULL OR coalesce(p_mapping_revision,0)<=0
   OR coalesce(p_quantity,0)<=0 OR v_key='' OR nullif(btrim(p_transaction_id),'') IS NULL OR nullif(btrim(p_order_number),'') IS NULL THEN RAISE EXCEPTION 'Valid scoped learned receipt required'; END IF;
 v_kind:=CASE WHEN v_scope='GLOBAL' THEN 'GLOBAL_LEARNED' ELSE 'PHARMACY_LEARNED' END;
 IF (p_payload#>>'{gtinResolution,kind}') IS DISTINCT FROM v_kind
   OR (p_payload#>>'{gtinResolution,mappingId}') IS DISTINCT FROM p_mapping_id::text
   OR (p_payload#>>'{gtinResolution,mappingRevision}') IS DISTINCT FROM p_mapping_revision::text
   OR public.pharmflow_identifier_key_v2(p_payload#>>'{gtinResolution,identifierKey}')<>v_key
   OR public.pharmflow_receiving_item_code_v1(p_payload#>>'{gtinResolution,resolvedItemCode}') IS DISTINCT FROM public.pharmflow_receiving_item_code_v1(p_item_code) THEN RAISE EXCEPTION 'Learned receipt provenance mismatch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||btrim(p_order_number)||'|'||btrim(p_item_code),0));
 -- An acknowledged historical receipt remains retryable after a later mapping revision/removal.
 SELECT * INTO v_existing FROM public.pharmflow_receiving_transactions_v1 WHERE pharmacy_id=p_pharmacy_id AND transaction_id=btrim(p_transaction_id);
 IF FOUND THEN
   IF v_existing.order_number IS DISTINCT FROM btrim(p_order_number) OR v_existing.item_code IS DISTINCT FROM btrim(p_item_code)
     OR v_existing.quantity IS DISTINCT FROM p_quantity OR public.pharmflow_identifier_key_v2(v_existing.gtin)<>v_key
     OR (v_existing.payload#>'{gtinResolution}') IS DISTINCT FROM (p_payload#>'{gtinResolution}')
     OR coalesce(v_existing.payload->>'manual','false') IS DISTINCT FROM coalesce(p_payload->>'manual','false') THEN RAISE EXCEPTION 'Transaction ID input mismatch'; END IF;
   RETURN QUERY SELECT true,false,coalesce(sum(t.quantity),0)::bigint FROM public.pharmflow_receiving_transactions_v1 t WHERE t.pharmacy_id=p_pharmacy_id AND t.order_number=btrim(p_order_number) AND t.item_code=btrim(p_item_code);
   RETURN;
 END IF;
 PERFORM 1 FROM public.pharmflow_orders WHERE pharmacy_id=p_pharmacy_id AND order_number=btrim(p_order_number) AND status='uploaded' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Target Order unavailable'; END IF;
 LOCK TABLE public.pharmflow_pharmacy_gtin_v1 IN SHARE MODE;
 LOCK TABLE public.pharmflow_global_item_identifiers_v2 IN SHARE MODE;
 SELECT id,mapping_revision,item_code INTO v_mapping_id,v_revision,v_code FROM public.pharmflow_pharmacy_gtin_v1 WHERE pharmacy_id=p_pharmacy_id AND identifier_key=v_key;
 IF v_scope='GLOBAL' THEN
   -- A concurrently added Pharmacy override always wins; never receive against a lower-priority mapping.
   IF v_mapping_id IS NOT NULL THEN RAISE EXCEPTION 'Pharmacy override now exists; resolve identifier again'; END IF;
   SELECT id,mapping_revision,item_code INTO v_mapping_id,v_revision,v_code FROM public.pharmflow_global_item_identifiers_v2 WHERE identifier_key=v_key;
 END IF;
 IF v_mapping_id IS DISTINCT FROM p_mapping_id OR v_revision IS DISTINCT FROM p_mapping_revision OR public.pharmflow_receiving_item_code_v1(v_code) IS DISTINCT FROM public.pharmflow_receiving_item_code_v1(p_item_code) THEN RAISE EXCEPTION 'Mapping changed; resolve identifier again'; END IF;
 SELECT * INTO v_ack FROM public.append_pharmflow_receiving_action_v4(p_pharmacy_id,p_transaction_id,p_order_number,p_item_code,p_item_name,p_gtin,p_quantity,p_source,p_device_id,p_occurred_at,p_payload);
 SELECT * INTO v_existing FROM public.pharmflow_receiving_transactions_v1 WHERE pharmacy_id=p_pharmacy_id AND transaction_id=btrim(p_transaction_id);
 IF (v_existing.payload#>'{gtinResolution}') IS DISTINCT FROM (p_payload#>'{gtinResolution}') THEN RAISE EXCEPTION 'Concurrent receipt provenance mismatch'; END IF;
 RETURN QUERY SELECT v_ack.acknowledged,v_ack.inserted,v_ack.authoritative_received;
END $function$
;
CREATE OR REPLACE FUNCTION public.remove_pharmflow_pharmacy_identifier_v2(p_operation_id uuid, p_pharmacy_id uuid, p_identifier_id uuid, p_expected_mapping_revision bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_reason text := btrim(coalesce(p_reason,'')); v_audit public.pharmflow_pharmacy_identifier_mapping_audit_v2%rowtype;
  v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype; v_result jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'remove_pharmflow_pharmacy_identifier_v2',p_operation_id::text);

  if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(m.identifier_key,1152)) from public.pharmflow_pharmacy_gtin_v1 m where m.id=p_identifier_id and m.pharmacy_id=p_pharmacy_id;
  perform pg_advisory_xact_lock(hashtextextended(m.identifier_key,1153)) from public.pharmflow_pharmacy_gtin_v1 m where m.id=p_identifier_id and m.pharmacy_id=p_pharmacy_id;

  if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_reason='' then raise exception 'Operation, mapping, revision and reason are required'; end if;
  select * into v_audit from public.pharmflow_pharmacy_identifier_mapping_audit_v2 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
  if v_audit.id is not null then
    if v_audit.action<>'REMOVE' or v_audit.mapping_id<>p_identifier_id then raise exception 'Operation ID was already used with different pharmacy mapping input'; end if;
    return v_audit.result;
  end if;
  select * into v_mapping from public.pharmflow_pharmacy_gtin_v1 where pharmacy_id=p_pharmacy_id and id=p_identifier_id for update;
  if v_mapping.id is null then raise exception 'Pharmacy identifier mapping not found'; end if;
  if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Pharmacy identifier mapping changed; reload before removing'; end if;
  v_result:=jsonb_build_object('success',true,'scope','PHARMACY','action','REMOVE','identifierId',v_mapping.id,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'itemCode',v_mapping.item_code);
  delete from public.pharmflow_pharmacy_gtin_v1 where id=v_mapping.id;
  insert into public.pharmflow_pharmacy_identifier_mapping_audit_v2(pharmacy_id,operation_id,action,identifier_display,identifier_key,mapping_id,old_item_code,reason,result)
  values(p_pharmacy_id,p_operation_id,'REMOVE',v_mapping.identifier_display,v_mapping.identifier_key,v_mapping.id,v_mapping.item_code,v_reason,v_result);
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_pharmacy_expiry_worker(p_pharmacy_id uuid, p_worker_name text)
 RETURNS TABLE(worker_id uuid, worker_name text, active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare w public.pharmflow_expiry_workers_v1%rowtype;n text:=btrim(p_worker_name);
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmacy_expiry_worker',NULL);

 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true or public.is_pharmacy_admin(p_pharmacy_id) is not true then raise exception 'Pharmacy administrator required';end if;
 if n is null or length(n)<2 or length(n)>60 or n~'[[:cntrl:]]' then raise exception 'Enter an Operator name of 2 to 60 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-operators/'||p_pharmacy_id::text,0));
 select existing.* into w from public.pharmflow_expiry_workers_v1 existing where existing.pharmacy_id=p_pharmacy_id and lower(btrim(existing.worker_name))=lower(n);
 if found then if not w.active then raise exception 'Operator name already exists (inactive)';end if;return query select w.id,w.worker_name,w.active; return;end if;
 insert into public.pharmflow_expiry_workers_v1(pharmacy_id,worker_name,active,created_by) values(p_pharmacy_id,n,true,auth.uid()) returning * into w;
 insert into pharmflow_expiry_private.operator_audit_v1(pharmacy_id,worker_id,actor,action,name) values(p_pharmacy_id,w.id,auth.uid(),'ADD',n);
 return query select w.id,w.worker_name,w.active; return;
end $function$
;
CREATE OR REPLACE FUNCTION public.add_pharmflow_pharmacy_identifier_v2(p_operation_id uuid, p_pharmacy_id uuid, p_identifier_display text, p_item_code text, p_item_name text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_display text := btrim(coalesce(p_identifier_display,''));
  v_key text := public.pharmflow_identifier_key_v2(p_identifier_display);
  v_code text := btrim(coalesce(p_item_code,''));
  v_name text := btrim(coalesce(p_item_name,''));
  v_reason text := btrim(coalesce(p_reason,''));
  v_existing_audit public.pharmflow_pharmacy_identifier_mapping_audit_v2%rowtype;
  v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_result jsonb;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'add_pharmflow_pharmacy_identifier_v2',p_operation_id::text);

  if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
  perform pg_advisory_xact_lock(hashtextextended(v_key,1153));

  if p_operation_id is null or v_display='' or v_key='' or v_code='' or v_name='' or v_reason='' then raise exception 'Operation, identifier, Item Code, Item Name and reason are required'; end if;
  select * into v_existing_audit from public.pharmflow_pharmacy_identifier_mapping_audit_v2 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
  if v_existing_audit.id is not null then
    if v_existing_audit.action<>'ADD' or v_existing_audit.identifier_key<>v_key or coalesce(v_existing_audit.new_item_code,'')<>v_code then raise exception 'Operation ID was already used with different pharmacy mapping input'; end if;
    return v_existing_audit.result;
  end if;
  select * into v_mapping from public.pharmflow_pharmacy_gtin_v1 where pharmacy_id=p_pharmacy_id and identifier_key=v_key for update;
  if v_mapping.id is not null and v_mapping.item_code<>v_code then raise exception 'Identifier conflict: this pharmacy already mapped this identifier to Item Code %',v_mapping.item_code; end if;
  if v_mapping.id is null then
    insert into public.pharmflow_pharmacy_gtin_v1(pharmacy_id,gtin,identifier_display,identifier_key,item_code,item_name,source,created_by,updated_by)
    values(p_pharmacy_id,v_display,v_display,v_key,v_code,v_name,'PHARMACY_LEARNED',auth.uid(),auth.uid()) returning * into v_mapping;
  end if;
  v_result:=jsonb_build_object('success',true,'scope','PHARMACY','action','ADD','identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'itemCode',v_mapping.item_code,'itemName',v_mapping.item_name);
  insert into public.pharmflow_pharmacy_identifier_mapping_audit_v2(pharmacy_id,operation_id,action,identifier_display,identifier_key,mapping_id,new_item_code,reason,result)
  values(p_pharmacy_id,p_operation_id,'ADD',v_display,v_key,v_mapping.id,v_code,v_reason,v_result);
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.rename_pharmacy_expiry_worker(p_pharmacy_id uuid, p_worker_id uuid, p_worker_name text, p_expected_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare w public.pharmflow_expiry_workers_v1%rowtype;n text:=btrim(p_worker_name);old_name text;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'rename_pharmacy_expiry_worker',NULL);

 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true or public.is_pharmacy_admin(p_pharmacy_id) is not true then raise exception 'Pharmacy administrator required';end if;
 if n is null or length(n)<2 or length(n)>60 or n~'[[:cntrl:]]' then raise exception 'Enter an Operator name of 2 to 60 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-operators/'||p_pharmacy_id::text,0));
 select * into w from public.pharmflow_expiry_workers_v1 where id=p_worker_id and pharmacy_id=p_pharmacy_id for update;
 if not found or not w.active then raise exception 'Active pharmacy Operator required';end if;
 if w.worker_name=n then return to_jsonb(w);end if;
 if w.worker_name is distinct from p_expected_name then raise exception 'Operator changed; reload Settings';end if;
 if exists(select 1 from public.pharmflow_expiry_workers_v1 where pharmacy_id=p_pharmacy_id and id<>p_worker_id and lower(btrim(worker_name))=lower(n)) then raise exception 'Operator name already exists';end if;
 old_name:=w.worker_name;
 update public.pharmflow_expiry_workers_v1 set worker_name=n,updated_at=now() where id=w.id returning * into w;
 insert into pharmflow_expiry_private.operator_audit_v1(pharmacy_id,worker_id,actor,action,previous_name,name) values(p_pharmacy_id,w.id,auth.uid(),'RENAME',old_name,n);
 return to_jsonb(w);
end $function$
;
CREATE OR REPLACE FUNCTION public.deactivate_pharmacy_expiry_worker(p_pharmacy_id uuid, p_worker_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare w public.pharmflow_expiry_workers_v1%rowtype;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'deactivate_pharmacy_expiry_worker',NULL);

 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true or public.is_pharmacy_admin(p_pharmacy_id) is not true then raise exception 'Pharmacy administrator required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-operators/'||p_pharmacy_id::text,0));
 select * into w from public.pharmflow_expiry_workers_v1 where id=p_worker_id and pharmacy_id=p_pharmacy_id for update;
 if not found then return false;end if;
 if not w.active then return true;end if;
 update public.pharmflow_expiry_workers_v1 set active=false,updated_at=now() where id=w.id returning * into w;
 insert into pharmflow_expiry_private.operator_audit_v1(pharmacy_id,worker_id,actor,action,name) values(p_pharmacy_id,w.id,auth.uid(),'DEACTIVATE',w.worker_name);
 return true;
end $function$
;
CREATE OR REPLACE FUNCTION public.query_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_filters jsonb DEFAULT '{}'::jsonb, p_resolved boolean DEFAULT false, p_sort text DEFAULT 'ADDED'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare result jsonb; filters jsonb:=coalesce(p_filters,'{}'::jsonb);
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'query_pharmflow_expiry_inventory_v1',NULL);

  perform pharmflow_expiry_private.valid_auth_session();
  if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required'; end if;
  if p_filters is null or p_resolved is null or p_sort is null or p_offset is null or p_limit is null
     or p_limit not between 1 and 250 or p_offset<0 or jsonb_typeof(filters)<>'object'
     or p_sort not in ('ADDED','UPDATED','EXPIRY')
     or (filters ? 'groups' and jsonb_typeof(filters->'groups')<>'array')
     or (filters ? 'departments' and jsonb_typeof(filters->'departments')<>'array')
     or (filters ? 'operators' and (jsonb_typeof(filters->'operators')<>'array' or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(filters->'operators')='array' then filters->'operators' else '[]'::jsonb end) v where jsonb_typeof(v)<>'string')))
     or (filters ? 'months' and jsonb_typeof(filters->'months')<>'array')
     or (filters ? 'include_unassigned' and jsonb_typeof(filters->'include_unassigned')<>'boolean') then
    raise exception 'Invalid inventory query';
  end if;
  with rows as materialized (
    select * from pharmflow_expiry_private.inventory_rows_group_v1(p_pharmacy_id,p_resolved)
  ), matching as materialized (
    select * from rows r where pharmflow_expiry_private.inventory_match_v1(case when coalesce(jsonb_array_length(filters->'operators'),0)>0 then pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(r)) else to_jsonb(r) end,filters)
  ), page as (
    select * from matching order by
      case when p_sort='EXPIRY' then expiry_year*12+expiry_month end asc,
      case when p_sort='UPDATED' or p_resolved then updated_at end desc,
      case when p_sort='ADDED' and not p_resolved then added_at end desc,row_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(p))) from page p),'[]'::jsonb),
    'count',(select count(*) from matching),
    'units',(select coalesce(sum(quantity),0) from matching),
    'departments',(select coalesce(jsonb_agg(d order by d),'[]'::jsonb) from (select distinct department d from rows) v),
    'groups',jsonb_build_array('Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement'),
    'has_unassigned_group',(select exists(select 1 from rows where group_name is null)),
    'operators',(select coalesce(jsonb_agg(v.name order by v.name),'[]'::jsonb) from (select distinct f.operator_name name from rows r join pharmflow_expiry_private.first_operator_v1 f on f.state_id=r.state_id and f.pharmacy_id=p_pharmacy_id where nullif(btrim(f.operator_name),'') is not null) v),
    'months',(select coalesce(jsonb_agg(m order by m),'[]'::jsonb) from (select distinct expiry_year::text||'-'||lpad(expiry_month::text,2,'0') m from rows) v)
  ) into result;
  return result;
end
$function$
;
CREATE OR REPLACE FUNCTION public.quick_add_pharmflow_order_item_v1(p_operation_id uuid, p_pharmacy_id uuid, p_source_order text, p_work_scope_order_numbers text[], p_item_code text, p_item_name text, p_group_name text, p_identifier_display text, p_quantity integer, p_allow_over_receiving boolean DEFAULT false, p_capture jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
 v_scope text[];v_request jsonb;v_base text:='QUICK_ADD_V1:'||p_operation_id::text;
 v_first public.pharmflow_receiving_transactions_v1%rowtype;
 v_item public.pharmflow_global_items_v2%rowtype;
 v_mapping jsonb;v_resolution jsonb;v_payload jsonb;v_ack record;v_receipts jsonb;
 v_matches text[];v_created boolean:=false;v_ordered numeric;v_received bigint;
 v_code text:=public.pharmflow_receiving_item_code_v1(p_item_code);
 v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
BEGIN
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'quick_add_pharmflow_order_item_v1',p_operation_id::text);
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'quick_add_pharmflow_order_item_v1',p_operation_id::text);

 IF auth.uid() IS NULL OR NOT public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy ADMIN permission is required to link an identifier'; END IF;
 IF p_operation_id IS NULL OR v_code='' OR nullif(btrim(p_item_name),'') IS NULL OR v_key='' OR coalesce(p_quantity,0)<1 THEN RAISE EXCEPTION 'Operation, selected Order item, identifier and positive quantity required'; END IF;
 IF jsonb_typeof(coalesce(p_capture,'{}'::jsonb))<>'object' OR octet_length(coalesce(p_capture,'{}'::jsonb)::text)>32768 THEN RAISE EXCEPTION 'Invalid scan capture'; END IF;
 SELECT coalesce(array_agg(DISTINCT btrim(o) ORDER BY btrim(o)),ARRAY[]::text[]) INTO v_scope FROM unnest(coalesce(p_work_scope_order_numbers,ARRAY[]::text[])) o WHERE btrim(coalesce(o,''))<>'';
 IF NOT coalesce(btrim(p_source_order)=ANY(v_scope),false) THEN RAISE EXCEPTION 'Selected row Order must belong to original work scope'; END IF;
 v_request:=jsonb_build_object('sourceOrder',btrim(p_source_order),'scope',to_jsonb(v_scope),'itemCode',btrim(p_item_code),'itemName',btrim(p_item_name),
   'group',btrim(coalesce(p_group_name,'')),'identifierDisplay',btrim(p_identifier_display),'quantity',p_quantity,'allowOverReceiving',coalesce(p_allow_over_receiving,false),
   'capture',jsonb_build_object('lot',coalesce(p_capture->>'lot',''),'expiry',coalesce(p_capture->>'expiry',''),'serial',coalesce(p_capture->>'serial',''),'raw',coalesce(p_capture->>'raw',''),'deviceId',coalesce(p_capture->>'deviceId',''),'deviceType',upper(coalesce(p_capture->>'deviceType','PC')),'occurredAt',coalesce(p_capture->>'occurredAt','')));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||p_operation_id::text,61023));
 SELECT * INTO v_first FROM public.pharmflow_receiving_transactions_v1 WHERE pharmacy_id=p_pharmacy_id AND transaction_id=v_base;
 IF FOUND THEN
   IF (v_first.payload#>'{quickAdd,request}') IS DISTINCT FROM v_request OR v_first.quantity<>p_quantity
     OR v_first.order_number IS DISTINCT FROM btrim(p_source_order) OR public.pharmflow_receiving_item_code_v1(v_first.item_code)<>v_code
     OR public.pharmflow_identifier_key_v2(v_first.gtin)<>v_key THEN RAISE EXCEPTION 'Quick Add operation already used with different input'; END IF;
   RETURN jsonb_build_object('success',true,'idempotent',true,'pharmacyId',p_pharmacy_id,'operationId',p_operation_id,'receipts',jsonb_build_array(to_jsonb(v_first)));
 END IF;
 -- Scope headers and durable source data establish receiving context, never Master identity.
 PERFORM 1 FROM public.pharmflow_orders WHERE pharmacy_id=p_pharmacy_id AND order_number=ANY(v_scope) ORDER BY order_number FOR SHARE;
 IF EXISTS(SELECT 1 FROM unnest(v_scope) o WHERE NOT EXISTS(SELECT 1 FROM public.pharmflow_orders h WHERE h.pharmacy_id=p_pharmacy_id AND h.order_number=o AND h.status='uploaded')) THEN RAISE EXCEPTION 'Original selected Orders are unavailable'; END IF;
 PERFORM 1 FROM public.pharmflow_order_source_items s WHERE s.pharmacy_id=p_pharmacy_id AND s.order_number=btrim(p_source_order)
   AND public.pharmflow_receiving_item_code_v1(s.item_code)=v_code AND btrim(s.item_name)=btrim(p_item_name);
 IF NOT FOUND THEN RAISE EXCEPTION 'Selected Order row changed or is unavailable; select it again'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||btrim(p_source_order)||'|'||v_code,0));
 SELECT coalesce(sum(s.ordered_qty),0) INTO v_ordered FROM public.pharmflow_order_source_items s WHERE s.pharmacy_id=p_pharmacy_id AND s.order_number=btrim(p_source_order) AND public.pharmflow_receiving_item_code_v1(s.item_code)=v_code;
 SELECT coalesce(sum(t.quantity),0) INTO v_received FROM public.pharmflow_receiving_transactions_v1 t WHERE t.pharmacy_id=p_pharmacy_id AND t.order_number=btrim(p_source_order) AND public.pharmflow_receiving_item_code_v1(t.item_code)=v_code;
 IF NOT coalesce(p_allow_over_receiving,false) AND p_quantity>greatest(0,v_ordered-v_received) THEN RAISE EXCEPTION 'Quantity exceeds the selected Order remaining quantity'; END IF;
 -- All order/quantity validation precedes Master creation. These short administration locks
 -- also serialize legacy Settings writers which do not share the new advisory key.
 LOCK TABLE public.pharmflow_pharmacy_gtin_v1 IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.pharmflow_global_item_identifiers_v2 IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.pharmflow_global_items_v2 IN SHARE ROW EXCLUSIVE MODE;
 SELECT array_agg(x.item_code ORDER BY x.item_code) INTO v_matches FROM
   (SELECT gi.item_code FROM public.pharmflow_global_items_v2 gi WHERE public.pharmflow_receiving_item_code_v1(gi.item_code)=v_code LIMIT 2) x;
 IF cardinality(v_matches)>1 THEN RAISE EXCEPTION 'Canonical Item Code is ambiguous in Global Master; ask a Global Master administrator'; END IF;
 IF coalesce(cardinality(v_matches),0)=0 THEN
   -- Mapping permission is NOT Global item-creation permission.
   IF NOT public.pharmflow_is_reference_master_admin_v1() THEN
     RETURN jsonb_build_object('success',false,'code','GLOBAL_CREATION_PERMISSION_REQUIRED','message','Global Master creation permission required. Save for Review or ask a Global Master administrator.');
   END IF;
   IF public.pharmflow_normalize_main_group_v1(p_group_name) IS NULL THEN RAISE EXCEPTION 'Select one of the approved Groups to create the item'; END IF;
   IF EXISTS(SELECT 1 FROM public.pharmflow_pharmacy_gtin_v1 g WHERE g.pharmacy_id=p_pharmacy_id AND g.identifier_key=v_key) THEN RAISE EXCEPTION 'Identifier is now recognized for this pharmacy. Return to Receiving and scan again.'; END IF;
   -- Reuse the exact Settings contract, including its canonical Group and Global-write checks.
   -- This contract necessarily creates a Global mapping; it is invoked ONLY with Global creation/write permission.
   PERFORM public.create_pharmflow_global_item_v2(p_operation_id,v_code,btrim(p_item_name),p_group_name,NULL,NULL,p_identifier_display,'Receiving Order Quick Add');
   SELECT * INTO v_item FROM public.pharmflow_global_items_v2 WHERE item_code=v_code;
   v_created:=true;
 ELSE
   SELECT * INTO v_item FROM public.pharmflow_global_items_v2 WHERE item_code=v_matches[1];
   -- Existing Master name/Group are authoritative and never overwritten from an Order.
 END IF;
 v_mapping:=public.learn_pharmflow_existing_identifier_v3(p_operation_id,p_pharmacy_id,p_identifier_display,v_item.item_code,'Receiving Order Quick Add');
 v_resolution:=jsonb_build_object('contractVersion',4,'kind',CASE WHEN v_mapping->>'mappingScope'='GLOBAL' THEN 'GLOBAL_LEARNED' ELSE 'PHARMACY_LEARNED' END,
   'mappingId',v_mapping->>'identifierId','mappingRevision',v_mapping->'mappingRevision','identifierDisplay',v_mapping->>'identifierDisplay','identifierKey',v_mapping->>'identifierKey','resolvedItemCode',v_mapping->>'itemCode');
 v_payload:=jsonb_build_object('transactionId',v_base,'orderId',btrim(p_source_order),'selectedOrderNumber',btrim(p_source_order),'itemCode',v_code,'itemName',v_item.item_name,
   'gtin',btrim(p_identifier_display),'quantity',p_quantity,'manual',false,'source','SCANNER','deviceId',coalesce(p_capture->>'deviceId',''),'deviceType',upper(coalesce(p_capture->>'deviceType','PC')),'lot',coalesce(p_capture->>'lot',''),'expiry',coalesce(p_capture->>'expiry',''),'serial',coalesce(p_capture->>'serial',''),
   'gtinResolution',v_resolution,'quickAdd',jsonb_build_object('operationId',p_operation_id,'request',v_request,'masterCreated',v_created));
 SELECT * INTO v_ack FROM public.append_pharmflow_learned_transaction_v4(p_pharmacy_id,v_base,btrim(p_source_order),v_code,v_item.item_name,btrim(p_identifier_display),p_quantity,'SCANNER',coalesce(p_capture->>'deviceId',''),coalesce(nullif(p_capture->>'occurredAt','')::timestamptz,now()),v_payload,
   (v_mapping->>'identifierId')::uuid,(v_mapping->>'mappingRevision')::bigint,v_mapping->>'mappingScope');
 IF v_ack.acknowledged IS DISTINCT FROM true THEN RAISE EXCEPTION 'Quick Add receipt was not acknowledged'; END IF;
 SELECT jsonb_agg(to_jsonb(t)) INTO v_receipts FROM public.pharmflow_receiving_transactions_v1 t WHERE t.pharmacy_id=p_pharmacy_id AND t.transaction_id=v_base;
 RETURN jsonb_build_object('success',true,'idempotent',false,'pharmacyId',p_pharmacy_id,'operationId',p_operation_id,'masterCreated',v_created,'receipts',v_receipts);
 -- Any failure rolls back Master creation, mapping audit and Receiving receipt together.
END $function$
;
CREATE OR REPLACE FUNCTION public.append_pharmflow_receiving_action_v4(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb)
 RETURNS TABLE(acknowledged boolean, inserted boolean, authoritative_received bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_existing public.pharmflow_receiving_transactions_v1%rowtype;
  v_inserted boolean:=false;
  v_intent_id uuid;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'append_pharmflow_receiving_action_v4',NULL);

 if auth.uid() is null or not public.pharmflow_receiving_member_v2(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
 if nullif(trim(coalesce(p_transaction_id,'')),'') is null then raise exception 'Transaction ID required';end if;
 if nullif(trim(coalesce(p_item_code,'')),'') is null then raise exception 'Item Code required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||coalesce(trim(p_order_number),'')||'|'||trim(p_item_code),0));
 select * into v_existing from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and transaction_id=trim(p_transaction_id);
 if found then
  if coalesce(v_existing.order_number,'')<>coalesce(nullif(trim(coalesce(p_order_number,'')),''),'') or v_existing.item_code<>trim(p_item_code) or v_existing.quantity<>coalesce(p_quantity,0) or coalesce(v_existing.gtin,'')<>coalesce(p_gtin,'') then raise exception 'Transaction ID content mismatch';end if;
 else
  insert into public.pharmflow_receiving_transactions_v1(pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload,created_by)
  values(p_pharmacy_id,trim(p_transaction_id),nullif(trim(coalesce(p_order_number,'')),''),trim(p_item_code),coalesce(p_item_name,''),coalesce(p_gtin,''),coalesce(p_quantity,0),coalesce(p_source,'RECEIVING'),coalesce(p_device_id,''),coalesce(p_occurred_at,now()),coalesce(p_payload,'{}'::jsonb),auth.uid());
  v_inserted:=true;
 end if;
 for v_intent_id in select id from public.pharmflow_needs_review_resolution_intents_v1 where pharmacy_id=p_pharmacy_id and transaction_id=trim(p_transaction_id) and status='PENDING' loop
   begin
     perform public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_intent_id);
   exception when others then
     begin
       update public.pharmflow_needs_review_resolution_intents_v1 set helper_failure_code=SQLSTATE,helper_failure_detail=SQLERRM,helper_failure_at=now(),helper_failure_count=helper_failure_count+1,updated_at=now() where id=v_intent_id and status='PENDING';
     exception when others then
       raise warning 'Needs Review intent helper failed after Receiving receipt %, and failure state could not be recorded: %',trim(p_transaction_id),SQLERRM;
     end;
     raise warning 'Needs Review intent helper failed after Receiving receipt %: %',trim(p_transaction_id),SQLERRM;
   end;
 end loop;
 return query select true,v_inserted,coalesce(sum(t.quantity),0)::bigint from public.pharmflow_receiving_transactions_v1 t where t.pharmacy_id=p_pharmacy_id and t.item_code=trim(p_item_code) and coalesce(t.order_number,'')=coalesce(nullif(trim(coalesce(p_order_number,'')),''),'');
end $function$
;
CREATE OR REPLACE FUNCTION public.learn_pharmflow_existing_identifier_v3(p_operation_id uuid, p_pharmacy_id uuid, p_identifier_display text, p_item_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
 v_code text:=btrim(coalesce(p_item_code,''));
 v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
 v_local public.pharmflow_pharmacy_gtin_v1%rowtype;
 v_global public.pharmflow_global_item_identifiers_v2%rowtype;
 v_item public.pharmflow_global_items_v2%rowtype;
 v_result jsonb; v_audit record; v_completed_operation boolean:=false;
BEGIN
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'learn_pharmflow_existing_identifier_v3',p_operation_id::text);

 IF auth.uid() IS NULL OR NOT public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy ADMIN access required'; END IF;
 IF p_operation_id IS NULL OR v_key='' OR v_code='' OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Operation, identifier, Master code and reason required'; END IF;
 -- Match the supplied authoritative Master code exactly. Order normalization never changes identifier keys.
 SELECT * INTO v_item FROM public.pharmflow_global_items_v2 WHERE item_code=v_code FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Existing Global Master item required; use the separate Group-validated creation contract'; END IF;
 -- Low-volume administration only. These locks also exclude legacy writers that do not share advisory locks.
 -- One lock order for scope checks; conflicts time out rather than silently remapping an identifier.
 LOCK TABLE public.pharmflow_pharmacy_gtin_v1 IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.pharmflow_global_item_identifiers_v2 IN SHARE ROW EXCLUSIVE MODE;
 FOR v_audit IN
   SELECT identifier_key,new_item_code,action FROM public.pharmflow_identifier_mapping_audit_v1 WHERE operation_id=p_operation_id
   UNION ALL
   SELECT identifier_key,new_item_code,action FROM public.pharmflow_pharmacy_identifier_mapping_audit_v2 WHERE operation_id=p_operation_id AND pharmacy_id=p_pharmacy_id
 LOOP
   v_completed_operation:=true;
   IF v_audit.identifier_key<>v_key OR v_audit.new_item_code IS DISTINCT FROM v_code OR v_audit.action<>'ADD' THEN RAISE EXCEPTION 'Operation ID input mismatch'; END IF;
 END LOOP;
 SELECT * INTO v_local FROM public.pharmflow_pharmacy_gtin_v1 WHERE pharmacy_id=p_pharmacy_id AND identifier_key=v_key FOR UPDATE;
 IF FOUND THEN
   IF v_local.item_code<>v_code THEN RAISE EXCEPTION 'Identifier conflicts with an existing Pharmacy override'; END IF;
   -- Preserve an intentional override, including one differing from a lower-priority Global mapping.
   v_result:=jsonb_build_object('mappingScope','PHARMACY','identifierId',v_local.id,'mappingRevision',v_local.mapping_revision);
 ELSE
   SELECT * INTO v_global FROM public.pharmflow_global_item_identifiers_v2 WHERE identifier_key=v_key FOR UPDATE;
   IF FOUND AND v_global.item_code<>v_code THEN RAISE EXCEPTION 'Identifier conflicts with an existing Global mapping'; END IF;
   IF v_global.id IS NOT NULL THEN
     v_result:=jsonb_build_object('mappingScope','GLOBAL','identifierId',v_global.id,'mappingRevision',v_global.mapping_revision);
   ELSIF v_completed_operation THEN
     RAISE EXCEPTION 'Completed mapping operation cannot recreate a removed mapping; resolve again';
   ELSIF public.pharmflow_is_reference_master_admin_v1() THEN
     v_result:=public.add_pharmflow_global_identifier_v2(p_operation_id,p_identifier_display,v_code,p_reason)||jsonb_build_object('mappingScope','GLOBAL');
   ELSE
     v_result:=public.add_pharmflow_pharmacy_identifier_v2(p_operation_id,p_pharmacy_id,p_identifier_display,v_code,v_item.item_name,p_reason)||jsonb_build_object('mappingScope','PHARMACY');
   END IF;
 END IF;
 RETURN v_result||jsonb_build_object('success',true,'itemCode',v_item.item_code,'itemName',v_item.item_name,'groupName',v_item.group_name,
   'identifierDisplay',btrim(p_identifier_display),'identifierKey',v_key,'globalItemCreated',false);
END $function$
;
CREATE OR REPLACE FUNCTION public.create_pharmflow_needs_review_v6(p_operation_id text, p_pharmacy_id uuid, p_workflow text, p_identifier_display text, p_raw_barcode text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_review_reason text DEFAULT 'UNKNOWN_GTIN'::text, p_master_item_code_hint text DEFAULT NULL::text, p_master_item_name_hint text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_device_id text DEFAULT NULL::text, p_work_scope_order_numbers text[] DEFAULT NULL::text[], p_pending_quantity integer DEFAULT 1)
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '3s'
AS $function$
declare v_operation text:=nullif(btrim(coalesce(p_operation_id,'')),'');v_display text:=btrim(coalesce(p_identifier_display,''));v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);v_order text:=nullif(btrim(coalesce(p_order_number,'')),'');v_scope text[];v_id uuid;v_time timestamptz;v_qty integer;v_status text;v_request jsonb;v_existing_request jsonb;v_actor uuid;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),true,'create_pharmflow_needs_review_v6',p_operation_id::text);

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
 if v_operation is null then raise exception 'Operation ID is required';end if;
 if v_key='' then raise exception 'Identifier is required';end if;
 if upper(trim(coalesce(p_workflow,'RECEIVING')))<>'RECEIVING' then raise exception 'Invalid workflow';end if;
 if upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))) not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason';end if;
 if upper(btrim(coalesce(p_source,'HANDHELD'))) not in ('HANDHELD','PC') then raise exception 'Invalid source';end if;

 select coalesce(array_agg(distinct btrim(x) order by btrim(x)),array[]::text[]) into v_scope from unnest(coalesce(p_work_scope_order_numbers,array[]::text[])) x where btrim(coalesce(x,''))<>'';
 if v_order is not null and not(v_order=any(v_scope)) then v_scope:=array_append(v_scope,v_order);end if;
 if coalesce(array_length(v_scope,1),0)=0 then raise exception 'Receiving work scope is required';end if;
 if v_order is null and array_length(v_scope,1)=1 then v_order:=v_scope[1];end if;


 IF p_pending_quantity IS NULL OR p_pending_quantity<1 THEN RAISE EXCEPTION 'Positive integer quantity required'; END IF;
 v_request:=jsonb_build_object('workflow','RECEIVING','identifierDisplay',v_display,'rawBarcode',coalesce(p_raw_barcode,''),
   'sessionId',btrim(coalesce(p_session_id,'')),'orderNumber',v_order,'orderName',btrim(coalesce(p_order_name,'')),
   'reason',upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),'itemCodeHint',btrim(coalesce(p_master_item_code_hint,'')),
   'itemNameHint',btrim(coalesce(p_master_item_name_hint,'')),'source',upper(btrim(coalesce(p_source,'HANDHELD'))),
   'deviceId',btrim(coalesce(p_device_id,'')),'scope',to_jsonb(v_scope),'quantity',p_pending_quantity);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||v_operation,61021));
 SELECT r.id,r.pending_quantity,r.created_at,r.status,r.receiving_capture_request,r.created_by
 INTO v_id,v_qty,v_time,v_status,v_existing_request,v_actor FROM public.pharmflow_needs_review_v2 r
 WHERE r.pharmacy_id=p_pharmacy_id AND r.operation_id=v_operation FOR UPDATE;
 IF FOUND THEN
   IF v_existing_request IS DISTINCT FROM v_request OR v_actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Operation ID was already used with different capture input or owner'; END IF;
   RETURN QUERY SELECT v_id,v_qty,v_time,v_status; RETURN;
 END IF;

 if exists(select 1 from unnest(v_scope) s where not exists(select 1 from public.pharmflow_orders o where o.pharmacy_id=p_pharmacy_id and o.order_number=s and o.status='uploaded')) then raise exception 'Receiving work scope contains an unavailable Order';end if;
 begin
  insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,session_id,order_number,order_name,gtin,raw_barcode,identifier_display,identifier_key,pending_quantity,review_reason,master_item_code_hint,master_item_name_hint,source,device_id,created_by,work_scope_order_numbers,operation_id,receiving_capture_request)
  values(p_pharmacy_id,'RECEIVING',nullif(btrim(coalesce(p_session_id,'')),''),v_order,nullif(btrim(coalesce(p_order_name,'')),''),v_display,nullif(p_raw_barcode,''),v_display,v_key,p_pending_quantity,upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),nullif(btrim(coalesce(p_master_item_code_hint,'')),''),nullif(btrim(coalesce(p_master_item_name_hint,'')),''),upper(btrim(coalesce(p_source,'HANDHELD'))),nullif(btrim(coalesce(p_device_id,'')),''),auth.uid(),v_scope,v_operation,v_request)
  returning id,pharmflow_needs_review_v2.pending_quantity,pharmflow_needs_review_v2.created_at,pharmflow_needs_review_v2.status into v_id,v_qty,v_time,v_status;

 end;
 return query select v_id,v_qty,v_time,v_status;
end;$function$
;
CREATE OR REPLACE FUNCTION public.set_pharmflow_needs_review_qty_v3(p_pharmacy_id uuid, p_review_id uuid, p_pending_quantity integer)
 RETURNS TABLE(review_id uuid, pending_quantity integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '3s'
AS $function$
BEGIN
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'set_pharmflow_needs_review_qty_v3',NULL);

 IF auth.uid() IS NULL OR NOT public.is_pharmacy_member(p_pharmacy_id) THEN RAISE EXCEPTION 'Pharmacy access required'; END IF;
 IF p_pending_quantity IS NULL OR p_pending_quantity<1 THEN RAISE EXCEPTION 'Positive integer quantity required'; END IF;
 PERFORM 1 FROM public.pharmflow_needs_review_v2 r WHERE r.id=p_review_id AND r.pharmacy_id=p_pharmacy_id AND r.workflow='RECEIVING' AND r.status='PENDING' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending Receiving review required'; END IF;
 IF EXISTS(SELECT 1 FROM public.pharmflow_needs_review_resolution_intents_v1 i WHERE i.pharmacy_id=p_pharmacy_id AND i.review_id=p_review_id) THEN RAISE EXCEPTION 'Quantity is locked after a resolution request'; END IF;
 RETURN QUERY UPDATE public.pharmflow_needs_review_v2 r SET pending_quantity=p_pending_quantity,updated_at=now()
 WHERE r.id=p_review_id AND r.pharmacy_id=p_pharmacy_id RETURNING r.id,r.pending_quantity,r.updated_at;
END $function$
;
CREATE OR REPLACE FUNCTION public.save_pharmflow_active_order_manifest_v4(p_pharmacy_id uuid, p_manifest jsonb, p_expected_generation bigint, p_expected_revision bigint)
 RETURNS TABLE(revision bigint, updated_at timestamp with time zone, order_files integer, order_items integer, workspace_generation bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_files integer;
    v_items integer;
    v_generation bigint;
    v_revision bigint;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_active_order_manifest_v4',NULL);

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation)
    values(p_pharmacy_id,0)
    on conflict(pharmacy_id) do nothing;

    select g.generation
      into v_generation
      from public.pharmflow_workspace_generation_v1 g
     where g.pharmacy_id=p_pharmacy_id
     for update;

    if coalesce(p_expected_generation,-1) <> coalesce(v_generation,0) then
        raise exception 'STALE_WORKSPACE_GENERATION';
    end if;

    select m.revision
      into v_revision
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id
     for update;

    v_revision:=coalesce(v_revision,0);

    if coalesce(p_expected_revision,-1) <> v_revision then
        raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';
    end if;

    v_files:=jsonb_array_length(coalesce(p_manifest->'orderFiles','[]'::jsonb));
    v_items:=jsonb_array_length(coalesce(p_manifest->'orderData','[]'::jsonb));

    if v_files<=0 or v_items<=0 then
        raise exception 'Active Order Manifest requires orderFiles and orderData';
    end if;

    insert into public.pharmflow_active_order_manifest_v1(
        pharmacy_id,manifest,revision,updated_at,updated_by,workspace_generation
    )
    values(
        p_pharmacy_id,p_manifest,1,now(),auth.uid(),v_generation
    )
    on conflict(pharmacy_id) do update set
        manifest=excluded.manifest,
        revision=public.pharmflow_active_order_manifest_v1.revision+1,
        updated_at=now(),
        updated_by=auth.uid(),
        workspace_generation=v_generation;

    return query
    select m.revision,m.updated_at,
           jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
           jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),
           m.workspace_generation
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_pharmflow_master_cache_meta_v2()
 RETURNS TABLE(version text, source_file text, item_count bigint, global_item_count bigint, identifier_count bigint, updated_at timestamp with time zone, api_version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_items bigint;v_ids bigint;v_numeric bigint;v_updated timestamptz;
BEGIN
PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'get_pharmflow_master_cache_meta_v2',NULL);

 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required';END IF;
 SELECT count(*),max(g.updated_at) INTO v_items,v_updated FROM public.pharmflow_global_items_v2 g;
 SELECT count(*),count(*) FILTER(WHERE i.identifier_display ~ '^[0-9]+$'),greatest(v_updated,max(i.updated_at)) INTO v_ids,v_numeric,v_updated FROM public.pharmflow_global_item_identifiers_v2 i;
 RETURN QUERY SELECT 'GLOBAL_V2:'||v_items||':'||v_ids||':'||coalesce(v_updated::text,''),'Global Master V2'::text,v_numeric,v_items,v_ids,v_updated,2;
END $function$
;
CREATE OR REPLACE FUNCTION public.get_pharmflow_order(p_pharmacy_id uuid, p_order_number text)
 RETURNS SETOF pharmflow_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_order',NULL);
RETURN QUERY select *
  from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=
        upper(regexp_replace(p_order_number,'\\s','','g'))
    and auth.uid() is not null
    and public.is_pharmacy_admin(p_pharmacy_id)
  limit 1;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.register_pharmflow_order_upload(p_pharmacy_id uuid, p_order_number text, p_order_date date DEFAULT NULL::date, p_from_warehouse text DEFAULT ''::text, p_to_warehouse text DEFAULT ''::text, p_source_file text DEFAULT ''::text, p_item_count integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
begin
PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'register_pharmflow_order_upload',NULL);

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access required';
  end if;

  if nullif(trim(p_order_number),'') is null then
    raise exception 'Order Number is required';
  end if;

  insert into public.pharmflow_orders(
    pharmacy_id,order_number,order_date,from_warehouse,to_warehouse,
    source_file,item_count,status,uploaded_by
  ) values (
    p_pharmacy_id,
    upper(regexp_replace(trim(p_order_number),'\\s','','g')),
    p_order_date,
    coalesce(p_from_warehouse,''),
    coalesce(p_to_warehouse,''),
    coalesce(p_source_file,''),
    greatest(coalesce(p_item_count,0),0),
    'uploaded',
    auth.uid()
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Order % was already uploaded and cannot be uploaded twice',p_order_number;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_pharmflow_receiving_groups_v1(p_item_codes text[])
 RETURNS TABLE(item_code text, group_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
BEGIN
PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'get_pharmflow_receiving_groups_v1',NULL);

 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF coalesce(cardinality(p_item_codes),0)>1000 THEN RAISE EXCEPTION 'At most 1000 Item Codes per request'; END IF;
 -- The same canonical Item Code contract used by Quick Add; ambiguous codes fail closed.
 RETURN QUERY SELECT public.pharmflow_receiving_item_code_v1(i.item_code),min(i.group_name)
 FROM public.pharmflow_global_items_v2 i
 WHERE public.pharmflow_receiving_item_code_v1(i.item_code)=ANY(coalesce(p_item_codes,ARRAY[]::text[]))
 GROUP BY public.pharmflow_receiving_item_code_v1(i.item_code) HAVING count(*)=1;
END $function$
;

CREATE OR REPLACE FUNCTION public.pharmflow_is_reference_master_admin_v1() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public AS $f$ SELECT pharmflow_auth_private.global_allowed(); $f$;
CREATE OR REPLACE FUNCTION public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public AS $f$ SELECT pharmflow_auth_private.data_allowed(p_pharmacy_id,true); $f$;
NOTIFY pgrst,'reload schema';
CREATE POLICY pharmflow_password_change_gate ON public.pharmflow_pharmacy_permissions_v1 AS RESTRICTIVE FOR SELECT TO authenticated USING((SELECT pharmflow_auth_private.password_change_complete()));
CREATE POLICY pharmflow_password_change_gate ON public.pharmflow_permission_audit_v1 AS RESTRICTIVE FOR SELECT TO authenticated USING((SELECT pharmflow_auth_private.password_change_complete()));
CREATE POLICY pharmflow_password_change_gate ON public.pharmflow_central_review_events_v1 AS RESTRICTIVE FOR SELECT TO authenticated USING((SELECT pharmflow_auth_private.password_change_complete()));
CREATE OR REPLACE FUNCTION public.get_pharmflow_workspace_generation(p_pharmacy_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_generation bigint;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_workspace_generation');
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    if pharmflow_auth_private.module_allowed(p_pharmacy_id,'RECEIVING',true) then
      insert into public.pharmflow_workspace_generation_v1(pharmacy_id, generation)
      values (p_pharmacy_id, 0) on conflict (pharmacy_id) do nothing;
    end if;
    select generation into v_generation
    from public.pharmflow_workspace_generation_v1 where pharmacy_id = p_pharmacy_id;
    return coalesce(v_generation, 0);
end;
$function$;
-- Authorization release candidate. No credentials are stored in the operation journal.
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


-- Legacy session retirement. No session tables or records are changed.
CREATE OR REPLACE FUNCTION public.bulk_upsert_session_items(p_session_id uuid, p_session_secret uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.bulk_upsert_session_items(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.create_receiving_session(p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text)
 RETURNS TABLE(session_id uuid, session_code text, session_secret uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.create_receiving_session(text,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_received_qty(p_session_id uuid, p_session_secret uuid, p_item_code text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.get_received_qty(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_session_items(p_session_id uuid, p_session_secret uuid)
 RETURNS TABLE(item_code text, item_name text, gtin text, category text, ordered_qty numeric, received_qty numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.get_session_items(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_session_snapshot(p_session_id uuid, p_session_secret uuid)
 RETURNS TABLE(item_code text, item_name text, gtin text, gtins jsonb, category text, ordered_qty numeric, received_qty numeric, transaction_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.get_session_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.join_receiving_session(p_session_code text, p_session_secret uuid)
 RETURNS TABLE(session_id uuid, session_code text, order_number text, order_name text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.join_receiving_session(text,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.join_receiving_session_by_code(p_session_code text)
 RETURNS TABLE(session_id uuid, session_code text, session_secret uuid, order_number text, order_name text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.join_receiving_session_by_code(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.pharmflow_end_session(p_session_id text, p_session_secret text, p_ended_by_device text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.pharmflow_end_session(text,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.pharmflow_is_session_ended(p_session_id text, p_session_secret text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.pharmflow_is_session_ended(text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.record_receiving_transaction(p_session_id uuid, p_session_secret uuid, p_item_code text, p_qty_change numeric DEFAULT 1, p_action_type text DEFAULT 'scan'::text, p_device_id text DEFAULT NULL::text, p_device_type text DEFAULT NULL::text, p_transaction_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.record_receiving_transaction(uuid,uuid,text,numeric,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.upsert_session_item(p_session_id uuid, p_session_secret uuid, p_item_code text, p_item_name text, p_gtin text, p_category text, p_ordered_qty numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEGACY_RECEIVING_RETIRED'; END; $function$;
REVOKE ALL ON FUNCTION public.upsert_session_item(uuid,uuid,text,text,text,text,numeric) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';


-- Production definitions + authorization only. Original bodies follow the guard unchanged.
CREATE OR REPLACE FUNCTION public.append_pharmflow_cloud_transaction(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'append_pharmflow_cloud_transaction');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if nullif(trim(coalesce(p_transaction_id,'')),'') is null then
        raise exception 'Transaction ID required';
    end if;

    if nullif(trim(coalesce(p_item_code,'')),'') is null then
        raise exception 'Item Code required';
    end if;

    insert into public.pharmflow_receiving_transactions_v1(
        pharmacy_id,transaction_id,order_number,item_code,item_name,
        gtin,quantity,source,device_id,occurred_at,payload,created_by
    )
    values(
        p_pharmacy_id,
        trim(p_transaction_id),
        nullif(trim(coalesce(p_order_number,'')),''),
        trim(p_item_code),
        coalesce(p_item_name,''),
        coalesce(p_gtin,''),
        coalesce(p_quantity,0),
        coalesce(p_source,'RECEIVING'),
        coalesce(p_device_id,''),
        coalesce(p_occurred_at,now()),
        coalesce(p_payload,'{}'::jsonb),
        auth.uid()
    )
    on conflict(pharmacy_id,transaction_id) do nothing;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.append_pharmflow_cloud_transaction(uuid,text,text,text,text,text,integer,text,text,timestamp with time zone,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_pharmflow_cloud_transaction(uuid,text,text,text,text,text,integer,text,text,timestamp with time zone,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.append_pharmflow_cloud_transaction(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity numeric, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'append_pharmflow_cloud_transaction');

    if not public.pharmflow_can_access_pharmacy(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
    insert into public.pharmflow_cloud_transactions(pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload)
    values(p_pharmacy_id,p_transaction_id,p_order_number,p_item_code,p_item_name,p_gtin,coalesce(p_quantity,0),p_source,p_device_id,coalesce(p_occurred_at,now()),coalesce(p_payload,'{}'::jsonb))
    on conflict(pharmacy_id,transaction_id) do nothing;
end;$function$
;
REVOKE ALL ON FUNCTION public.append_pharmflow_cloud_transaction(uuid,text,text,text,text,text,numeric,text,text,timestamp with time zone,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_pharmflow_cloud_transaction(uuid,text,text,text,text,text,numeric,text,text,timestamp with time zone,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_pharmflow_cloud_transaction(uuid,text,text,text,text,text,numeric,text,text,timestamp with time zone,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.append_pharmflow_cloud_transaction(uuid,text,text,text,text,text,numeric,text,text,timestamp with time zone,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.append_pharmflow_learned_transaction_v3(p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text, p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text, p_occurred_at timestamp with time zone, p_payload jsonb, p_mapping_id uuid, p_mapping_revision bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_identifier_display text := btrim(coalesce(p_gtin,''));
  v_identifier_key text := public.pharmflow_identifier_key_v2(p_gtin);
  v_item_code text := trim(coalesce(p_item_code,''));
  v_transaction_id text := trim(coalesce(p_transaction_id,''));
  v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_existing public.pharmflow_receiving_transactions_v1%rowtype;
  v_intent_id uuid;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'append_pharmflow_learned_transaction_v3');

  if not public.pharmflow_gtin_lifecycle_member_v3(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  if v_transaction_id='' or v_identifier_key='' or v_item_code='' or p_mapping_id is null or coalesce(p_mapping_revision,0)<=0 or coalesce(p_quantity,0)<=0 then raise exception 'Valid transaction, learned mapping, item, identifier and positive quantity are required'; end if;

  lock table public.pharmflow_pharmacy_gtin_v1 in share mode;
  select * into v_mapping
    from public.pharmflow_pharmacy_gtin_v1 g
   where g.pharmacy_id=p_pharmacy_id
     and g.id=p_mapping_id
     and g.mapping_revision=p_mapping_revision
     and g.identifier_key=v_identifier_key
     and upper(trim(g.item_code))=upper(v_item_code)
   for share;
  if v_mapping.id is null then raise exception 'Learned mapping changed; resolve the identifier again'; end if;

  if coalesce(p_payload #>> '{gtinResolution,kind}','')<>'PHARMACY_LEARNED'
     or coalesce(p_payload #>> '{gtinResolution,mappingId}','')<>p_mapping_id::text
     or coalesce(p_payload #>> '{gtinResolution,mappingRevision}','')<>p_mapping_revision::text
     or public.pharmflow_identifier_key_v2(coalesce(p_payload #>> '{gtinResolution,identifierKey}',p_payload #>> '{gtinResolution,normalizedGtin}',''))<>v_identifier_key
     or upper(trim(coalesce(p_payload #>> '{gtinResolution,resolvedItemCode}','')))<>upper(v_item_code) then
    raise exception 'Learned transaction provenance does not match the authoritative mapping';
  end if;

  insert into public.pharmflow_receiving_transactions_v1(
    pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,
    source,device_id,occurred_at,payload,created_by
  )
  values(
    p_pharmacy_id,v_transaction_id,nullif(trim(coalesce(p_order_number,'')),''),
    v_item_code,coalesce(p_item_name,''),v_identifier_display,p_quantity,
    coalesce(p_source,'SCANNER'),coalesce(p_device_id,''),coalesce(p_occurred_at,now()),
    coalesce(p_payload,'{}'::jsonb),auth.uid()
  ) on conflict(pharmacy_id,transaction_id) do nothing;

  if not found then
    select * into v_existing
      from public.pharmflow_receiving_transactions_v1 t
     where t.pharmacy_id=p_pharmacy_id and t.transaction_id=v_transaction_id;
    if v_existing.transaction_id is null
       or coalesce(v_existing.order_number,'')<>coalesce(nullif(trim(p_order_number),''),'')
       or upper(trim(v_existing.item_code))<>upper(v_item_code)
       or public.pharmflow_identifier_key_v2(v_existing.gtin)<>v_identifier_key
       or v_existing.quantity<>p_quantity
       or coalesce(v_existing.payload #>> '{gtinResolution,mappingId}','')<>p_mapping_id::text
       or coalesce(v_existing.payload #>> '{gtinResolution,mappingRevision}','')<>p_mapping_revision::text then
      raise exception 'Transaction ID already exists with different learned-scan data';
    end if;
  end if;

  /* Keep finalizer failure isolated from the committed, idempotent receipt.
     A later idempotent queue delivery re-enters this same block safely. */
  for v_intent_id in
    select id
      from public.pharmflow_needs_review_resolution_intents_v1
     where pharmacy_id=p_pharmacy_id
       and transaction_id=v_transaction_id
       and status='PENDING'
  loop
    begin
      perform public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_intent_id);
    exception when others then
      begin
        update public.pharmflow_needs_review_resolution_intents_v1
           set helper_failure_code=SQLSTATE,
               helper_failure_detail=SQLERRM,
               helper_failure_at=now(),
               helper_failure_count=helper_failure_count+1,
               updated_at=now()
         where id=v_intent_id and status='PENDING';
      exception when others then
        raise warning 'Needs Review intent helper failed after learned receipt %, and failure state could not be recorded: %',v_transaction_id,SQLERRM;
      end;
      raise warning 'Needs Review intent helper failed after learned receipt %: %',v_transaction_id,SQLERRM;
    end;
  end loop;

  return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.append_pharmflow_learned_transaction_v3(uuid,text,text,text,text,text,integer,text,text,timestamp with time zone,jsonb,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_pharmflow_learned_transaction_v3(uuid,text,text,text,text,text,integer,text,text,timestamp with time zone,jsonb,uuid,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.atomic_reset_pharmflow_current_workspace(p_pharmacy_id uuid, p_confirmation text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_generation bigint;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'atomic_reset_pharmflow_current_workspace');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if upper(trim(coalesce(p_confirmation,''))) <> 'RESET CURRENT WORKSPACE' then
        raise exception 'Invalid reset confirmation';
    end if;

    insert into public.pharmflow_workspace_generation_v1(
        pharmacy_id,generation,reset_at,reset_by,updated_at
    )
    values(
        p_pharmacy_id,1,now(),auth.uid(),now()
    )
    on conflict(pharmacy_id)
    do update set
        generation=public.pharmflow_workspace_generation_v1.generation+1,
        reset_at=now(),
        reset_by=auth.uid(),
        updated_at=now()
    returning generation into v_generation;

    -- Discard ONLY unfinished order source + registry rows.
    delete from public.pharmflow_order_source_items s
    using public.pharmflow_orders o
    where s.pharmacy_id=p_pharmacy_id
      and o.pharmacy_id=p_pharmacy_id
      and upper(trim(s.order_number))=upper(trim(o.order_number))
      and lower(trim(coalesce(o.status,'uploaded'))) not in
          ('received','finalized','closed');

    delete from public.pharmflow_orders o
    where o.pharmacy_id=p_pharmacy_id
      and lower(trim(coalesce(o.status,'uploaded'))) not in
          ('received','finalized','closed');

    -- Clear the shared current workspace in the SAME server transaction.
    perform public.clear_pharmflow_cloud_workspace(p_pharmacy_id);

    return v_generation;
end;
$function$
;
REVOKE ALL ON FUNCTION public.atomic_reset_pharmflow_current_workspace(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reset_pharmflow_current_workspace(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.atomic_reset_pharmflow_current_workspace_v3(p_pharmacy_id uuid, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_generation bigint; v_orders bigint:=0; v_sources bigint:=0; v_manifest bigint:=0; v_receiving bigint:=0; v_reviews bigint:=0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'atomic_reset_pharmflow_current_workspace_v3');

  if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  if upper(trim(coalesce(p_confirmation,'')))<>'RESET CURRENT WORKSPACE' then raise exception 'Invalid reset confirmation'; end if;
  insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation,reset_at,reset_by,updated_at)
  values(p_pharmacy_id,1,now(),auth.uid(),now()) on conflict(pharmacy_id) do update
  set generation=public.pharmflow_workspace_generation_v1.generation+1,reset_at=now(),reset_by=auth.uid(),updated_at=now()
  returning generation into v_generation;
  delete from public.pharmflow_order_source_items s using public.pharmflow_orders o
   where s.pharmacy_id=p_pharmacy_id and o.pharmacy_id=p_pharmacy_id
     and upper(trim(s.order_number))=upper(trim(o.order_number))
     and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');
  get diagnostics v_sources=row_count;
  delete from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and lower(trim(coalesce(status,'uploaded'))) not in ('received','finalized','closed');
  get diagnostics v_orders=row_count;
  delete from public.pharmflow_active_order_manifest_v1 where pharmacy_id=p_pharmacy_id; get diagnostics v_manifest=row_count;
  delete from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id; get diagnostics v_receiving=row_count;
  update public.pharmflow_needs_review_v2 set status='DELETED',photo_path=null,updated_at=now()
   where pharmacy_id=p_pharmacy_id and workflow='RECEIVING' and status='PENDING'; get diagnostics v_reviews=row_count;
  perform public.clear_pharmflow_cloud_workspace(p_pharmacy_id);
  return jsonb_build_object('success',true,'generation',v_generation,'active_orders_deleted',v_orders,'source_rows_deleted',v_sources,'manifest_rows_deleted',v_manifest,'receiving_transactions_deleted',v_receiving,'needs_review_deleted',v_reviews,'reset_at',now());
end;$function$
;
REVOKE ALL ON FUNCTION public.atomic_reset_pharmflow_current_workspace_v3(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reset_pharmflow_current_workspace_v3(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.atomic_reset_pharmflow_current_workspace_v4(p_pharmacy_id uuid, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_generation bigint;
    v_orders bigint:=0;
    v_sources bigint:=0;
    v_manifest bigint:=0;
    v_receiving bigint:=0;
    v_reviews bigint:=0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'atomic_reset_pharmflow_current_workspace_v4');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if upper(trim(coalesce(p_confirmation,''))) <> 'RESET CURRENT WORKSPACE' then
        raise exception 'Invalid reset confirmation';
    end if;

    insert into public.pharmflow_workspace_generation_v1(
        pharmacy_id,generation,reset_at,reset_by,updated_at
    )
    values(p_pharmacy_id,1,now(),auth.uid(),now())
    on conflict(pharmacy_id) do update
    set generation=public.pharmflow_workspace_generation_v1.generation+1,
        reset_at=now(),reset_by=auth.uid(),updated_at=now()
    returning generation into v_generation;

    delete from public.pharmflow_order_source_items s
    using public.pharmflow_orders o
    where s.pharmacy_id=p_pharmacy_id
      and o.pharmacy_id=p_pharmacy_id
      and upper(trim(s.order_number))=upper(trim(o.order_number))
      and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');
    get diagnostics v_sources=row_count;

    delete from public.pharmflow_orders
    where pharmacy_id=p_pharmacy_id
      and lower(trim(coalesce(status,'uploaded'))) not in ('received','finalized','closed');
    get diagnostics v_orders=row_count;

    delete from public.pharmflow_active_order_manifest_v1
    where pharmacy_id=p_pharmacy_id;
    get diagnostics v_manifest=row_count;

    delete from public.pharmflow_receiving_transactions_v1
    where pharmacy_id=p_pharmacy_id;
    get diagnostics v_receiving=row_count;

    update public.pharmflow_needs_review_v2
       set status='DELETED',photo_path=null,updated_at=now()
     where pharmacy_id=p_pharmacy_id
       and workflow='RECEIVING'
       and status='PENDING';
    get diagnostics v_reviews=row_count;

    perform public.clear_pharmflow_cloud_workspace(p_pharmacy_id);

    return jsonb_build_object(
        'success',true,
        'generation',v_generation,
        'active_orders_deleted',v_orders,
        'source_rows_deleted',v_sources,
        'manifest_rows_deleted',v_manifest,
        'receiving_transactions_deleted',v_receiving,
        'needs_review_deleted',v_reviews,
        'reset_at',now()
    );
end;
$function$
;
REVOKE ALL ON FUNCTION public.atomic_reset_pharmflow_current_workspace_v4(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reset_pharmflow_current_workspace_v4(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_active_order_manifest(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_active_order_manifest');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    delete from public.pharmflow_active_order_manifest_v1
    where pharmacy_id=p_pharmacy_id;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_active_order_manifest(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_active_order_manifest(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_active_order_manifest_v2(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_active_order_manifest_v2');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    delete from public.pharmflow_active_order_manifest_v1
    where pharmacy_id=p_pharmacy_id;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_active_order_manifest_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_active_order_manifest_v2(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_cloud_workspace(p_pharmacy_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_cloud_workspace');

    if not public.pharmflow_can_access_pharmacy(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
    delete from public.pharmflow_cloud_transactions where pharmacy_id=p_pharmacy_id;
    delete from public.pharmflow_cloud_workspaces where pharmacy_id=p_pharmacy_id;
end;$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_cloud_workspace(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_cloud_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_cloud_workspace(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_cloud_workspace(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_receiving_needs_review_v2(p_pharmacy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
declare
    v_photos bigint:=0;
    v_reviews bigint:=0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_receiving_needs_review_v2');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    delete from storage.objects o
     where o.bucket_id='pharmflow-needs-review'
       and o.name in (
           select r.photo_path
             from public.pharmflow_needs_review_v2 r
            where r.pharmacy_id=p_pharmacy_id
              and r.workflow='RECEIVING'
              and r.photo_path is not null
       );
    get diagnostics v_photos=row_count;

    update public.pharmflow_needs_review_v2 r
       set status='DELETED', photo_path=null, updated_at=now()
     where r.pharmacy_id=p_pharmacy_id
       and r.workflow='RECEIVING'
       and r.status='PENDING';
    get diagnostics v_reviews=row_count;

    return jsonb_build_object(
        'success',true,
        'reviews_cleared',v_reviews,
        'photos_deleted',v_photos
    );
end;
$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_receiving_needs_review_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_receiving_needs_review_v2(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_receiving_needs_review_v3(p_pharmacy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_reviews bigint:=0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_receiving_needs_review_v3');

  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  update public.pharmflow_needs_review_v2
     set status='DELETED', photo_path=null, updated_at=now()
   where pharmacy_id=p_pharmacy_id and workflow='RECEIVING' and status='PENDING';
  get diagnostics v_reviews=row_count;
  return jsonb_build_object('success',true,'reviews_cleared',v_reviews);
end;$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_receiving_needs_review_v3(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_receiving_needs_review_v3(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_receiving_transactions(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_receiving_transactions');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    delete from public.pharmflow_receiving_transactions_v1
    where pharmacy_id=p_pharmacy_id;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_receiving_transactions(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_receiving_transactions(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.clear_pharmflow_receiving_transactions_v2(p_pharmacy_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'clear_pharmflow_receiving_transactions_v2');

    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    delete from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id;
    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.clear_pharmflow_receiving_transactions_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pharmflow_receiving_transactions_v2(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.count_pharmflow_needs_review_scope_v3(p_pharmacy_id uuid, p_workflow text DEFAULT 'RECEIVING'::text, p_order_numbers text[] DEFAULT NULL::text[])
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_count integer;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,upper(nullif(trim(p_workflow),'')),false,'count_pharmflow_needs_review_scope_v3');

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 select count(*)::integer into v_count from (
   select r.gtin,coalesce(r.order_number,''),r.review_reason
   from public.pharmflow_needs_review_v2 r
   where r.pharmacy_id=p_pharmacy_id and r.status='PENDING'
     and r.workflow=upper(trim(coalesce(p_workflow,'RECEIVING')))
     and coalesce(array_length(p_order_numbers,1),0)>0
     and r.order_number=any(p_order_numbers)
   group by r.gtin,coalesce(r.order_number,''),r.review_reason
 ) g;
 return coalesce(v_count,0);
end $function$
;
REVOKE ALL ON FUNCTION public.count_pharmflow_needs_review_scope_v3(uuid,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.count_pharmflow_needs_review_scope_v3(uuid,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_pharmflow_needs_review_scope_v3(uuid,text,text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.count_pharmflow_needs_review_scope_v3(uuid,text,text[]) TO service_role;
CREATE OR REPLACE FUNCTION public.create_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_workflow text, p_gtin text, p_raw_barcode text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_review_reason text DEFAULT 'UNKNOWN_GTIN'::text, p_master_item_code_hint text DEFAULT NULL::text, p_master_item_name_hint text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_device_id text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_id uuid;
    v_time timestamptz;
    v_gtin text := regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g');
    v_workflow text := upper(trim(coalesce(p_workflow,'RECEIVING')));
    v_reason text := upper(trim(coalesce(p_review_reason,'UNKNOWN_GTIN')));
    v_source text := upper(trim(coalesce(p_source,'HANDHELD')));
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,upper(nullif(trim(p_workflow),'')),true,'create_pharmflow_needs_review_v2');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if v_gtin = '' then
        raise exception 'GTIN is required';
    end if;

    if v_workflow not in ('RECEIVING','EXPIRY') then
        raise exception 'Invalid workflow';
    end if;

    if v_reason not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then
        raise exception 'Invalid review reason';
    end if;

    if v_source not in ('HANDHELD','PC') then
        raise exception 'Invalid source';
    end if;

    insert into public.pharmflow_needs_review_v2 (
        pharmacy_id,
        workflow,
        session_id,
        order_number,
        order_name,
        gtin,
        raw_barcode,
        pending_quantity,
        review_reason,
        master_item_code_hint,
        master_item_name_hint,
        source,
        device_id,
        created_by
    )
    values (
        p_pharmacy_id,
        v_workflow,
        nullif(trim(coalesce(p_session_id,'')),''),
        nullif(trim(coalesce(p_order_number,'')),''),
        nullif(trim(coalesce(p_order_name,'')),''),
        v_gtin,
        nullif(p_raw_barcode,''),
        1,
        v_reason,
        nullif(trim(coalesce(p_master_item_code_hint,'')),''),
        nullif(trim(coalesce(p_master_item_name_hint,'')),''),
        v_source,
        nullif(trim(coalesce(p_device_id,'')),''),
        auth.uid()
    )
    returning id, pharmflow_needs_review_v2.created_at
    into v_id, v_time;

    return query select v_id, 1, v_time;
end;
$function$
;
REVOKE ALL ON FUNCTION public.create_pharmflow_needs_review_v2(uuid,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pharmflow_needs_review_v2(uuid,text,text,text,text,text,text,text,text,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.create_pharmflow_needs_review_v5(p_operation_id text, p_pharmacy_id uuid, p_workflow text, p_identifier_display text, p_raw_barcode text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_review_reason text DEFAULT 'UNKNOWN_GTIN'::text, p_master_item_code_hint text DEFAULT NULL::text, p_master_item_name_hint text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_device_id text DEFAULT NULL::text, p_work_scope_order_numbers text[] DEFAULT NULL::text[])
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_operation text:=nullif(btrim(coalesce(p_operation_id,'')),'');v_display text:=btrim(coalesce(p_identifier_display,''));v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);v_order text:=nullif(btrim(coalesce(p_order_number,'')),'');v_scope text[];v_id uuid;v_time timestamptz;v_qty integer;v_status text;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,upper(nullif(trim(p_workflow),'')),true,'create_pharmflow_needs_review_v5');

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
 if v_operation is null then raise exception 'Operation ID is required';end if;
 if v_key='' then raise exception 'Identifier is required';end if;
 if upper(trim(coalesce(p_workflow,'RECEIVING')))<>'RECEIVING' then raise exception 'Invalid workflow';end if;
 if upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))) not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason';end if;
 if upper(btrim(coalesce(p_source,'HANDHELD'))) not in ('HANDHELD','PC') then raise exception 'Invalid source';end if;

 select r.id,r.pending_quantity,r.created_at,r.status into v_id,v_qty,v_time,v_status from public.pharmflow_needs_review_v2 r where r.pharmacy_id=p_pharmacy_id and r.operation_id=v_operation limit 1;
 if found then return query select v_id,v_qty,v_time,v_status;return;end if;

 select coalesce(array_agg(distinct btrim(x) order by btrim(x)),array[]::text[]) into v_scope from unnest(coalesce(p_work_scope_order_numbers,array[]::text[])) x where btrim(coalesce(x,''))<>'';
 if v_order is not null and not(v_order=any(v_scope)) then v_scope:=array_append(v_scope,v_order);end if;
 if coalesce(array_length(v_scope,1),0)=0 then raise exception 'Receiving work scope is required';end if;
 if v_order is null and array_length(v_scope,1)=1 then v_order:=v_scope[1];end if;
 if exists(select 1 from unnest(v_scope) s where not exists(select 1 from public.pharmflow_orders o where o.pharmacy_id=p_pharmacy_id and o.order_number=s and o.status='uploaded')) then raise exception 'Receiving work scope contains an unavailable Order';end if;

 begin
  insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,session_id,order_number,order_name,gtin,raw_barcode,identifier_display,identifier_key,pending_quantity,review_reason,master_item_code_hint,master_item_name_hint,source,device_id,created_by,work_scope_order_numbers,operation_id)
  values(p_pharmacy_id,'RECEIVING',nullif(btrim(coalesce(p_session_id,'')),''),v_order,nullif(btrim(coalesce(p_order_name,'')),''),v_display,nullif(p_raw_barcode,''),v_display,v_key,1,upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),nullif(btrim(coalesce(p_master_item_code_hint,'')),''),nullif(btrim(coalesce(p_master_item_name_hint,'')),''),upper(btrim(coalesce(p_source,'HANDHELD'))),nullif(btrim(coalesce(p_device_id,'')),''),auth.uid(),v_scope,v_operation)
  returning id,pharmflow_needs_review_v2.pending_quantity,pharmflow_needs_review_v2.created_at,pharmflow_needs_review_v2.status into v_id,v_qty,v_time,v_status;
 exception when unique_violation then
  select r.id,r.pending_quantity,r.created_at,r.status into v_id,v_qty,v_time,v_status from public.pharmflow_needs_review_v2 r where r.pharmacy_id=p_pharmacy_id and r.operation_id=v_operation;
  if not found then raise;end if;
 end;
 return query select v_id,v_qty,v_time,v_status;
end;$function$
;
REVOKE ALL ON FUNCTION public.create_pharmflow_needs_review_v5(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pharmflow_needs_review_v5(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_all_pharmflow_finalized_archives(p_pharmacy_id uuid, p_confirmation text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'delete_all_pharmflow_finalized_archives');

    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if p_confirmation <> 'DELETE ALL HISTORICAL DATA' then
        raise exception 'Invalid confirmation';
    end if;

    delete from public.pharmflow_finalized_archives_v1
    where pharmacy_id=p_pharmacy_id;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.delete_all_pharmflow_finalized_archives(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_pharmflow_finalized_archives(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_all_pharmflow_historical_data_v2(p_pharmacy_id uuid, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_historical_order_numbers text[] := '{}'::text[];
    v_orders_deleted bigint := 0;
    v_archives_deleted bigint := 0;
    v_source_rows_deleted bigint := 0;
    v_receiving_transactions_deleted bigint := 0;
    v_remaining_historical_orders bigint := 0;
    v_remaining_archives bigint := 0;
    v_active_orders_preserved bigint := 0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'delete_all_pharmflow_historical_data_v2');

    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if upper(trim(coalesce(p_confirmation,''))) <> 'DELETE ALL HISTORICAL DATA' then
        raise exception 'Invalid confirmation';
    end if;

    -- Build the complete known Historical Order set BEFORE deleting anything.
    -- Include registry historical states plus Order Numbers carried only by a
    -- finalized archive (legacy/finalized-before-registry cases).
    select coalesce(array_agg(distinct x.order_number), '{}'::text[])
      into v_historical_order_numbers
      from (
          select upper(trim(o.order_number)) as order_number
            from public.pharmflow_orders o
           where o.pharmacy_id=p_pharmacy_id
             and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed')
             and nullif(trim(coalesce(o.order_number,'')),'') is not null

          union

          select upper(trim(n)) as order_number
            from public.pharmflow_finalized_archives_v1 a
            cross join lateral unnest(coalesce(a.order_numbers,'{}'::text[])) n
           where a.pharmacy_id=p_pharmacy_id
             and nullif(trim(coalesce(n,'')),'') is not null
      ) x;

    -- Immutable original-source snapshots belong to the historical order and
    -- must not survive Delete All Historical Data / Item Transfer cleanup.
    if coalesce(array_length(v_historical_order_numbers,1),0) > 0 then
        delete from public.pharmflow_order_source_items s
         where s.pharmacy_id=p_pharmacy_id
           and upper(trim(s.order_number))=any(v_historical_order_numbers);
        get diagnostics v_source_rows_deleted=row_count;

        -- Remove only receiving ledger rows for historical orders. Transactions
        -- for current active orders remain available and synchronized.
        delete from public.pharmflow_receiving_transactions_v1 t
         where t.pharmacy_id=p_pharmacy_id
           and upper(trim(coalesce(t.order_number,'')))=any(v_historical_order_numbers);
        get diagnostics v_receiving_transactions_deleted=row_count;
    end if;

    -- Finalized Archive is historical by definition and tenant-scoped.
    delete from public.pharmflow_finalized_archives_v1 a
     where a.pharmacy_id=p_pharmacy_id;
    get diagnostics v_archives_deleted=row_count;

    -- Delete ONLY received/finalized/closed lifecycle rows.
    delete from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed');
    get diagnostics v_orders_deleted=row_count;

    -- Server-side fail-fast verification. If either count is non-zero, raise;
    -- PostgreSQL rolls the entire transaction back rather than reporting a
    -- false success.
    select count(*)
      into v_remaining_historical_orders
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed');

    select count(*)
      into v_remaining_archives
      from public.pharmflow_finalized_archives_v1 a
     where a.pharmacy_id=p_pharmacy_id;

    if v_remaining_historical_orders<>0 or v_remaining_archives<>0 then
        raise exception
            'Historical deletion verification failed: orders %, archives %',
            v_remaining_historical_orders,
            v_remaining_archives;
    end if;

    select count(*)
      into v_active_orders_preserved
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    return jsonb_build_object(
        'success',true,
        'pharmacy_id',p_pharmacy_id,
        'historical_orders_deleted',v_orders_deleted,
        'finalized_archives_deleted',v_archives_deleted,
        'historical_source_rows_deleted',v_source_rows_deleted,
        'historical_receiving_transactions_deleted',v_receiving_transactions_deleted,
        'remaining_historical_orders',v_remaining_historical_orders,
        'remaining_finalized_archives',v_remaining_archives,
        'active_orders_preserved',v_active_orders_preserved,
        'verified_at',now()
    );
end;
$function$
;
REVOKE ALL ON FUNCTION public.delete_all_pharmflow_historical_data_v2(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_pharmflow_historical_data_v2(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_all_pharmflow_received_history(p_pharmacy_id uuid, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_deleted integer := 0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'delete_all_pharmflow_received_history');

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access required';
  end if;

  if coalesce(p_confirmation,'') <> 'DELETE ALL HISTORICAL DATA' then
    raise exception 'Historical deletion confirmation does not match';
  end if;

  delete from public.pharmflow_order_source_items
  where pharmacy_id=p_pharmacy_id
    and order_id in (
      select id from public.pharmflow_orders
      where pharmacy_id=p_pharmacy_id
        and lower(coalesce(status,'')) in ('received','finalized','closed')
    );

  delete from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and lower(coalesce(status,'')) in ('received','finalized','closed');

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'success',true,
    'deleted_received_orders',v_deleted,
    'pharmacy_id',p_pharmacy_id
  );
end;
$function$
;
REVOKE ALL ON FUNCTION public.delete_all_pharmflow_received_history(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_pharmflow_received_history(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_pharmacy_needs_review(p_pharmacy_id uuid, p_review_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,coalesce((select nr_compat.workflow from public.pharmflow_needs_review_v1 nr_compat where nr_compat.id=p_review_id and nr_compat.pharmacy_id=p_pharmacy_id),'RECEIVING'),true,'delete_pharmacy_needs_review');

 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 update public.pharmflow_needs_review_v1 set status='DELETED',updated_at=now() where id=p_review_id and pharmacy_id=p_pharmacy_id and status='PENDING';
 return found;
end $function$
;
REVOKE ALL ON FUNCTION public.delete_pharmacy_needs_review(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pharmacy_needs_review(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pharmacy_needs_review(uuid,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_pharmacy_needs_review(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.delete_pharmflow_order_complete(p_pharmacy_id uuid, p_order_number text, p_confirmation text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_order text:=upper(trim(coalesce(p_order_number,'')));
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'delete_pharmflow_order_complete');

    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;

    if v_order='' or upper(trim(coalesce(p_confirmation,'')))<>v_order then
        raise exception 'Order confirmation does not match';
    end if;

    delete from public.pharmflow_finalized_archives_v1 a
    where a.pharmacy_id=p_pharmacy_id
      and exists (
          select 1
          from unnest(coalesce(a.order_numbers,'{}'::text[])) n
          where upper(trim(n))=v_order
      );

    delete from public.pharmflow_order_source_items
    where pharmacy_id=p_pharmacy_id
      and upper(trim(order_number))=v_order;

    delete from public.pharmflow_orders
    where pharmacy_id=p_pharmacy_id
      and upper(trim(order_number))=v_order;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.delete_pharmflow_order_complete(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pharmflow_order_complete(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.discard_all_pharmflow_active_orders(p_pharmacy_id uuid, p_confirmation text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'discard_all_pharmflow_active_orders');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if upper(trim(coalesce(p_confirmation,''))) <> 'RESET CURRENT WORKSPACE' then
        raise exception 'Invalid reset confirmation';
    end if;

    -- Remove source rows only for unfinished orders. Finalized/received history
    -- remains protected and untouched.
    delete from public.pharmflow_order_source_items s
    using public.pharmflow_orders o
    where s.pharmacy_id=p_pharmacy_id
      and o.pharmacy_id=p_pharmacy_id
      and upper(trim(s.order_number))=upper(trim(o.order_number))
      and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    delete from public.pharmflow_orders o
    where o.pharmacy_id=p_pharmacy_id
      and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.discard_all_pharmflow_active_orders(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.discard_all_pharmflow_active_orders(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.discard_pharmflow_active_order(p_pharmacy_id uuid, p_order_number text, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order text := upper(regexp_replace(trim(coalesce(p_order_number,'')),'\\s','','g'));
  v_status text;
  v_deleted integer := 0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'discard_pharmflow_active_order');

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access required';
  end if;

  if v_order='' then
    raise exception 'Order Number is required';
  end if;

  if upper(regexp_replace(trim(coalesce(p_confirmation,'')),'\\s','','g')) <> v_order then
    raise exception 'Order confirmation does not match';
  end if;

  select lower(coalesce(status,''))
    into v_status
  from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=v_order
  limit 1;

  if v_status is null then
    return jsonb_build_object(
      'success',true,
      'already_absent',true,
      'order_number',v_order
    );
  end if;

  if v_status in ('received','finalized','closed') then
    raise exception 'Finalized/received order cannot be discarded from Current Workspace. Delete it from Archive using the protected historical order deletion flow.';
  end if;

  delete from public.pharmflow_order_source_items
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=v_order;

  delete from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=v_order
    and lower(coalesce(status,'')) not in ('received','finalized','closed');

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'success',true,
    'discarded_orders',v_deleted,
    'order_number',v_order,
    'previous_status',v_status
  );
end;
$function$
;
REVOKE ALL ON FUNCTION public.discard_pharmflow_active_order(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.discard_pharmflow_active_order(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.finalize_pharmflow_order(p_pharmacy_id uuid, p_order_number text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status text;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'finalize_pharmflow_order');

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access required';
  end if;

  select status into v_status
  from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=
        upper(regexp_replace(p_order_number,'\\s','','g'))
  for update;

  if v_status is null then
    raise exception 'Order % is not registered',p_order_number;
  end if;

  if v_status='received' then
    raise exception 'Order % has already been received/finalized',p_order_number;
  end if;

  update public.pharmflow_orders
  set status='received', received_at=now(), received_by=auth.uid()
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=
        upper(regexp_replace(p_order_number,'\\s','','g'));

  return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.finalize_pharmflow_order(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pharmflow_order(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pharmflow_order(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.finalize_pharmflow_order(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.finalize_pharmflow_receiving_workspace_v1(p_pharmacy_id uuid, p_completion_key text, p_order_numbers text[], p_discrepancies jsonb DEFAULT '[]'::jsonb, p_new_items jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(workspace_history_id uuid, completed_at timestamp with time zone, orders_count integer, discrepancy_count integer, new_item_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_id uuid;
    v_completed_at timestamptz;
    v_orders text[];
    v_order text;
    v_status text;
    v_disc_count integer;
    v_new_count integer;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'finalize_pharmflow_receiving_workspace_v1');

    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy ADMIN access required';
    end if;
    if nullif(trim(coalesce(p_completion_key,'')),'') is null then
        raise exception 'Completion key required';
    end if;
    select coalesce(array_agg(distinct upper(regexp_replace(trim(x),'\s','','g')) order by upper(regexp_replace(trim(x),'\s','','g'))),'{}'::text[])
      into v_orders
      from unnest(coalesce(p_order_numbers,'{}'::text[])) x
     where nullif(trim(x),'') is not null;
    if coalesce(array_length(v_orders,1),0)=0 then
        raise exception 'At least one Order Number is required';
    end if;
    if jsonb_typeof(coalesce(p_discrepancies,'[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p_new_items,'[]'::jsonb)) <> 'array' then
        raise exception 'History items must be JSON arrays';
    end if;

    select h.id,h.completed_at into v_id,v_completed_at
      from public.pharmflow_receiving_workspace_history_v1 h
     where h.pharmacy_id=p_pharmacy_id and h.completion_key=trim(p_completion_key);
    if found then
        return query
        select h.id,h.completed_at,h.orders_count,h.discrepancy_count,h.new_item_count
          from public.pharmflow_receiving_workspace_history_v1 h
         where h.id=v_id;
        return;
    end if;

    foreach v_order in array v_orders loop
        select o.status into v_status
          from public.pharmflow_orders o
         where o.pharmacy_id=p_pharmacy_id
           and upper(regexp_replace(o.order_number,'\s','','g'))=v_order
         for update;
        if v_status is null then raise exception 'Order % is not registered',v_order; end if;
        if v_status='received' then raise exception 'Order % has already been received/finalized',v_order; end if;
    end loop;

    v_disc_count=jsonb_array_length(coalesce(p_discrepancies,'[]'::jsonb));
    v_new_count=jsonb_array_length(coalesce(p_new_items,'[]'::jsonb));

    insert into public.pharmflow_receiving_workspace_history_v1 as h(
        pharmacy_id,completion_key,completed_by,orders_count,discrepancy_count,new_item_count,order_numbers
    ) values(
        p_pharmacy_id,trim(p_completion_key),auth.uid(),array_length(v_orders,1),v_disc_count,v_new_count,v_orders
    )
    returning h.id,h.completed_at into v_id,v_completed_at;

    insert into public.pharmflow_receiving_history_items_v1(
        pharmacy_id,workspace_history_id,event_type,order_number,order_name,order_date,
        item_code,item_name,ordered_qty,received_qty,difference,issue_type
    )
    select p_pharmacy_id,v_id,'DISCREPANCY',
           upper(regexp_replace(trim(coalesce(x->>'order_number','')),'\s','','g')),
           coalesce(x->>'order_name',''),nullif(x->>'order_date','')::date,
           trim(coalesce(x->>'item_code','')),coalesce(x->>'item_name',''),
           coalesce(nullif(x->>'ordered_qty','')::numeric,0),
           nullif(x->>'received_qty','')::numeric,
           nullif(x->>'difference','')::numeric,
           upper(trim(coalesce(x->>'issue_type','')))
      from jsonb_array_elements(coalesce(p_discrepancies,'[]'::jsonb)) x
     where upper(regexp_replace(trim(coalesce(x->>'order_number','')),'\s','','g'))=any(v_orders)
       and nullif(trim(coalesce(x->>'item_code','')),'') is not null;

    insert into public.pharmflow_receiving_history_items_v1(
        pharmacy_id,workspace_history_id,event_type,order_number,order_name,order_date,
        item_code,item_name,ordered_qty,received_qty,difference,issue_type
    )
    select p_pharmacy_id,v_id,'NEW_ITEM',
           upper(regexp_replace(trim(coalesce(x->>'order_number','')),'\s','','g')),
           coalesce(x->>'order_name',''),nullif(x->>'order_date','')::date,
           trim(coalesce(x->>'item_code','')),coalesce(x->>'item_name',''),
           coalesce(nullif(x->>'ordered_qty','')::numeric,0),null,null,'NEW'
      from jsonb_array_elements(coalesce(p_new_items,'[]'::jsonb)) x
     where upper(regexp_replace(trim(coalesce(x->>'order_number','')),'\s','','g'))=any(v_orders)
       and nullif(trim(coalesce(x->>'item_code','')),'') is not null;

    update public.pharmflow_orders
       set status='received',received_at=v_completed_at,received_by=auth.uid()
     where pharmacy_id=p_pharmacy_id
       and upper(regexp_replace(order_number,'\s','','g'))=any(v_orders);

    return query select v_id,v_completed_at,array_length(v_orders,1),v_disc_count,v_new_count;
end;
$function$
;
REVOKE ALL ON FUNCTION public.finalize_pharmflow_receiving_workspace_v1(uuid,text,text[],jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pharmflow_receiving_workspace_v1(uuid,text,text[],jsonb,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_pharmflow_active_order_manifest(p_pharmacy_id uuid)
 RETURNS TABLE(manifest jsonb, revision bigint, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_active_order_manifest');
 RETURN QUERY select m.manifest,m.revision,m.updated_at
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id
      and public.is_pharmacy_member(p_pharmacy_id);
END;
$function$
;
REVOKE ALL ON FUNCTION public.get_pharmflow_active_order_manifest(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_active_order_manifest(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_pharmflow_active_order_manifest_v2(p_pharmacy_id uuid)
 RETURNS TABLE(manifest jsonb, revision bigint, updated_at timestamp with time zone, order_files integer, order_items integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_active_order_manifest_v2');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select
        m.manifest,
        m.revision,
        m.updated_at,
        jsonb_array_length(
            coalesce(m.manifest->'orderFiles','[]'::jsonb)
        ),
        jsonb_array_length(
            coalesce(m.manifest->'orderData','[]'::jsonb)
        )
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id;
end;
$function$
;
REVOKE ALL ON FUNCTION public.get_pharmflow_active_order_manifest_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_active_order_manifest_v2(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_pharmflow_order_source_items(p_pharmacy_id uuid, p_order_number text)
 RETURNS SETOF pharmflow_order_source_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_order_source_items');
 RETURN QUERY select i.*
  from public.pharmflow_order_source_items i
  where i.pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(i.order_number,'\\s','','g'))=
        upper(regexp_replace(p_order_number,'\\s','','g'))
    and auth.uid() is not null
    and public.is_pharmacy_admin(p_pharmacy_id)
  order by i.line_no;
END;
$function$
;
REVOKE ALL ON FUNCTION public.get_pharmflow_order_source_items(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_order_source_items(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_order_source_items(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_order_source_items(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.get_pharmflow_receiving_workspace_history_v1(p_pharmacy_id uuid, p_workspace_history_id uuid)
 RETURNS TABLE(event_type text, order_number text, order_name text, order_date date, item_code text, item_name text, ordered_qty numeric, received_qty numeric, difference numeric, issue_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_receiving_workspace_history_v1');
 RETURN QUERY select i.event_type,i.order_number,i.order_name,i.order_date,i.item_code,i.item_name,
           i.ordered_qty,i.received_qty,i.difference,i.issue_type
      from public.pharmflow_receiving_history_items_v1 i
     where i.pharmacy_id=p_pharmacy_id
       and i.workspace_history_id=p_workspace_history_id
       and auth.uid() is not null and public.is_pharmacy_member(p_pharmacy_id)
     order by i.order_number,
              case i.event_type when 'DISCREPANCY' then 1 else 2 end,
              i.item_name,i.item_code;
END;
$function$
;
REVOKE ALL ON FUNCTION public.get_pharmflow_receiving_workspace_history_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_receiving_workspace_history_v1(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_pharmacy_needs_review(p_pharmacy_id uuid, p_workflow text DEFAULT NULL::text, p_order_id text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, workflow text, gtin text, raw_barcode text, order_id text, order_name text, pending_quantity integer, expiry_month integer, expiry_year integer, worker_id uuid, captured_by_name text, device_id text, source text, created_at timestamp with time zone, review_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,upper(nullif(trim(p_workflow),'')),false,'list_pharmacy_needs_review');

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 return query
 select r.id,r.workflow,r.gtin,coalesce(r.raw_barcode,''),coalesce(r.order_id,''),coalesce(r.order_name,''),
        r.pending_quantity,r.expiry_month,r.expiry_year,r.worker_id,coalesce(r.captured_by_name,''),
        coalesce(r.device_id,''),r.source,r.created_at,coalesce(r.review_reason,'UNKNOWN_GTIN')
 from public.pharmflow_needs_review_v1 r
 where r.pharmacy_id=p_pharmacy_id and r.status='PENDING'
 and (nullif(upper(trim(coalesce(p_workflow,''))),'') is null or r.workflow=upper(trim(p_workflow)))
 and (nullif(trim(coalesce(p_order_id,'')),'') is null or coalesce(r.order_id,'')=trim(p_order_id))
 order by r.created_at desc;
end $function$
;
REVOKE ALL ON FUNCTION public.list_pharmacy_needs_review(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmacy_needs_review(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmacy_needs_review(uuid,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.list_pharmacy_needs_review(uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.list_pharmflow_cloud_transactions(p_pharmacy_id uuid, p_limit integer DEFAULT 1000)
 RETURNS TABLE(transaction_id text, order_number text, item_code text, item_name text, gtin text, quantity integer, source text, device_id text, occurred_at timestamp with time zone, payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_cloud_transactions');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select
        t.transaction_id,
        t.order_number,
        t.item_code,
        t.item_name,
        t.gtin,
        t.quantity,
        t.source,
        t.device_id,
        t.occurred_at,
        t.payload
    from public.pharmflow_receiving_transactions_v1 t
    where t.pharmacy_id=p_pharmacy_id
    order by t.occurred_at desc
    limit greatest(1,least(coalesce(p_limit,1000),5000));
end;
$function$
;
REVOKE ALL ON FUNCTION public.list_pharmflow_cloud_transactions(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_cloud_transactions(uuid,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_pharmflow_cloud_transactions_v2(p_pharmacy_id uuid, p_limit integer DEFAULT 5000)
 RETURNS TABLE(transaction_id text, order_number text, item_code text, item_name text, gtin text, quantity integer, source text, device_id text, occurred_at timestamp with time zone, payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_cloud_transactions_v2');

    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select t.transaction_id,t.order_number,t.item_code,t.item_name,t.gtin,
           t.quantity,t.source,t.device_id,t.occurred_at,t.payload
    from public.pharmflow_receiving_transactions_v1 t
    where t.pharmacy_id=p_pharmacy_id
    order by t.occurred_at asc, t.created_at asc
    limit greatest(1,least(coalesce(p_limit,5000),10000));
end;
$function$
;
REVOKE ALL ON FUNCTION public.list_pharmflow_cloud_transactions_v2(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_cloud_transactions_v2(uuid,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_pharmflow_cloud_transactions_v3(p_pharmacy_id uuid, p_order_numbers text[], p_limit integer DEFAULT 5000)
 RETURNS TABLE(transaction_id text, order_number text, item_code text, item_name text, gtin text, quantity integer, source text, device_id text, occurred_at timestamp with time zone, payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_cloud_transactions_v3');

  if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
    raise exception 'Pharmacy access required';
  end if;

  return query
  select t.transaction_id,t.order_number,t.item_code,t.item_name,t.gtin,
         t.quantity,t.source,t.device_id,t.occurred_at,t.payload
  from public.pharmflow_receiving_transactions_v1 t
  where t.pharmacy_id=p_pharmacy_id
    and (p_order_numbers is null or cardinality(p_order_numbers)=0 or t.order_number = any(p_order_numbers))
  order by t.occurred_at asc, t.created_at asc
  limit greatest(1,least(coalesce(p_limit,5000),10000));
end;
$function$
;
REVOKE ALL ON FUNCTION public.list_pharmflow_cloud_transactions_v3(uuid,text[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_cloud_transactions_v3(uuid,text[],integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_cloud_transactions_v3(uuid,text[],integer) TO anon;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_cloud_transactions_v3(uuid,text[],integer) TO service_role;
CREATE OR REPLACE FUNCTION public.list_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_workflow text DEFAULT 'RECEIVING'::text, p_order_number text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, workflow text, session_id text, order_number text, order_name text, gtin text, raw_barcode text, pending_quantity integer, review_reason text, master_item_code_hint text, master_item_name_hint text, photo_path text, source text, device_id text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,upper(nullif(trim(p_workflow),'')),false,'list_pharmflow_needs_review_v2');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select
        r.id,
        r.workflow,
        coalesce(r.session_id,''),
        coalesce(r.order_number,''),
        coalesce(r.order_name,''),
        r.gtin,
        coalesce(r.raw_barcode,''),
        r.pending_quantity,
        r.review_reason,
        coalesce(r.master_item_code_hint,''),
        coalesce(r.master_item_name_hint,''),
        coalesce(r.photo_path,''),
        r.source,
        coalesce(r.device_id,''),
        r.created_at
    from public.pharmflow_needs_review_v2 r
    where r.pharmacy_id = p_pharmacy_id
      and r.status = 'PENDING'
      and r.workflow = upper(trim(coalesce(p_workflow,'RECEIVING')))
      and (
        nullif(trim(coalesce(p_order_number,'')),'') is null
        or coalesce(r.order_number,'') = trim(p_order_number)
      )
    order by r.created_at desc;
end;
$function$
;
REVOKE ALL ON FUNCTION public.list_pharmflow_needs_review_v2(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_needs_review_v2(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_pharmflow_new_item_history_v1(p_pharmacy_id uuid, p_from date, p_to date)
 RETURNS TABLE(workspace_history_id uuid, completed_at timestamp with time zone, order_number text, order_name text, order_date date, item_code text, item_name text, ordered_qty numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_new_item_history_v1');
 RETURN QUERY select h.id,h.completed_at,i.order_number,i.order_name,i.order_date,i.item_code,i.item_name,i.ordered_qty
      from public.pharmflow_receiving_workspace_history_v1 h
      join public.pharmflow_receiving_history_items_v1 i
        on i.workspace_history_id=h.id and i.pharmacy_id=h.pharmacy_id
     where h.pharmacy_id=p_pharmacy_id and i.event_type='NEW_ITEM'
       and auth.uid() is not null and public.is_pharmacy_member(p_pharmacy_id)
       and h.completed_at >= p_from::timestamptz
       and h.completed_at < (p_to + 1)::timestamptz
     order by h.completed_at desc,i.order_number,i.item_name,i.item_code;
END;
$function$
;
REVOKE ALL ON FUNCTION public.list_pharmflow_new_item_history_v1(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_new_item_history_v1(uuid,date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_pharmflow_receiving_workspace_history_v1(p_pharmacy_id uuid, p_from date, p_to date)
 RETURNS TABLE(workspace_history_id uuid, completed_at timestamp with time zone, orders_count integer, discrepancy_count integer, new_item_count integer, order_numbers text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_receiving_workspace_history_v1');
 RETURN QUERY select h.id,h.completed_at,h.orders_count,h.discrepancy_count,h.new_item_count,h.order_numbers
      from public.pharmflow_receiving_workspace_history_v1 h
     where h.pharmacy_id=p_pharmacy_id
       and auth.uid() is not null and public.is_pharmacy_member(p_pharmacy_id)
       and h.completed_at >= p_from::timestamptz
       and h.completed_at < (p_to + 1)::timestamptz
     order by h.completed_at desc;
END;
$function$
;
REVOKE ALL ON FUNCTION public.list_pharmflow_receiving_workspace_history_v1(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pharmflow_receiving_workspace_history_v1(uuid,date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.patch_pharmflow_item_priorities_v1(p_pharmacy_id uuid, p_changes jsonb, p_expected_generation bigint, p_expected_revision bigint)
 RETURNS TABLE(revision bigint, updated_at timestamp with time zone, changed_items integer, order_files integer, order_items integer, workspace_generation bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_generation bigint;
    v_revision bigint;
    v_manifest jsonb;
    v_change_map jsonb;
    v_order_data jsonb;
    v_changed integer;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'patch_pharmflow_item_priorities_v1');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes)=0 then
        raise exception 'Priority changes must be a non-empty JSON array';
    end if;

    if exists (
        select 1
          from jsonb_array_elements(p_changes) c
         where trim(coalesce(c->>'itemCode',''))=''
            or upper(trim(coalesce(c->>'priorityType',''))) not in ('','SHORT','NEW')
    ) then
        raise exception 'Invalid item priority change';
    end if;

    select coalesce(
        jsonb_object_agg(
            trim(c->>'itemCode'),
            to_jsonb(upper(trim(coalesce(c->>'priorityType',''))))
        ),
        '{}'::jsonb
    )
      into v_change_map
      from jsonb_array_elements(p_changes) c;

    select g.generation
      into v_generation
      from public.pharmflow_workspace_generation_v1 g
     where g.pharmacy_id=p_pharmacy_id
     for update;

    if coalesce(p_expected_generation,-1) <> coalesce(v_generation,0) then
        raise exception 'STALE_WORKSPACE_GENERATION';
    end if;

    select m.manifest,m.revision
      into v_manifest,v_revision
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id
     for update;

    if v_manifest is null then
        raise exception 'Active Order Manifest not found';
    end if;

    if coalesce(p_expected_revision,-1) <> coalesce(v_revision,0) then
        raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';
    end if;

    select
        jsonb_agg(
            case
                when v_change_map ? coalesce(item->>'itemCode',item->>'itemNumber','')
                then jsonb_set(
                    jsonb_set(
                        item,
                        '{priorityType}',
                        v_change_map->coalesce(item->>'itemCode',item->>'itemNumber',''),
                        true
                    ),
                    '{highPriority}',
                    to_jsonb(
                        coalesce(
                            v_change_map->>coalesce(item->>'itemCode',item->>'itemNumber',''),
                            ''
                        ) <> ''
                    ),
                    true
                )
                else item
            end
            order by ordinal_position
        ),
        count(*) filter (
            where v_change_map ? coalesce(item->>'itemCode',item->>'itemNumber','')
        )::integer
      into v_order_data,v_changed
      from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb))
           with ordinality as entries(item,ordinal_position);

    if coalesce(v_changed,0) <> (
        select count(*) from jsonb_object_keys(v_change_map)
    ) then
        raise exception 'One or more priority items are not in the Active Order Manifest';
    end if;

    update public.pharmflow_active_order_manifest_v1 m
       set manifest=jsonb_set(m.manifest,'{orderData}',v_order_data,false),
           revision=m.revision+1,
           updated_at=now(),
           updated_by=auth.uid()
     where m.pharmacy_id=p_pharmacy_id;

    return query
    select m.revision,m.updated_at,v_changed,
           jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
           jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),
           m.workspace_generation
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id;
end;
$function$
;
REVOKE ALL ON FUNCTION public.patch_pharmflow_item_priorities_v1(uuid,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.patch_pharmflow_item_priorities_v1(uuid,jsonb,bigint,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.patch_pharmflow_item_priorities_v2(p_pharmacy_id uuid, p_changes jsonb, p_expected_generation bigint, p_expected_revision bigint)
 RETURNS TABLE(revision bigint, updated_at timestamp with time zone, changed_items integer, order_files integer, order_items integer, workspace_generation bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_generation bigint;
    v_revision bigint;
    v_manifest jsonb;
    v_change_map jsonb;
    v_order_data jsonb;
    v_changed integer;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'patch_pharmflow_item_priorities_v2');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes)=0 then
        raise exception 'Priority changes must be a non-empty JSON array';
    end if;
    if exists (
        select 1 from jsonb_array_elements(p_changes) c
         where trim(coalesce(c->>'itemCode',''))=''
            or upper(trim(coalesce(c->>'priorityType',''))) not in ('','SHORT','NEW')
    ) then
        raise exception 'Invalid item priority change';
    end if;
    select coalesce(jsonb_object_agg(
        trim(c->>'itemCode'),
        to_jsonb(upper(trim(coalesce(c->>'priorityType',''))))
    ),'{}'::jsonb)
      into v_change_map
      from jsonb_array_elements(p_changes) c;
    select g.generation into v_generation
      from public.pharmflow_workspace_generation_v1 g
     where g.pharmacy_id=p_pharmacy_id for update;
    if coalesce(p_expected_generation,-1) <> coalesce(v_generation,0) then
        raise exception 'STALE_WORKSPACE_GENERATION';
    end if;
    select m.manifest,m.revision into v_manifest,v_revision
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id for update;
    if v_manifest is null then raise exception 'Active Order Manifest not found'; end if;
    if coalesce(p_expected_revision,-1) <> coalesce(v_revision,0) then
        raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';
    end if;
    select jsonb_agg(
        case when v_change_map ? coalesce(item->>'itemCode',item->>'itemNumber','')
        then jsonb_set(jsonb_set(
            item,'{priorityType}',
            v_change_map->coalesce(item->>'itemCode',item->>'itemNumber',''),true
        ),'{highPriority}',to_jsonb(
            coalesce(v_change_map->>coalesce(item->>'itemCode',item->>'itemNumber',''),'') <> ''
        ),true)
        else item end order by ordinal_position
    ),count(distinct coalesce(item->>'itemCode',item->>'itemNumber','')) filter (
        where v_change_map ? coalesce(item->>'itemCode',item->>'itemNumber','')
    )::integer
      into v_order_data,v_changed
      from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb))
           with ordinality as entries(item,ordinal_position);
    if coalesce(v_changed,0) <> (select count(*) from jsonb_object_keys(v_change_map)) then
        raise exception 'One or more priority items are not in the Active Order Manifest';
    end if;
    update public.pharmflow_active_order_manifest_v1 m
       set manifest=jsonb_set(m.manifest,'{orderData}',v_order_data,false),
           revision=m.revision+1,updated_at=now(),updated_by=auth.uid()
     where m.pharmacy_id=p_pharmacy_id;
    return query select m.revision,m.updated_at,v_changed,
        jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
        jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),
        m.workspace_generation
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id;
end;
$function$
;
REVOKE ALL ON FUNCTION public.patch_pharmflow_item_priorities_v2(uuid,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.patch_pharmflow_item_priorities_v2(uuid,jsonb,bigint,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.pharmflow_receiving_sync_health_v2(p_pharmacy_id uuid)
 RETURNS TABLE(transaction_count bigint, last_transaction_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'pharmflow_receiving_sync_health_v2');

    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    return query
    select count(*)::bigint,max(t.occurred_at)
    from public.pharmflow_receiving_transactions_v1 t
    where t.pharmacy_id=p_pharmacy_id;
end;
$function$
;
REVOKE ALL ON FUNCTION public.pharmflow_receiving_sync_health_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pharmflow_receiving_sync_health_v2(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.resolve_pharmacy_needs_review(p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text)
 RETURNS TABLE(review_id uuid, workflow text, gtin text, pending_quantity integer, expiry_month integer, expiry_year integer, worker_id uuid, captured_by_name text, device_id text, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.pharmflow_needs_review_v1%rowtype;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,coalesce((select nr_compat.workflow from public.pharmflow_needs_review_v1 nr_compat where nr_compat.id=p_review_id and nr_compat.pharmacy_id=p_pharmacy_id),'RECEIVING'),true,'resolve_pharmacy_needs_review');
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'resolve_pharmacy_needs_review');

 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 select * into r from public.pharmflow_needs_review_v1 where id=p_review_id and pharmacy_id=p_pharmacy_id and status='PENDING' for update;
 if not found then raise exception 'Review item not found'; end if;
 update public.pharmflow_needs_review_v1 set status='RESOLVED',resolved_item_code=trim(p_item_code),resolved_item_name=trim(p_item_name),resolved_by=auth.uid(),resolved_at=now(),updated_at=now() where id=p_review_id;
 return query select r.id,r.workflow,r.gtin,r.pending_quantity,r.expiry_month,r.expiry_year,r.worker_id,coalesce(r.captured_by_name,''),coalesce(r.device_id,''),r.source;
end $function$
;
REVOKE ALL ON FUNCTION public.resolve_pharmacy_needs_review(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pharmacy_needs_review(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pharmacy_needs_review(uuid,uuid,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_pharmacy_needs_review(uuid,uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.resolve_pharmflow_needs_review_v3(p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text, p_resolution_type text, p_resolution_transaction_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_review public.pharmflow_needs_review_v2%rowtype;v_order_status text;v_item_code text:=btrim(coalesce(p_item_code,''));begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'resolve_pharmflow_needs_review_v3');
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',true,'resolve_pharmflow_needs_review_v3');
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required';end if;select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id for update;if v_review.id is null then raise exception 'Needs Review case is unavailable';end if;if v_review.status<>'PENDING' then raise exception 'Needs Review case is no longer pending';end if;if nullif(btrim(coalesce(v_review.order_number,'')),'') is null then update public.pharmflow_needs_review_v2 set resolution_block_code='ORIGINAL_ORDER_UNAVAILABLE',resolution_block_detail='The case has no original Receiving order.',updated_at=now() where id=v_review.id;return jsonb_build_object('success',false,'blocked',true,'code','ORIGINAL_ORDER_UNAVAILABLE');end if;select status into v_order_status from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and order_number=v_review.order_number;if v_order_status is distinct from 'uploaded' then update public.pharmflow_needs_review_v2 set resolution_block_code='ORIGINAL_ORDER_UNAVAILABLE',resolution_block_detail='The original order is finalized, inactive, or unavailable.',updated_at=now() where id=v_review.id;return jsonb_build_object('success',false,'blocked',true,'code','ORIGINAL_ORDER_UNAVAILABLE','orderNumber',v_review.order_number);end if;if v_item_code='' or not exists(select 1 from public.pharmflow_order_source_items where pharmacy_id=p_pharmacy_id and order_number=v_review.order_number and item_code=v_item_code) then update public.pharmflow_needs_review_v2 set resolution_block_code='ITEM_NOT_IN_ORIGINAL_ORDER',resolution_block_detail='The selected item is not in the case original order.',updated_at=now() where id=v_review.id;return jsonb_build_object('success',false,'blocked',true,'code','ITEM_NOT_IN_ORIGINAL_ORDER','orderNumber',v_review.order_number);end if;if upper(btrim(coalesce(p_resolution_type,'')))<>'LINK_ORDER_ITEM' or nullif(btrim(coalesce(p_resolution_transaction_id,'')),'') is null then update public.pharmflow_needs_review_v2 set resolution_block_code='RECEIVING_TRANSACTION_REQUIRED',resolution_block_detail='Resolution requires a Receiving transaction attributed to the original order.',updated_at=now() where id=v_review.id;return jsonb_build_object('success',false,'blocked',true,'code','RECEIVING_TRANSACTION_REQUIRED','orderNumber',v_review.order_number);end if;if not exists(select 1 from public.pharmflow_receiving_transactions_v1 t where t.pharmacy_id=p_pharmacy_id and t.transaction_id=btrim(p_resolution_transaction_id) and t.order_number=v_review.order_number and t.item_code=v_item_code and t.quantity>0) then update public.pharmflow_needs_review_v2 set resolution_block_code='RECEIVING_TRANSACTION_ORDER_MISMATCH',resolution_block_detail='The supplied Receiving transaction does not belong to the original order and selected item.',updated_at=now() where id=v_review.id;return jsonb_build_object('success',false,'blocked',true,'code','RECEIVING_TRANSACTION_ORDER_MISMATCH','orderNumber',v_review.order_number);end if;update public.pharmflow_needs_review_v2 set status='RESOLVED',resolved_item_code=v_item_code,resolved_item_name=btrim(coalesce(p_item_name,'')),resolution_type='LINK_ORDER_ITEM',resolution_transaction_id=btrim(p_resolution_transaction_id),resolved_by=auth.uid(),resolved_at=now(),resolution_block_code=null,resolution_block_detail=null,updated_at=now() where id=v_review.id;return jsonb_build_object('success',true,'orderNumber',v_review.order_number);end $function$
;
REVOKE ALL ON FUNCTION public.resolve_pharmflow_needs_review_v3(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pharmflow_needs_review_v3(uuid,uuid,text,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_pharmflow_active_order_manifest(p_pharmacy_id uuid, p_manifest jsonb)
 RETURNS TABLE(revision bigint, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_active_order_manifest');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    insert into public.pharmflow_active_order_manifest_v1(
        pharmacy_id,manifest,revision,updated_at,updated_by
    )
    values(
        p_pharmacy_id,
        coalesce(p_manifest,'{}'::jsonb),
        1,
        now(),
        auth.uid()
    )
    on conflict(pharmacy_id)
    do update set
        manifest=excluded.manifest,
        revision=public.pharmflow_active_order_manifest_v1.revision+1,
        updated_at=now(),
        updated_by=auth.uid();

    return query
    select m.revision,m.updated_at
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id;
end;
$function$
;
REVOKE ALL ON FUNCTION public.save_pharmflow_active_order_manifest(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_active_order_manifest(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_pharmflow_active_order_manifest_v2(p_pharmacy_id uuid, p_manifest jsonb)
 RETURNS TABLE(revision bigint, updated_at timestamp with time zone, order_files integer, order_items integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_files integer;
    v_items integer;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_active_order_manifest_v2');

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    v_files :=
        jsonb_array_length(
            coalesce(p_manifest->'orderFiles','[]'::jsonb)
        );

    v_items :=
        jsonb_array_length(
            coalesce(p_manifest->'orderData','[]'::jsonb)
        );

    if v_files <= 0 or v_items <= 0 then
        raise exception
            'Active Order Manifest requires orderFiles and orderData';
    end if;

    insert into public.pharmflow_active_order_manifest_v1(
        pharmacy_id,
        manifest,
        revision,
        updated_at,
        updated_by
    )
    values(
        p_pharmacy_id,
        p_manifest,
        1,
        now(),
        auth.uid()
    )
    on conflict(pharmacy_id)
    do update set
        manifest=excluded.manifest,
        revision=
            public.pharmflow_active_order_manifest_v1.revision+1,
        updated_at=now(),
        updated_by=auth.uid();

    return query
    select
        m.revision,
        m.updated_at,
        jsonb_array_length(
            coalesce(m.manifest->'orderFiles','[]'::jsonb)
        ),
        jsonb_array_length(
            coalesce(m.manifest->'orderData','[]'::jsonb)
        )
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id=p_pharmacy_id;
end;
$function$
;
REVOKE ALL ON FUNCTION public.save_pharmflow_active_order_manifest_v2(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_active_order_manifest_v2(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_pharmflow_finalized_archive(p_pharmacy_id uuid, p_archive_id text, p_order_numbers text[], p_closed_at timestamp with time zone, p_archive_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_finalized_archive');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if nullif(trim(coalesce(p_archive_id,'')),'') is null then
        raise exception 'Archive id is required';
    end if;

    insert into public.pharmflow_finalized_archives_v1(
        pharmacy_id, archive_id, order_numbers, closed_at,
        archive_payload, created_by
    )
    values(
        p_pharmacy_id,
        trim(p_archive_id),
        coalesce(p_order_numbers,'{}'::text[]),
        coalesce(p_closed_at,now()),
        coalesce(p_archive_payload,'{}'::jsonb),
        auth.uid()
    )
    on conflict(pharmacy_id,archive_id)
    do update set
        order_numbers=excluded.order_numbers,
        closed_at=excluded.closed_at,
        archive_payload=excluded.archive_payload;

    return true;
end;
$function$
;
REVOKE ALL ON FUNCTION public.save_pharmflow_finalized_archive(uuid,text,text[],timestamp with time zone,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_finalized_archive(uuid,text,text[],timestamp with time zone,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_pharmflow_order_source_items(p_pharmacy_id uuid, p_order_number text, p_items jsonb, p_replace boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order_id uuid;
  v_count integer:=0;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'save_pharmflow_order_source_items');

  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access required';
  end if;

  select id into v_order_id
  from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=
        upper(regexp_replace(p_order_number,'\\s','','g'))
  limit 1;

  if v_order_id is null then
    raise exception 'Order % is not registered',p_order_number;
  end if;

  if p_replace then
    if exists(
      select 1 from public.pharmflow_orders
      where id=v_order_id and status='received'
    ) then
      raise exception 'Received order source data is immutable';
    end if;
    delete from public.pharmflow_order_source_items where order_id=v_order_id;
  end if;

  insert into public.pharmflow_order_source_items(
    pharmacy_id,order_id,order_number,line_no,item_code,item_name,
    ordered_qty,category,source_sheet,source_row
  )
  select
    p_pharmacy_id,
    v_order_id,
    upper(regexp_replace(trim(p_order_number),'\\s','','g')),
    (x->>'line_no')::integer,
    trim(x->>'item_code'),
    coalesce(x->>'item_name',''),
    (x->>'ordered_qty')::numeric,
    coalesce(x->>'category',''),
    coalesce(x->>'source_sheet',''),
    nullif(x->>'source_row','')::integer
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
  where nullif(trim(x->>'item_code'),'') is not null
    and coalesce((x->>'ordered_qty')::numeric,0)>0
  on conflict(order_id,line_no) do update set
    item_code=excluded.item_code,
    item_name=excluded.item_name,
    ordered_qty=excluded.ordered_qty,
    category=excluded.category,
    source_sheet=excluded.source_sheet,
    source_row=excluded.source_row;

  get diagnostics v_count=row_count;
  return v_count;
end;
$function$
;
REVOKE ALL ON FUNCTION public.save_pharmflow_order_source_items(uuid,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_order_source_items(uuid,text,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_order_source_items(uuid,text,jsonb,boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_order_source_items(uuid,text,jsonb,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.set_pharmacy_needs_review_quantity(p_pharmacy_id uuid, p_review_id uuid, p_pending_quantity integer)
 RETURNS TABLE(review_id uuid, pending_quantity integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_q integer:=greatest(coalesce(p_pending_quantity,1),1);
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',true,'set_pharmacy_needs_review_quantity');

 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 return query
 update public.pharmflow_needs_review_v1 r
 set pending_quantity=v_q,updated_at=now()
 where r.id=p_review_id and r.pharmacy_id=p_pharmacy_id and r.status='PENDING' and r.workflow='RECEIVING'
 returning r.id,r.pending_quantity,r.updated_at;
 if not found then raise exception 'Pending review item not found'; end if;
end $function$
;
REVOKE ALL ON FUNCTION public.set_pharmacy_needs_review_quantity(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_pharmacy_needs_review_quantity(uuid,uuid,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.verify_pharmflow_historical_state_v2(p_pharmacy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_historical_orders bigint;
    v_archives bigint;
    v_active_orders bigint;
begin
 PERFORM pharmflow_auth_private.require_receiving_compat(p_pharmacy_id,'RECEIVING',false,'verify_pharmflow_historical_state_v2');

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    select count(*) into v_historical_orders
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,''))) in ('received','finalized','closed');

    select count(*) into v_archives
      from public.pharmflow_finalized_archives_v1 a
     where a.pharmacy_id=p_pharmacy_id;

    select count(*) into v_active_orders
      from public.pharmflow_orders o
     where o.pharmacy_id=p_pharmacy_id
       and lower(trim(coalesce(o.status,'uploaded'))) not in ('received','finalized','closed');

    return jsonb_build_object(
        'pharmacy_id',p_pharmacy_id,
        'historical_orders_remaining',v_historical_orders,
        'finalized_archives_remaining',v_archives,
        'active_orders_present',v_active_orders,
        'historical_data_empty',(v_historical_orders=0 and v_archives=0)
    );
end;
$function$
;
REVOKE ALL ON FUNCTION public.verify_pharmflow_historical_state_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pharmflow_historical_state_v2(uuid) TO authenticated;


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

-- Auto-confirmed email is not proof of ownership. Only trusted user-ID binding
-- from owner assignment/provisioning/approval may grant Admin membership.
-- This compatibility RPC is now a read-only, idempotent projection.
CREATE OR REPLACE FUNCTION public.claim_pharmacy_admin_assignment()
RETURNS TABLE(pharmacy_id uuid, pharmacy_code text, pharmacy_name text, member_role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $claim$
BEGIN
 IF auth.uid() IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required';
 END IF;
 IF NOT pharmflow_auth_private.password_change_complete() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PASSWORD_CHANGE_REQUIRED';
 END IF;
 RETURN QUERY
 SELECT p.id,p.code,p.name,'admin'::text
 FROM public.pharmacy_admin_assignments a
 JOIN public.pharmacy_members m ON m.pharmacy_id=a.pharmacy_id AND m.user_id=auth.uid()
 JOIN public.pharmacies p ON p.id=a.pharmacy_id
 WHERE a.status='claimed' AND a.claimed_by=auth.uid()
 AND m.active AND m.role='admin' AND p.active AND p.status='active'
 ORDER BY a.assigned_at DESC LIMIT 1;
END $claim$;
REVOKE ALL ON FUNCTION public.claim_pharmacy_admin_assignment() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_pharmacy_admin_assignment() TO authenticated;
NOTIFY pgrst,'reload schema';
