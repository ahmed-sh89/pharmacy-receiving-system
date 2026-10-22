BEGIN;
INSERT INTO auth.users(id) VALUES ('0ec51f5e-1927-435c-a07c-3232265b31be');
INSERT INTO public.pharmacies(id,code,name,status,active) VALUES ('55a30b16-88b4-4587-af61-4c70797eddfe','QA-MANIFEST','Manifest isolated test','active',true);
INSERT INTO public.pharmacy_members(pharmacy_id,user_id,role,active) VALUES ('55a30b16-88b4-4587-af61-4c70797eddfe','0ec51f5e-1927-435c-a07c-3232265b31be','admin',true);
SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claims','{"sub":"0ec51f5e-1927-435c-a07c-3232265b31be","role":"authenticated"}',true);
DO $t$ DECLARE r record;v record;denied boolean:=false;m jsonb:='{"orderFiles":[{"documentId":"QA-MANIFEST-1"}],"orderData":[{"itemCode":"QA-1","orderedQty":4}],"handheldOrderNumbers":["QA-MANIFEST-1"]}';BEGIN
SELECT * INTO r FROM public.save_pharmflow_active_order_manifest_v4('55a30b16-88b4-4587-af61-4c70797eddfe',m,0,0);
IF r.revision<>1 OR r.order_files<>1 OR r.order_items<>1 THEN RAISE EXCEPTION 'Manifest save failed';END IF;
SELECT * INTO v FROM public.get_pharmflow_active_order_manifest_v3('55a30b16-88b4-4587-af61-4c70797eddfe');
IF v.manifest<>m OR v.revision<>1 THEN RAISE EXCEPTION 'Manifest refresh failed';END IF;
BEGIN PERFORM public.save_pharmflow_active_order_manifest_v4('55a30b16-88b4-4587-af61-4c70797eddfe',m,0,0);EXCEPTION WHEN OTHERS THEN IF SQLERRM='STALE_ACTIVE_ORDER_MANIFEST_REVISION' THEN denied:=true;ELSE RAISE;END IF;END;
IF NOT denied THEN RAISE EXCEPTION 'Stale duplicate save accepted';END IF;
denied:=false;
BEGIN PERFORM public.save_pharmflow_active_order_manifest_v4('55a30b16-88b4-4587-af61-4c70797eddfe',m,1,1);EXCEPTION WHEN OTHERS THEN IF SQLERRM='STALE_WORKSPACE_GENERATION' THEN denied:=true;ELSE RAISE;END IF;END;
IF NOT denied THEN RAISE EXCEPTION 'Stale generation accepted';END IF;
SELECT * INTO r FROM public.get_pharmflow_master_cache_meta_v2();
IF r.global_item_count<>12 OR r.identifier_count<>14 OR r.item_count<>(SELECT count(*) FROM public.get_pharmflow_master_cache_page_v2(0,1000)) THEN RAISE EXCEPTION 'V2 Master projection mismatch';END IF;
IF (SELECT count(*) FROM public.search_pharmflow_global_items_v2('',50))=0 THEN RAISE EXCEPTION 'V2 item search unavailable';END IF;
END $t$;ROLLBACK;SELECT 'PASS: manifest save/read, assigned order, stale revision/generation rejection; Master V2 totals 12/14, cache pages, authenticated V2 search; fixtures rolled back. Lifecycle upload remains blocked.' result;