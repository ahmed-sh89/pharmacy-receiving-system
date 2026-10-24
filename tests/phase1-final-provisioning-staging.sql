-- Isolated Staging transaction: no records, credentials or policies are retained.
BEGIN;
DO $test$
DECLARE owner_id uuid; a uuid; email_value text; op uuid:=gen_random_uuid(); failop uuid:=gen_random_uuid();
 pid uuid; failpid uuid; result jsonb; again jsonb; rev bigint; req uuid:=gen_random_uuid(); applicant uuid:=gen_random_uuid(); approved uuid;
BEGIN
 SELECT u.id INTO owner_id FROM auth.users u JOIN public.system_owners s ON s.user_id=u.id WHERE u.email LIKE 'pf-parity-%-owner@pharmflow.test' LIMIT 1;
 SELECT id,email INTO a,email_value FROM auth.users WHERE email LIKE 'pf-parity-%-admin@pharmflow.test' LIMIT 1;
 IF owner_id IS NULL OR a IS NULL THEN RAISE EXCEPTION 'Isolated QA identities missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 BEGIN
  PERFORM public.owner_provision_pharmacy_v2(op,'Refinement QA','RF'||left(op::text,8),email_value,NULL,'FULL','READ_ONLY');
  RAISE EXCEPTION 'Missing explicit permission accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Missing explicit permission accepted' THEN RAISE; END IF; END;
 result:=public.owner_provision_pharmacy_v2(op,'Refinement QA','RF'||left(op::text,8),email_value,'FULL','DISABLED','PHARMACY_ONLY');
 pid:=(result->>'pharmacy_id')::uuid;
 IF EXISTS(SELECT 1 FROM public.pharmacies WHERE id=pid AND (active OR status<>'suspended')) THEN RAISE EXCEPTION 'Incomplete account active'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pharmflow_pharmacy_permissions_v1 WHERE pharmacy_id=pid AND receiving='DISABLED' AND expiry='DISABLED' AND data_access='READ_ONLY') THEN RAISE EXCEPTION 'Provisioning not default deny'; END IF;
 -- Supported alternate invitation/admin assignment cannot grant business access while incomplete.
 PERFORM public.owner_assign_pharmacy_admin(pid,email_value);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 IF pharmflow_auth_private.module_allowed(pid,'RECEIVING') OR pharmflow_auth_private.data_allowed(pid) THEN RAISE EXCEPTION 'Incomplete business access'; END IF;
 BEGIN PERFORM public.owner_set_pharmflow_permissions_v1(pid,'FULL','FULL','PHARMACY_GLOBAL'); RAISE EXCEPTION 'Self grant accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.list_pharmflow_orders(pid); RAISE EXCEPTION 'Incomplete RPC accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 result:=public.owner_provision_pharmacy_v2(op,'Refinement QA','RF'||left(op::text,8),email_value,'FULL','DISABLED','PHARMACY_ONLY',true);
 SELECT revision INTO rev FROM public.pharmflow_pharmacy_permissions_v1 WHERE pharmacy_id=pid;
 again:=public.owner_provision_pharmacy_v2(op,'Refinement QA','RF'||left(op::text,8),email_value,'FULL','DISABLED','PHARMACY_ONLY',true);
 IF result<>again OR (SELECT revision FROM public.pharmflow_pharmacy_permissions_v1 WHERE pharmacy_id=pid)<>rev THEN RAISE EXCEPTION 'Retry changed policy'; END IF;
 BEGIN PERFORM public.owner_provision_pharmacy_v2(op,'Refinement QA','RF'||left(op::text,8),email_value,'FULL','FULL','PHARMACY_GLOBAL',true); RAISE EXCEPTION 'Retry broadened permissions'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Retry broadened permissions' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 PERFORM public.list_pharmflow_orders(pid);
 BEGIN PERFORM public.list_pharmacy_expiry_current_state_v1(pid,false,NULL); RAISE EXCEPTION 'Disabled Expiry accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Partial finish failure must leave activation, membership and permission assignment uncommitted.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 result:=public.owner_provision_pharmacy_v2(failop,'Refinement Fail','FF'||left(failop::text,8),email_value,'DISABLED','FULL','READ_ONLY');failpid:=(result->>'pharmacy_id')::uuid;
 EXECUTE format('ALTER TABLE public.pharmflow_permission_audit_v1 ADD CONSTRAINT qa_initial_capture_fail CHECK(pharmacy_id<>%L)',failpid);
 BEGIN PERFORM public.owner_provision_pharmacy_v2(failop,'Refinement Fail','FF'||left(failop::text,8),email_value,'DISABLED','FULL','READ_ONLY',true);RAISE EXCEPTION 'Atomic failure not raised';EXCEPTION WHEN check_violation THEN NULL;END;
 IF EXISTS(SELECT 1 FROM public.pharmacies WHERE id=failpid AND active) OR EXISTS(SELECT 1 FROM public.pharmacy_members WHERE pharmacy_id=failpid) OR EXISTS(SELECT 1 FROM pharmflow_auth_private.account_provision_v1 WHERE operation_id=failop AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'Partial finish leaked access'; END IF;
 ALTER TABLE public.pharmflow_permission_audit_v1 DROP CONSTRAINT qa_initial_capture_fail;
 PERFORM public.owner_provision_pharmacy_v2(failop,'Refinement Fail','FF'||left(failop::text,8),email_value,'DISABLED','FULL','READ_ONLY',true);
 -- Registration approval uses a synthetic DB identity only, not unverified live Auth activation.
 INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES(applicant,'refine-'||req::text||'@pharmflow.test','{}');
 INSERT INTO public.pharmacy_registration_requests(id,applicant_user_id,applicant_email,requested_pharmacy_name,requested_pharmacy_code,status) VALUES(req,applicant,'refine-'||req::text||'@pharmflow.test','Refinement Approval','RA'||left(req::text,8),'pending');
 BEGIN PERFORM public.owner_review_pharmacy_registration_v3(req,'approve','Refinement Approval','RA'||left(req::text,8));RAISE EXCEPTION 'Approval without policy accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Approval without policy accepted' THEN RAISE;END IF;END;
 result:=public.owner_review_pharmacy_registration_v3(req,'approve','Refinement Approval','RA'||left(req::text,8),NULL,'DISABLED','FULL','READ_ONLY');approved:=(result->>'pharmacy_id')::uuid;
 PERFORM public.owner_review_pharmacy_registration_v3(req,'approve','Refinement Approval','RA'||left(req::text,8),NULL,'DISABLED','FULL','READ_ONLY');
 IF NOT EXISTS(SELECT 1 FROM public.pharmflow_pharmacy_permissions_v1 WHERE pharmacy_id=approved AND receiving='DISABLED' AND expiry='FULL' AND data_access='READ_ONLY') THEN RAISE EXCEPTION 'Approved policy not saved'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',applicant,'role','authenticated')::text,true);
 IF (public.get_my_pharmacy_access_status_v1()->>'suspended')::boolean THEN RAISE EXCEPTION 'Active user shown suspended'; END IF;
 UPDATE public.pharmacies SET active=false,status='suspended' WHERE id=approved;
 IF NOT (public.get_my_pharmacy_access_status_v1()->>'suspended')::boolean THEN RAISE EXCEPTION 'Suspension status missing'; END IF;
 UPDATE public.pharmacies SET active=true,status='active' WHERE id=approved;
 IF (public.get_my_pharmacy_access_status_v1()->>'suspended')::boolean THEN RAISE EXCEPTION 'Reactivation status stale'; END IF;
 IF has_function_privilege('authenticated','public.owner_provision_pharmacy_v1(uuid,text,text,text,boolean)','execute') OR has_function_privilege('authenticated','public.owner_review_pharmacy_registration_v2(uuid,text,text,text,text)','execute') THEN RAISE EXCEPTION 'Legacy activation entry still callable'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: explicit initial policies, deny before finish, atomic failure/retry, independent RPCs, approval, suspension, legacy access, no self-grant' as result;
