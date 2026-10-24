-- Execute only against Staging. All fixtures/policy changes are rolled back.
BEGIN;
DO $test$
DECLARE a uuid; b uuid; owner_id uuid; pa uuid; pb uuid; h uuid; sid uuid:=gen_random_uuid();
 op uuid:=gen_random_uuid(); mapop uuid:=gen_random_uuid(); failop uuid:=gen_random_uuid();
 item text:='P2A-QA-'||left(op::text,8); bar text:='P2AGLOBAL'||replace(op::text,'-','');
 localbar text:='P2ALOCAL'||replace(op::text,'-',''); failbar text:='P2AFAIL'||replace(op::text,'-','');
 v jsonb; v2 jsonb; sess jsonb; cap jsonb; wid uuid; c integer;
BEGIN
 SELECT u.id INTO a FROM auth.users u WHERE u.email LIKE 'pf-parity-%-admin@pharmflow.test' LIMIT 1;
 SELECT u.id INTO b FROM auth.users u WHERE u.email LIKE 'pf-parity-%-other@pharmflow.test' LIMIT 1;
 SELECT u.id INTO owner_id FROM auth.users u JOIN public.system_owners s ON s.user_id=u.id WHERE u.email LIKE 'pf-parity-%-owner@pharmflow.test' LIMIT 1;
 IF a IS NULL OR b IS NULL OR owner_id IS NULL THEN RAISE EXCEPTION 'Isolated parity QA identities missing'; END IF;
 SELECT pharmacy_id INTO pa FROM public.pharmacy_members WHERE user_id=a AND active LIMIT 1;
 SELECT pharmacy_id INTO pb FROM public.pharmacy_members WHERE user_id=b AND active LIMIT 1;
 INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after) VALUES(sid,a,now(),now(),now()+interval '1 hour');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 PERFORM public.owner_set_pharmflow_permissions_v1(pa,'FULL','FULL','PHARMACY_GLOBAL');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sid,'exp',extract(epoch FROM now()+interval '1 hour'))::text,true);
 PERFORM set_config('pharmflow.permission_pharmacy','',true);
 v:=public.create_pharmflow_global_item_v2(op,item,'Phase2A synthetic item','Medicine',NULL,NULL,bar,'PHASE2A_QA');
 v2:=public.create_pharmflow_global_item_v2(op,item,'Phase2A synthetic item','Medicine',NULL,NULL,bar,'PHASE2A_QA');
 IF (SELECT count(*) FROM public.pharmflow_global_items_v2 WHERE item_code=item)<>1 THEN RAISE EXCEPTION 'Global idempotency failure'; END IF;
 BEGIN PERFORM public.create_pharmflow_global_item_v2(gen_random_uuid(),item||'BAD','Invalid Group','Invalid',NULL,NULL,bar||'BAD','QA'); RAISE EXCEPTION 'Invalid Group accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Invalid Group accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM public.owner_set_pharmflow_permissions_v1(pa,'FULL','FULL','PHARMACY_GLOBAL'); RAISE EXCEPTION 'Self grant accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.list_pharmflow_orders(pb); RAISE EXCEPTION 'Cross pharmacy accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 -- Receiving READ_ONLY independently of Expiry FULL.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 PERFORM public.owner_set_pharmflow_permissions_v1(pa,'READ_ONLY','FULL','READ_ONLY');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sid,'exp',extract(epoch FROM now()+interval '1 hour'))::text,true);
 PERFORM public.list_pharmflow_orders(pa);
 PERFORM public.get_pharmflow_workspace_generation(pa);
 BEGIN PERFORM public.register_pharmflow_order_upload(pa,'P2A-DENIED',current_date,'QA','QA','QA',0); RAISE EXCEPTION 'Readonly Receiving write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.reserve_pharmflow_expiry_capture_v1(pa,gen_random_uuid());
 IF pharmflow_auth_private.storage_allowed(pa::text||'/receiving/qa.png',true) THEN RAISE EXCEPTION 'Readonly Receiving Storage write allowed'; END IF;
 IF NOT pharmflow_auth_private.storage_allowed(pa::text||'/expiry-v1/qa.png',true) THEN RAISE EXCEPTION 'Expiry independence failed'; END IF;

 -- Expiry FULL capture succeeds with Item/Barcode READ_ONLY, retaining idempotency.
 SELECT worker_id INTO wid FROM public.list_pharmacy_expiry_workers(pa) LIMIT 1;
 sess:=public.get_pharmflow_expiry_auth_session_v1(pa,'phase2a-qa');
 cap:=jsonb_build_object('kind','KNOWN','identifier_display',bar,'raw_scan',bar,'scan_format','PLAIN','quantity',1,
 'expiry_month',12,'expiry_year',2030,'worker_id',wid,'device_id','phase2a-qa','source','PC','batch_no','P2A','sample_serial',NULL,
 'item_code',item,'item_name','Phase2A synthetic item','category','Medicine');
 op:=gen_random_uuid();
 v:=public.save_pharmflow_expiry_desktop_capture_v1(pa,(sess->>'session_id')::uuid,op,cap);
 v2:=public.save_pharmflow_expiry_desktop_capture_v1(pa,(sess->>'session_id')::uuid,op,cap);
 IF v IS DISTINCT FROM v2 THEN RAISE EXCEPTION 'Expiry idempotency failure'; END IF;
 BEGIN PERFORM public.resolve_pharmflow_expiry_review_v2(pa,gen_random_uuid(),gen_random_uuid(),item,'QA',NULL); RAISE EXCEPTION 'Mixed data readonly bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 -- Flip levels independently and check Disabled reads at the actual RPC boundary.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 PERFORM public.owner_set_pharmflow_permissions_v1(pa,'FULL','READ_ONLY','PHARMACY_ONLY');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sid,'exp',extract(epoch FROM now()+interval '1 hour'))::text,true);
 PERFORM public.register_pharmflow_order_upload(pa,'P2A-ALLOWED',current_date,'QA','QA','QA',0);
 PERFORM public.list_pharmacy_expiry_current_state_v1(pa,false,NULL);
 BEGIN PERFORM public.reserve_pharmflow_expiry_capture_v1(pa,gen_random_uuid()); RAISE EXCEPTION 'Readonly Expiry write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF pharmflow_auth_private.storage_allowed(pa::text||'/expiry-v1/qa.png',true) THEN RAISE EXCEPTION 'Readonly Expiry Storage write allowed'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 PERFORM public.owner_set_pharmflow_permissions_v1(pa,'DISABLED','DISABLED','PHARMACY_ONLY');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sid,'exp',extract(epoch FROM now()+interval '1 hour'))::text,true);
 BEGIN PERFORM public.list_pharmflow_orders(pa); RAISE EXCEPTION 'Disabled Receiving read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.list_pharmacy_expiry_current_state_v1(pa,false,NULL); RAISE EXCEPTION 'Disabled Expiry read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF pharmflow_auth_private.storage_allowed(pa::text||'/expiry-v1/qa.png',false) THEN RAISE EXCEPTION 'Disabled Storage read allowed'; END IF;

 -- Independent Pharmacy Only changes with both modules disabled.
 v:=public.add_pharmflow_pharmacy_identifier_v2(mapop,pa,localbar,item,'Phase2A synthetic item','PHASE2A_QA');
 v2:=public.add_pharmflow_pharmacy_identifier_v2(mapop,pa,localbar,item,'Phase2A synthetic item','PHASE2A_QA');
 IF v IS DISTINCT FROM v2 THEN RAISE EXCEPTION 'Mapping idempotency failure'; END IF;
 SELECT count(*) INTO c FROM public.pharmflow_central_review_events_v1 WHERE pharmacy_id=pa AND operation_id=mapop::text AND actor=a AND status='PENDING_REVIEW' AND before_value IS NULL AND after_value->>'identifier_display'=localbar AND source IS NOT NULL;
 IF c<>1 THEN RAISE EXCEPTION 'Mandatory review event missing/duplicated'; END IF;
 v2:=public.correct_pharmflow_pharmacy_identifier_v2(gen_random_uuid(),pa,(v->>'identifierId')::uuid,(v->>'mappingRevision')::bigint,item,'Phase2A renamed','QA');
 PERFORM public.remove_pharmflow_pharmacy_identifier_v2(gen_random_uuid(),pa,(v2->>'identifierId')::uuid,(v2->>'mappingRevision')::bigint,'QA');
 IF (SELECT count(*) FROM public.pharmflow_central_review_events_v1 WHERE pharmacy_id=pa AND mapping_id=(v->>'identifierId')::uuid)<>3 THEN RAISE EXCEPTION 'Add/correct/remove capture incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM public.pharmflow_global_item_identifiers_v2 WHERE identifier_display=localbar) THEN RAISE EXCEPTION 'Pharmacy Only leaked Global'; END IF;
 BEGIN PERFORM public.add_pharmflow_global_identifier_v2(gen_random_uuid(),localbar||'G',item,'QA'); RAISE EXCEPTION 'Unapproved Global write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 -- Real capture failure must roll back the mapping, not just report a warning.
 EXECUTE format('ALTER TABLE public.pharmflow_central_review_events_v1 ADD CONSTRAINT qa_capture_failure CHECK(operation_id<>%L)',failop::text);
 BEGIN PERFORM public.add_pharmflow_pharmacy_identifier_v2(failop,pa,failbar,item,'Phase2A synthetic item','QA'); RAISE EXCEPTION 'Failing capture accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.pharmflow_pharmacy_gtin_v1 WHERE pharmacy_id=pa AND identifier_display=failbar) THEN RAISE EXCEPTION 'Atomic capture rollback failed'; END IF;

 -- Password gate remains authoritative regardless of Full permissions.
 UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data||'{"pharmflow_must_change_password":true}'::jsonb WHERE id=a;
 IF pharmflow_auth_private.data_allowed(pa,true) THEN RAISE EXCEPTION 'Password gate bypass'; END IF;
 PERFORM set_config('request.path','/rpc/list_pharmflow_orders',true);
 BEGIN PERFORM public.pharmflow_password_change_request_guard(); RAISE EXCEPTION 'Request password gate bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.path','/rpc/get_my_app_context',true);
 PERFORM public.pharmflow_password_change_request_guard();
 UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data||'{"pharmflow_must_change_password":false}'::jsonb WHERE id=a;

 -- Validate retained HHP084 authorization by its policy UUID, without changing HHP084.
 SELECT m.user_id INTO h FROM public.pharmacy_members m JOIN public.pharmacies p ON p.id=m.pharmacy_id JOIN auth.users u ON u.id=m.user_id
 WHERE p.code='HHP084' AND m.active AND m.role='admin' AND NOT EXISTS(SELECT 1 FROM public.system_owners so WHERE so.user_id=m.user_id) LIMIT 1;
 IF h IS NULL THEN RAISE EXCEPTION 'HHP084 test admin missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
 PERFORM set_config('pharmflow.permission_pharmacy','',true);
 IF NOT public.pharmflow_is_reference_master_admin_v1() THEN RAISE EXCEPTION 'HHP084 capability lost'; END IF;
 IF position('HHP084' IN pg_get_functiondef('public.pharmflow_is_reference_master_admin_v1()'::regprocedure))<>0 THEN RAISE EXCEPTION 'Code exception still active'; END IF;
END $test$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',(SELECT id FROM auth.users WHERE email LIKE 'pf-parity-%-admin@pharmflow.test' LIMIT 1),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $rls$ BEGIN
 IF EXISTS(SELECT 1 FROM public.pharmflow_expiry_current_state_v1) THEN RAISE EXCEPTION 'Disabled Expiry RLS exposed rows'; END IF;
 BEGIN UPDATE public.pharmflow_pharmacy_permissions_v1 SET receiving='FULL'; RAISE EXCEPTION 'Direct policy self grant accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $rls$;
RESET ROLE;
SELECT 'PASS: independent levels, direct RPC denial, tenant isolation, no self-grant, mixed scopes, atomic review failure, idempotency, Group validation, password gate, HHP084 UUID capability' AS result;
ROLLBACK;
