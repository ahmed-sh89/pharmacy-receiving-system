-- Staging only. Existing QA identities; all fixtures/profile updates roll back.
BEGIN;
DO $test$
DECLARE owner_id uuid;qa_id uuid;qa_email text;pid uuid;op uuid:=gen_random_uuid();j jsonb;n integer;
BEGIN
 SELECT user_id INTO owner_id FROM public.system_owners LIMIT 1;
 SELECT id,email INTO qa_id,qa_email FROM auth.users WHERE email LIKE 'pf-parity-%-admin@pharmflow.test'
 AND coalesce(raw_app_meta_data->>'pharmflow_must_change_password','false')<>'true' LIMIT 1;
 IF owner_id IS NULL OR qa_id IS NULL THEN RAISE EXCEPTION 'QA identities unavailable';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 j:=public.owner_provision_pharmacy_v2(op,'Disposable claim security','QA'||left(op::text,8),qa_email,'FULL','DISABLED','PHARMACY_ONLY',false);
 pid:=(j->>'pharmacy_id')::uuid;
 IF EXISTS(SELECT 1 FROM public.pharmacies WHERE id=pid AND active) THEN RAISE EXCEPTION 'Incomplete provisioning active';END IF;
 j:=public.owner_provision_pharmacy_v2(op,'Disposable claim security','QA'||left(op::text,8),qa_email,'FULL','DISABLED','PHARMACY_ONLY',true);
 IF NOT EXISTS(SELECT 1 FROM public.pharmflow_pharmacy_permissions_v1 WHERE pharmacy_id=pid AND receiving='FULL' AND expiry='DISABLED' AND data_access='PHARMACY_ONLY') THEN RAISE EXCEPTION 'Initial policy not persisted';END IF;
 -- Scope the claim to this synthetic assignment without affecting other records.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',qa_id,'role','authenticated')::text,true);
 SELECT count(*) INTO n FROM public.claim_pharmacy_admin_assignment() WHERE pharmacy_id=pid;
 IF n<>1 THEN RAISE EXCEPTION 'Trusted existing-account provisioning claim failed';END IF;
 SELECT count(*) INTO n FROM public.claim_pharmacy_admin_assignment() WHERE pharmacy_id=pid;
 IF n<>1 THEN RAISE EXCEPTION 'Duplicate claim retry failed';END IF;
 UPDATE public.pharmacy_admin_assignments SET status='pending',claimed_by=NULL,claimed_at=NULL WHERE pharmacy_id=pid;
 IF EXISTS(SELECT 1 FROM public.claim_pharmacy_admin_assignment() WHERE pharmacy_id=pid) THEN RAISE EXCEPTION 'Email-only pending claim bypass';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pharmacy_members WHERE pharmacy_id=pid AND user_id=qa_id AND active) THEN RAISE EXCEPTION 'Read-only claim changed existing membership';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 PERFORM public.owner_assign_pharmacy_admin(pid,qa_email);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',qa_id,'role','authenticated')::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.claim_pharmacy_admin_assignment() WHERE pharmacy_id=pid) THEN RAISE EXCEPTION 'Explicit reassignment unavailable';END IF;
 UPDATE public.pharmacies SET active=false,status='suspended' WHERE id=pid;
 IF EXISTS(SELECT 1 FROM public.claim_pharmacy_admin_assignment() WHERE pharmacy_id=pid) THEN RAISE EXCEPTION 'Suspended claim';END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: native trusted provisioning, initial permissions/default deny, existing-account claims/retries, pending denial, explicit owner assignment, suspension; fixtures rolled back' result;
