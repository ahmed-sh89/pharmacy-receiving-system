BEGIN;
INSERT INTO auth.users(id) VALUES ('0ec51f5e-1927-435c-a07c-3232265b31be'),('954576b3-4803-4458-a764-94a7bae78fbb'),('28c0f390-8bb8-4f37-8069-e495dc93692b');
INSERT INTO public.pharmacies(id,code,name,status,active) VALUES ('55a30b16-88b4-4587-af61-4c70797eddfe','QA-QADD-A','Quick Add isolated A','active',true),('856673ea-83f3-4fb2-be10-ae857c092432','QA-QADD-B','Quick Add isolated B','active',true);
INSERT INTO public.pharmacy_members(pharmacy_id,user_id,role,active) VALUES ('55a30b16-88b4-4587-af61-4c70797eddfe','0ec51f5e-1927-435c-a07c-3232265b31be','admin',true),('55a30b16-88b4-4587-af61-4c70797eddfe','954576b3-4803-4458-a764-94a7bae78fbb','admin',true),('55a30b16-88b4-4587-af61-4c70797eddfe','28c0f390-8bb8-4f37-8069-e495dc93692b','viewer',true);
INSERT INTO public.system_owners(user_id) VALUES ('0ec51f5e-1927-435c-a07c-3232265b31be');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"954576b3-4803-4458-a764-94a7bae78fbb","role":"authenticated"}',true);
DO $test$
DECLARE v_id uuid;r record;m jsonb;denied boolean:=false;
BEGIN
m:='{"orderFiles":[{"documentId":"QA-LIFECYCLE-FINAL"}],"orderData":[{"itemCode":"QA-LIFE-ITEM","itemName":"Lifecycle Quick Add","orderedQty":10}],"selectedOrderNumber":"QA-LIFECYCLE-FINAL","selectedOrderNumbers":["QA-LIFECYCLE-FINAL"],"handheldOrderNumbers":["QA-LIFECYCLE-FINAL"]}';
PERFORM public.save_pharmflow_active_order_manifest_v4('55a30b16-88b4-4587-af61-4c70797eddfe',m,0,0);
v_id:=public.register_pharmflow_order_upload('55a30b16-88b4-4587-af61-4c70797eddfe','QA-LIFECYCLE-FINAL',NULL,'Test Source','Test Destination','isolated-test.xlsx',1);
SELECT * INTO r FROM public.get_pharmflow_order('55a30b16-88b4-4587-af61-4c70797eddfe','QA-LIFECYCLE-FINAL');
IF r.id IS DISTINCT FROM v_id OR r.status<>'uploaded' OR r.item_count<>1 THEN RAISE EXCEPTION 'Register/retrieve failed';END IF;
PERFORM public.save_pharmflow_order_source_items_v2('55a30b16-88b4-4587-af61-4c70797eddfe','QA-LIFECYCLE-FINAL','[{"line_no":1,"item_code":"QA-LIFE-ITEM","item_name":"Lifecycle Quick Add","ordered_qty":10}]',true);
IF (SELECT count(*) FROM public.get_pharmflow_order_source_items_v2('55a30b16-88b4-4587-af61-4c70797eddfe','QA-LIFECYCLE-FINAL'))<>1 THEN RAISE EXCEPTION 'Source persistence failed';END IF;
SELECT * INTO r FROM public.get_pharmflow_active_order_manifest_v3('55a30b16-88b4-4587-af61-4c70797eddfe');
IF r.manifest->>'selectedOrderNumber'<>'QA-LIFECYCLE-FINAL' OR r.manifest#>>'{handheldOrderNumbers,0}'<>'QA-LIFECYCLE-FINAL' THEN RAISE EXCEPTION 'Selection/read refresh failed';END IF;
BEGIN PERFORM public.register_pharmflow_order_upload('55a30b16-88b4-4587-af61-4c70797eddfe','QA-LIFECYCLE-FINAL');EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%cannot be uploaded twice%' THEN denied:=true;ELSE RAISE;END IF;END;
IF NOT denied THEN RAISE EXCEPTION 'Duplicate upload accepted';END IF;
denied:=false;
BEGIN PERFORM public.register_pharmflow_order_upload('856673ea-83f3-4fb2-be10-ae857c092432','QA-UNAUTHORIZED');EXCEPTION WHEN OTHERS THEN IF SQLERRM='Pharmacy ADMIN access required' THEN denied:=true;ELSE RAISE;END IF;END;
IF NOT denied THEN RAISE EXCEPTION 'Cross pharmacy registration accepted';END IF;
IF EXISTS(SELECT 1 FROM public.get_pharmflow_order('856673ea-83f3-4fb2-be10-ae857c092432','QA-LIFECYCLE-FINAL')) THEN RAISE EXCEPTION 'Cross pharmacy read exposed';END IF;
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"0ec51f5e-1927-435c-a07c-3232265b31be","role":"authenticated"}',true);
DO $test$ DECLARE r jsonb;r2 jsonb;denied boolean:=false;BEGIN
IF EXISTS(SELECT 1 FROM public.search_pharmflow_global_items_v2('QA-LIFE-ITEM',50) WHERE item_code='QA-LIFE-ITEM') THEN RAISE EXCEPTION 'Fixture is not new';END IF;
BEGIN PERFORM public.quick_add_pharmflow_order_item_v1('a78daabc-c080-48cc-9b3c-3a56fb98e422','55a30b16-88b4-4587-af61-4c70797eddfe','QA-LIFECYCLE-FINAL',ARRAY['QA-LIFECYCLE-FINAL'],'QA-LIFE-ITEM','Lifecycle Quick Add',NULL,'QA-LIFE-BARCODE',4);EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%approved Groups%' THEN denied:=true;ELSE RAISE;END IF;END;
IF NOT denied THEN RAISE EXCEPTION 'Missing Group accepted';END IF;
r:=public.quick_add_pharmflow_order_item_v1('a78daabc-c080-48cc-9b3c-3a56fb98e422','55a30b16-88b4-4587-af61-4c70797eddfe','QA-LIFECYCLE-FINAL',ARRAY['QA-LIFECYCLE-FINAL'],'QA-LIFE-ITEM','Lifecycle Quick Add','Medicine','QA-LIFE-BARCODE',4);
IF r->>'success'<>'true' OR r#>>'{receipts,0,quantity}'<>'4' THEN RAISE EXCEPTION 'Quick Add quantity failed';END IF;
r2:=public.quick_add_pharmflow_order_item_v1('a78daabc-c080-48cc-9b3c-3a56fb98e422','55a30b16-88b4-4587-af61-4c70797eddfe','QA-LIFECYCLE-FINAL',ARRAY['QA-LIFECYCLE-FINAL'],'QA-LIFE-ITEM','Lifecycle Quick Add','Medicine','QA-LIFE-BARCODE',4);
IF r2->>'idempotent'<>'true' OR r2#>>'{receipts,0,transaction_id}' IS DISTINCT FROM r#>>'{receipts,0,transaction_id}' THEN RAISE EXCEPTION 'Retry duplicated receipt';END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
IF (SELECT count(*) FROM public.pharmflow_orders WHERE pharmacy_id='55a30b16-88b4-4587-af61-4c70797eddfe')<>1 THEN RAISE EXCEPTION 'Partial or duplicate registration';END IF;
IF (SELECT count(*) FROM public.pharmflow_receiving_transactions_v1 WHERE pharmacy_id='55a30b16-88b4-4587-af61-4c70797eddfe')<>1 OR (SELECT sum(quantity) FROM public.pharmflow_receiving_transactions_v1 WHERE pharmacy_id='55a30b16-88b4-4587-af61-4c70797eddfe')<>4 THEN RAISE EXCEPTION 'Persisted quantity not exactly four';END IF;
IF EXISTS(SELECT 1 FROM public.pharmflow_orders WHERE pharmacy_id='856673ea-83f3-4fb2-be10-ae857c092432') THEN RAISE EXCEPTION 'Unauthorized order persisted';END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: manifest save, register, retrieve, source persist, selected order read/refresh, duplicate upload rejection, pharmacy isolation, Group mandatory, Quick Add creates/maps/receives quantity 4, same-operation retry one receipt; test records rolled back' result;
