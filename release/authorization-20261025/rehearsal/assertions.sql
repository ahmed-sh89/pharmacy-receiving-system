DO $$BEGIN
 IF pg_get_function_result('public.count_pharmflow_needs_review_v2(uuid,text)'::regprocedure)<>'integer' THEN RAISE EXCEPTION 'Integer contract changed';END IF;
END $$;
-- Ordinary user role, never bootstrap/superuser, for operational authorization checks.
SET LOCAL ROLE authenticated;
DO $$DECLARE p uuid:='20000000-0000-4000-8000-000000000001';b uuid:='20000000-0000-4000-8000-000000000002';j jsonb;BEGIN
 IF (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'Invalid test role';END IF;
 IF public.count_pharmflow_needs_review_v2(p,'RECEIVING')<>2 OR public.count_pharmflow_needs_review_v2(p,'EXPIRY')<>1 THEN RAISE EXCEPTION 'Receiving/Expiry count behavior changed';END IF;
 IF pg_typeof(public.count_pharmflow_needs_review_v2(p,'RECEIVING'))<>'integer'::regtype THEN RAISE EXCEPTION 'Runtime count type changed';END IF;
 BEGIN PERFORM public.count_pharmflow_needs_review_v2(b,'RECEIVING');RAISE EXCEPTION 'Foreign count bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF EXISTS(SELECT 1 FROM public.pharmflow_pharmacy_permissions_v1 WHERE pharmacy_id=b) THEN RAISE EXCEPTION 'Permission RLS leak';END IF;
 IF (SELECT count(*) FROM public.pharmflow_pharmacy_permissions_v1)<>1 THEN RAISE EXCEPTION 'Own policy inaccessible';END IF;
 j:=public.get_my_pharmflow_permissions_v1(p);
 IF j->>'data_access'<>'PHARMACY_GLOBAL' OR j->>'receiving'<>'FULL' OR j->>'expiry'<>'FULL' THEN RAISE EXCEPTION 'HHP084 bootstrap incorrect';END IF;
 BEGIN UPDATE public.pharmflow_pharmacy_permissions_v1 SET receiving='FULL' WHERE pharmacy_id=b;RAISE EXCEPTION 'Unauthorized permission write';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SET LOCAL ROLE postgres;
UPDATE public.pharmflow_pharmacy_permissions_v1 SET receiving='DISABLED' WHERE pharmacy_id='20000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$BEGIN
 BEGIN PERFORM public.count_pharmflow_needs_review_v2('20000000-0000-4000-8000-000000000001','RECEIVING');RAISE EXCEPTION 'Receiving Disabled bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF public.count_pharmflow_needs_review_v2('20000000-0000-4000-8000-000000000001','EXPIRY')<>1 THEN RAISE EXCEPTION 'Expiry affected by Receiving Disabled';END IF;
END $$;
SET LOCAL ROLE postgres;
UPDATE public.pharmflow_pharmacy_permissions_v1 SET receiving='READ_ONLY',expiry='DISABLED' WHERE pharmacy_id='20000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$BEGIN
 IF public.count_pharmflow_needs_review_v2('20000000-0000-4000-8000-000000000001','RECEIVING')<>2 THEN RAISE EXCEPTION 'Legacy Read Only promoted or count blocked';END IF;
 BEGIN PERFORM public.count_pharmflow_needs_review_v2('20000000-0000-4000-8000-000000000001','EXPIRY');RAISE EXCEPTION 'Expiry Disabled bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SET LOCAL ROLE postgres;
UPDATE public.pharmflow_pharmacy_permissions_v1 SET receiving='FULL',expiry='FULL' WHERE pharmacy_id='20000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
SELECT set_config('request.path','rpc/count_pharmflow_needs_review_v2',true);
SET LOCAL ROLE authenticated;
DO $$BEGIN
 BEGIN PERFORM public.pharmflow_password_change_request_guard();RAISE EXCEPTION 'Forced password request bypass';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'PASSWORD_CHANGE_REQUIRED' THEN RAISE;END IF;END;
 BEGIN PERFORM public.count_pharmflow_needs_review_v2('20000000-0000-4000-8000-000000000001','RECEIVING');RAISE EXCEPTION 'Forced password RPC bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SET LOCAL ROLE postgres;
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
DO $$BEGIN
 BEGIN PERFORM public.count_pharmflow_needs_review_v2('20000000-0000-4000-8000-000000000001','RECEIVING');RAISE EXCEPTION 'Missing identity bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SET LOCAL ROLE postgres;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
DO $$DECLARE n integer;BEGIN
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.prosrc LIKE '%LEGACY_RECEIVING_RETIRED%' AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE');
 IF n<>11 THEN RAISE EXCEPTION 'Legacy retirement ACL/body mismatch';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='pharmflow_module_read' AND NOT polpermissive) THEN RAISE EXCEPTION 'Storage restrictive policy missing';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.pharmflow_expiry_current_state_v1'::regclass AND NOT polpermissive) THEN RAISE EXCEPTION 'Expiry restrictive policy missing';END IF;
END $$;
