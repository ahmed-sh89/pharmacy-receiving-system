-- Staging-only authenticated-role simulation; every fixture and mutation rolls back.
begin;
set local statement_timeout='45s';
do $qa$
declare
 actor uuid;pa uuid;pb uuid;sid uuid;ses uuid;op uuid:=gen_random_uuid();op2 uuid:=gen_random_uuid();op3 uuid:=gen_random_uuid();
 wid uuid;wid2 uuid;w jsonb;cap jsonb;ack jsonb;ack2 jsonb;rows jsonb;page jsonb;result jsonb;reject boolean;
 batch text:='QA'||substr(replace(gen_random_uuid()::text,'-',''),1,12);nm text;stateid uuid;rid uuid:=gen_random_uuid();first_event text;
begin
 select id into strict actor from auth.users where email='tc26-expiry@example.invalid';
 select pharmacy_id into strict pa from public.pharmacy_members where user_id=actor and active=true;
 select id into strict pb from public.pharmacies where id<>pa limit 1;
 select id into strict sid from auth.sessions where user_id=actor and (not_after is null or not_after>now()) order by created_at desc limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',sid,'exp',extract(epoch from now()+interval '1 hour'))::text,true);
 select item_name into strict nm from public.pharmflow_global_items_v2 where item_code='1011923';
 execute 'set local role authenticated';
 w:=public.save_pharmacy_expiry_worker(pa,'QA Operator '||batch);wid:=(w->>'id')::uuid;
 result:=public.save_pharmacy_expiry_worker(pa,'qa operator '||lower(batch));if result->>'id'<>wid::text then raise exception 'Duplicate Operator';end if;
 result:=public.rename_pharmacy_expiry_worker(pa,wid,'QA First '||batch,w->>'worker_name');
 w:=public.save_pharmacy_expiry_worker(pa,'QA Second '||batch);wid2:=(w->>'id')::uuid;
 reject:=false;begin perform public.rename_pharmacy_expiry_worker(pa,wid2,'QA First '||batch,w->>'worker_name');exception when raise_exception then reject:=true;end;if not reject then raise exception 'Duplicate rename accepted';end if;
 reject:=false;begin perform public.save_pharmacy_expiry_worker(pb,'Cross pharmacy');exception when raise_exception then reject:=true;end;if not reject then raise exception 'Cross-pharmacy management accepted';end if;
 ses:=(public.get_pharmflow_expiry_auth_session_v1(pa,'QA-HARDENING-'||batch)->>'session_id')::uuid;
 -- Signed lifecycle is per-account; use its originally bound device.
 execute 'reset role';select device_id into nm from pharmflow_expiry_private.active_sessions_v1 where id=ses;
 cap:=jsonb_build_object('kind','KNOWN','source','HANDHELD','worker_id',wid,'device_id',nm,'item_code','1011923','item_name','QA fixture','identifier_display','06291100080069','category','Medicine','raw_scan','(01)06291100080069(17)310200(10)'||batch,'scan_format','GS1','sample_serial',null,'batch_no',batch,'expiry_month',2,'expiry_year',2031,'quantity',1);
 execute 'set local role authenticated';
 ack:=public.save_pharmflow_expiry_session_capture_v2(pa,ses,op,cap);stateid:=(ack->>'state_id')::uuid;
 if public.save_pharmflow_expiry_session_capture_v2(pa,ses,op,cap) is distinct from ack then raise exception 'Retry changed receipt';end if;
 rows:=public.list_pharmflow_expiry_session_v2(pa,ses);select r into result from jsonb_array_elements(rows) r where r->>'operation_id'=op::text;
 if result->'gs1_source_locks'<>jsonb_build_object('batch',true,'expiry',true) then raise exception 'GS1 locks unavailable';end if;
 reject:=false;begin perform public.correct_pharmflow_expiry_session_v2(pa,ses,op,gen_random_uuid(),0,jsonb_build_object('quantity',2,'batch_no','Changed','expiry_month',2,'expiry_year',2031));exception when raise_exception then if SQLERRM<>'Batch captured from GS1 is read only' then raise;end if;reject:=true;end;if not reject then raise exception 'GS1 Batch tamper accepted';end if;
 reject:=false;begin perform public.correct_pharmflow_expiry_session_v2(pa,ses,op,gen_random_uuid(),0,jsonb_build_object('quantity',2,'batch_no',batch,'expiry_month',3,'expiry_year',2031));exception when raise_exception then if SQLERRM<>'Expiry captured from GS1 is read only' then raise;end if;reject:=true;end;if not reject then raise exception 'GS1 expiry tamper accepted';end if;
 result:=public.correct_pharmflow_expiry_session_v2(pa,ses,op,rid,0,jsonb_build_object('quantity',2,'batch_no',batch,'expiry_month',2,'expiry_year',2031));
 if public.correct_pharmflow_expiry_session_v2(pa,ses,op,rid,0,jsonb_build_object('quantity',2,'batch_no',batch,'expiry_month',2,'expiry_year',2031)) is distinct from result then raise exception 'Correction retry changed receipt';end if;
 cap:=cap||jsonb_build_object('raw_scan','06291100080069','scan_format','PLAIN','batch_no',lower(batch),'worker_id',wid2);
 ack2:=public.save_pharmflow_expiry_session_capture_v2(pa,ses,op2,cap);if ack2->>'state_id'<>stateid::text then raise exception 'Case variants separated';end if;
 page:=public.query_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',batch),false,'ADDED',0,50);
 result:=page->'rows'->0;first_event:=result->>'first_operator_event_id';
 if result->>'first_operator_id'<>wid::text or (result->>'quantity')::int<>3 or result->>'batch_no'<>batch then raise exception 'First Operator or group casing/quantity changed';end if;
 perform public.correct_pharmflow_expiry_session_v2(pa,ses,op,gen_random_uuid(),1,jsonb_build_object('quantity',0,'batch_no',batch,'expiry_month',2,'expiry_year',2031));
 page:=public.query_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',batch),false,'ADDED',0,50);
 if page->'rows'->0->>'first_operator_event_id'<>first_event or (page->'rows'->0->>'quantity')::int<>1 then raise exception 'Original deletion lost first attribution';end if;
 perform public.rename_pharmacy_expiry_worker(pa,wid,'QA Renamed '||batch,'QA First '||batch);
 perform public.deactivate_pharmacy_expiry_worker(pa,wid);
 page:=public.query_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',batch),false,'ADDED',0,50);
 if page->'rows'->0->>'first_operator_name'<>'QA First '||batch then raise exception 'Historical Operator rewritten';end if;
 -- Original operation deletion must retain attribution (use active second operator for the correction event path).
 -- Inactive original Operator corrections currently reject in save_known_core; report separately, do not bypass.
 cap:=cap||jsonb_build_object('batch_no',batch||'X');
 ack2:=public.save_pharmflow_expiry_session_capture_v2(pa,ses,op3,cap);
 perform public.correct_pharmflow_expiry_session_v2(pa,ses,op3,gen_random_uuid(),0,jsonb_build_object('quantity',2,'batch_no',batch||'Y','expiry_month',3,'expiry_year',2031));
 reject:=false;begin perform public.query_pharmflow_expiry_inventory_v1(pb,'{}',false,'ADDED',0,50);exception when raise_exception then reject:=true;end;if not reject then raise exception 'Cross-pharmacy read accepted';end if;
 perform set_config('request.jwt.claims','{}',true);
 reject:=false;begin perform public.save_pharmacy_expiry_worker(pa,'Unauthenticated');exception when raise_exception then reject:=true;end;if not reject then raise exception 'Unauthenticated manager accepted';end if;
end $qa$;
rollback;
