BEGIN;
INSERT INTO auth.users(id) VALUES ('0ec51f5e-1927-435c-a07c-3232265b31be'),('954576b3-4803-4458-a764-94a7bae78fbb'),('28c0f390-8bb8-4f37-8069-e495dc93692b');
INSERT INTO public.pharmacies(id,code,name,status,active) VALUES ('55a30b16-88b4-4587-af61-4c70797eddfe','QA-QADD-A','Quick Add isolated A','active',true),('856673ea-83f3-4fb2-be10-ae857c092432','QA-QADD-B','Quick Add isolated B','active',true);
INSERT INTO public.pharmacy_members(pharmacy_id,user_id,role,active) VALUES ('55a30b16-88b4-4587-af61-4c70797eddfe','0ec51f5e-1927-435c-a07c-3232265b31be','admin',true),('55a30b16-88b4-4587-af61-4c70797eddfe','954576b3-4803-4458-a764-94a7bae78fbb','admin',true),('55a30b16-88b4-4587-af61-4c70797eddfe','28c0f390-8bb8-4f37-8069-e495dc93692b','viewer',true);
INSERT INTO public.system_owners(user_id) VALUES ('0ec51f5e-1927-435c-a07c-3232265b31be');
INSERT INTO public.pharmflow_orders(id,pharmacy_id,order_number,status) VALUES ('f4f56aa5-9abd-40e1-ae7e-5b1e8b2943bb','55a30b16-88b4-4587-af61-4c70797eddfe','QA-QADD-20261022','uploaded');
INSERT INTO public.pharmflow_order_source_items(pharmacy_id,order_id,order_number,line_no,item_code,item_name,ordered_qty) VALUES ('55a30b16-88b4-4587-af61-4c70797eddfe','f4f56aa5-9abd-40e1-ae7e-5b1e8b2943bb','QA-QADD-20261022',1,'QA-QADD-CODE','Quick Add fixture',20),('55a30b16-88b4-4587-af61-4c70797eddfe','f4f56aa5-9abd-40e1-ae7e-5b1e8b2943bb','QA-QADD-20261022',2,'QA-QADD-DENIED','Denied fixture',20);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"0ec51f5e-1927-435c-a07c-3232265b31be","role":"authenticated"}',true);
DO $test$
DECLARE r jsonb;r2 jsonb;denied boolean:=false;
BEGIN
r:=public.quick_add_pharmflow_order_item_v1('a78daabc-c080-48cc-9b3c-3a56fb98e422','55a30b16-88b4-4587-af61-4c70797eddfe','QA-QADD-20261022',ARRAY['QA-QADD-20261022'],'QA-QADD-CODE','Quick Add fixture','Medicine','QA-QADD-IDENT',4);
IF r->>'success'<>'true' OR r->>'masterCreated'<>'true' OR r#>>'{receipts,0,quantity}'<>'4' THEN RAISE EXCEPTION 'Creation/quantity failed: %',r; END IF;
r2:=public.quick_add_pharmflow_order_item_v1('a78daabc-c080-48cc-9b3c-3a56fb98e422','55a30b16-88b4-4587-af61-4c70797eddfe','QA-QADD-20261022',ARRAY['QA-QADD-20261022'],'QA-QADD-CODE','Quick Add fixture','Medicine','QA-QADD-IDENT',4);
IF r2->>'idempotent'<>'true' OR r2#>>'{receipts,0,transaction_id}' IS DISTINCT FROM r#>>'{receipts,0,transaction_id}' THEN RAISE EXCEPTION 'Idempotency failed';END IF;
BEGIN
PERFORM public.quick_add_pharmflow_order_item_v1('a78daabc-c080-48cc-9b3c-3a56fb98e422','55a30b16-88b4-4587-af61-4c70797eddfe','QA-QADD-20261022',ARRAY['QA-QADD-20261022'],'QA-QADD-CODE','Quick Add fixture','Medicine','QA-QADD-IDENT',5);
EXCEPTION WHEN OTHERS THEN denied:=true;END;
IF NOT denied THEN RAISE EXCEPTION 'Changed retry not rejected';END IF;
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"954576b3-4803-4458-a764-94a7bae78fbb","role":"authenticated"}',true);
DO $test$ DECLARE r jsonb;denied boolean:=false;BEGIN
r:=public.quick_add_pharmflow_order_item_v1('8de0f889-11b5-432d-8758-14d278a87c00','55a30b16-88b4-4587-af61-4c70797eddfe','QA-QADD-20261022',ARRAY['QA-QADD-20261022'],'QA-QADD-DENIED','Denied fixture','Medicine','QA-QADD-DENIED-IDENT',4);
IF r->>'code'<>'GLOBAL_CREATION_PERMISSION_REQUIRED' THEN RAISE EXCEPTION 'Creation permission bypass';END IF;
BEGIN PERFORM public.quick_add_pharmflow_order_item_v1('75215171-8366-481f-b5a3-d7c1f181e72f','856673ea-83f3-4fb2-be10-ae857c092432','QA-QADD-20261022',ARRAY['QA-QADD-20261022'],'QA-QADD-CODE','Quick Add fixture','Medicine','QA-QADD-IDENT',4); EXCEPTION WHEN OTHERS THEN denied:=true;END;
IF NOT denied THEN RAISE EXCEPTION 'Cross pharmacy access bypass';END IF;
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"28c0f390-8bb8-4f37-8069-e495dc93692b","role":"authenticated"}',true);
DO $test$ DECLARE denied boolean:=false;BEGIN
BEGIN PERFORM public.quick_add_pharmflow_order_item_v1('75215171-8366-481f-b5a3-d7c1f181e72f','55a30b16-88b4-4587-af61-4c70797eddfe','QA-QADD-20261022',ARRAY['QA-QADD-20261022'],'QA-QADD-CODE','Quick Add fixture','Medicine','QA-QADD-IDENT',4); EXCEPTION WHEN OTHERS THEN denied:=true;END;
IF NOT denied THEN RAISE EXCEPTION 'Viewer access bypass';END IF;END $test$;
RESET ROLE;
DO $test$ BEGIN
IF (SELECT count(*) FROM public.pharmflow_receiving_transactions_v1 WHERE pharmacy_id='55a30b16-88b4-4587-af61-4c70797eddfe')<>1 OR (SELECT sum(quantity) FROM public.pharmflow_receiving_transactions_v1 WHERE pharmacy_id='55a30b16-88b4-4587-af61-4c70797eddfe')<>4 THEN RAISE EXCEPTION 'Receipt duplicated or quantity not persistent';END IF;
IF EXISTS(SELECT 1 FROM public.pharmflow_global_items_v2 WHERE item_code='QA-QADD-DENIED') THEN RAISE EXCEPTION 'Unauthorized item created';END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: creation, quantity 4, exact retry, changed retry rejection, Global creation authorization, pharmacy isolation, viewer denial, no duplicate receipt; all fixtures rolled back' result;
