BEGIN;
CREATE TEMP TABLE security_results(test text,pass boolean) ON COMMIT DROP;
GRANT SELECT,INSERT ON pg_temp.security_results TO authenticated;
INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES
 ('e8110800-0000-4000-8000-000000000001','security-owner-20261108@example.invalid','{}'),
 ('e8110800-0000-4000-8000-000000000002','security-admin-20261108@example.invalid','{}'),
 ('e8110800-0000-4000-8000-000000000003','security-staff-20261108@example.invalid','{}');
INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'e8110800','e8110801')::uuid,id FROM auth.users WHERE id IN ('e8110800-0000-4000-8000-000000000001','e8110800-0000-4000-8000-000000000002','e8110800-0000-4000-8000-000000000003');
INSERT INTO public.system_owners(user_id) VALUES ('e8110800-0000-4000-8000-000000000001');
INSERT INTO public.pharmacies(id,code,name) VALUES
 ('e8110800-0000-4000-8000-000000000010','SECAUDIT1108A','Synthetic security A'),
 ('e8110800-0000-4000-8000-000000000011','SECAUDIT1108B','Synthetic security B');
INSERT INTO public.pharmacy_members(pharmacy_id,user_id,role,active) VALUES
 ('e8110800-0000-4000-8000-000000000010','e8110800-0000-4000-8000-000000000002','admin',true),
 ('e8110800-0000-4000-8000-000000000010','e8110800-0000-4000-8000-000000000003','staff',true);
UPDATE public.pharmflow_pharmacy_permissions_v1 SET receiving='FULL',expiry='FULL',duty='FULL' WHERE pharmacy_id IN ('e8110800-0000-4000-8000-000000000010','e8110800-0000-4000-8000-000000000011');
SELECT set_config('request.jwt.claims','{"sub":"e8110800-0000-4000-8000-000000000001","role":"authenticated","session_id":"e8110800-0000-4000-8000-000000000099","exp":9999999999}',true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.security_results VALUES ('revoked owner denied', NOT public.is_system_owner() AND NOT public.medryvo_is_system_owner());
DO $test$ BEGIN
 BEGIN PERFORM public.owner_set_pharmacy_status('e8110800-0000-4000-8000-000000000011','suspended'); RAISE EXCEPTION 'SECURITY_TEST_UNEXPECTED_ACCESS';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='System Owner access required' THEN INSERT INTO pg_temp.security_results VALUES ('revoked owner mutation denied',true); ELSE RAISE; END IF; END;
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"e8110800-0000-4000-8000-000000000001","role":"authenticated","session_id":"e8110801-0000-4000-8000-000000000001","exp":9999999999}',true);
INSERT INTO pg_temp.security_results VALUES ('live owner preserved',public.is_system_owner() AND public.medryvo_is_system_owner());
SELECT public.owner_set_pharmacy_status('e8110800-0000-4000-8000-000000000011','active');
SELECT set_config('request.jwt.claims','{"sub":"e8110800-0000-4000-8000-000000000002","role":"authenticated","session_id":"e8110801-0000-4000-8000-000000000002","exp":9999999999}',true);
INSERT INTO pg_temp.security_results VALUES
 ('admin own pharmacy',public.is_pharmacy_admin('e8110800-0000-4000-8000-000000000010')),
 ('cross pharmacy denied',NOT public.is_pharmacy_admin('e8110800-0000-4000-8000-000000000011') AND NOT public.is_pharmacy_member('e8110800-0000-4000-8000-000000000011')),
 ('Receiving own and foreign boundaries',pharmflow_auth_private.module_allowed('e8110800-0000-4000-8000-000000000010','RECEIVING',true) AND NOT pharmflow_auth_private.module_allowed('e8110800-0000-4000-8000-000000000011','RECEIVING',true)),
 ('Expiry own and foreign boundaries',pharmflow_auth_private.module_allowed('e8110800-0000-4000-8000-000000000010','EXPIRY',true) AND NOT pharmflow_auth_private.module_allowed('e8110800-0000-4000-8000-000000000011','EXPIRY',true));
DO $test$ BEGIN
 PERFORM public.get_pharmflow_duty_foundation_v1('e8110800-0000-4000-8000-000000000010','2026-11-01');
 INSERT INTO pg_temp.security_results VALUES ('Duty own pharmacy RPC',true);
 BEGIN PERFORM public.get_pharmflow_duty_foundation_v1('e8110800-0000-4000-8000-000000000011','2026-11-01'); RAISE EXCEPTION 'SECURITY_TEST_UNEXPECTED_ACCESS';
 EXCEPTION WHEN insufficient_privilege THEN INSERT INTO pg_temp.security_results VALUES ('Duty cross pharmacy RPC denied',true); END;
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"e8110800-0000-4000-8000-000000000003","role":"authenticated","session_id":"e8110801-0000-4000-8000-000000000003","exp":9999999999}',true);
INSERT INTO pg_temp.security_results VALUES ('staff cannot administer',public.is_pharmacy_member('e8110800-0000-4000-8000-000000000010') AND NOT public.is_pharmacy_admin('e8110800-0000-4000-8000-000000000010'));
RESET ROLE;
UPDATE auth.users SET raw_app_meta_data='{"pharmflow_must_change_password":true}' WHERE id='e8110800-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.security_results VALUES ('mandatory password: live completion only',public.pharmflow_has_live_session_v1() AND NOT public.is_pharmacy_member('e8110800-0000-4000-8000-000000000010'));
RESET ROLE;
SELECT jsonb_agg(jsonb_build_object('test',test,'pass',pass)) AS results, bool_and(pass) AS all_pass FROM pg_temp.security_results;
ROLLBACK;
