-- Disposable synthetic data only. Never execute against a connected environment.
RESET ROLE;
INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('10000000-0000-4000-8000-000000000001','owner@rehearsal.invalid','{}','{}'),
 ('10000000-0000-4000-8000-000000000002','a@rehearsal.invalid','{}','{}'),
 ('10000000-0000-4000-8000-000000000003','b@rehearsal.invalid','{}','{}'),
 ('10000000-0000-4000-8000-000000000004','forced@rehearsal.invalid','{"pharmflow_must_change_password":true}','{}');
INSERT INTO public.system_owners(user_id) VALUES('10000000-0000-4000-8000-000000000001');
INSERT INTO public.pharmacies(id,name,code,active,status) VALUES
 ('20000000-0000-4000-8000-000000000001','Synthetic HHP084','HHP084',true,'active'),
 ('20000000-0000-4000-8000-000000000002','Synthetic B','QA_B',true,'active');
INSERT INTO public.pharmacy_members(pharmacy_id,user_id,role,active) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','admin',true),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','admin',true),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','admin',true);
INSERT INTO public.sessions(id,session_code) VALUES('30000000-0000-4000-8000-000000000001','QA-REHEARSAL-ONLY');
INSERT INTO public.session_items(session_id,item_code,ordered_qty) VALUES('30000000-0000-4000-8000-000000000001','QA-ITEM',3);
INSERT INTO public.transactions(session_id,item_code,qty_change) VALUES('30000000-0000-4000-8000-000000000001','QA-ITEM',1);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',false);
INSERT INTO public.pharmflow_needs_review_v2(pharmacy_id,workflow,gtin,created_by) VALUES
 ('20000000-0000-4000-8000-000000000001','RECEIVING','QA-DUP','10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000001','RECEIVING','QA-DUP','10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000001','RECEIVING','QA-OTHER','10000000-0000-4000-8000-000000000002');
INSERT INTO pharmflow_expiry_private.operations(pharmacy_id,operation_id,created_by,status,payload) VALUES('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','COMMITTING','{"kind":"UNKNOWN"}');
INSERT INTO public.pharmflow_needs_review_v2(pharmacy_id,workflow,gtin,created_by,operation_id) VALUES('20000000-0000-4000-8000-000000000001','EXPIRY','QA-EXPIRY','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',false);
INSERT INTO public.pharmflow_needs_review_v2(pharmacy_id,workflow,gtin,created_by) VALUES
 ('20000000-0000-4000-8000-000000000002','RECEIVING','QA-FOREIGN','10000000-0000-4000-8000-000000000003');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',false);
SET ROLE postgres;
