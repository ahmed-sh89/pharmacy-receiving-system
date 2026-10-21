-- Staging-only fixtures and RPC tests; execute whole script, all writes ROLLBACK.
begin;
set local statement_timeout='45s';
do $qa$
declare
 pa uuid:='11111111-1111-4111-8111-111111111111';pb uuid:='22222222-2222-4222-8222-222222222222';
 actor uuid:='5647d3d3-b98c-4fe5-a093-c21346f9384d';sid uuid;v_session uuid:=gen_random_uuid();
 batch text:='Ab12cD'||left(replace(gen_random_uuid()::text,'-',''),8);manual text;device text:='QA-BATCH-'||gen_random_uuid();
 cap jsonb;original_cap jsonb;ack jsonb;ack2 jsonb;retry jsonb;page jsonb;exported jsonb;members jsonb;ops jsonb;
 op uuid:=gen_random_uuid();op2 uuid:=gen_random_uuid();op3 uuid:=gen_random_uuid();state_id uuid;other_id uuid;name text;
 rejected boolean;value text;checks integer:=0;row_count integer;
begin
 select id into strict sid from auth.sessions where user_id=actor and (not_after is null or not_after>now()) order by created_at desc limit 1;
 select item_name into strict name from public.pharmflow_global_items_v2 where item_code='1011923';
 foreach value in array array[
  '(01)06291100080069(17)310200(10)Ab12cD45',
  ']d201062911000800691731020010Ab12cD45'||chr(29)||'21SERIAL',
  ']C10106291100080069~10Ab12cD45~17310200',
  ']Q30106291100080069<gs>10Ab12cD45<gs>17310200',
  ']C10105000167019391~10SA799~21~17270200',
  '010629110008006910Ab12cD45'||E'\\u001d'||'17310200'
 ] loop
  if not pharmflow_expiry_private.batch_is_scanner_payload(value) then raise exception 'Full scan not rejected: %',value;end if;
  checks:=checks+1;
 end loop;
 foreach value in array array['Ab12cD45',repeat('LongAb12',20),repeat('0',100),'0101234567890123'] loop
  if pharmflow_expiry_private.batch_is_scanner_payload(value) then raise exception 'Ordinary batch rejected';end if;
  checks:=checks+1;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',sid,'exp',extract(epoch from now()+interval '1 hour'))::text,true);
 select s.id,s.device_id into strict v_session,device from pharmflow_expiry_private.active_sessions_v1 s
 where s.pharmacy_id=pa and s.created_by=actor and s.auth_session_id=sid and s.closed_at is null;
 cap:=jsonb_build_object('kind','KNOWN','source','PC','worker_id',null,'device_id',device,'item_code','1011923','item_name',name,'identifier_display','06291100080069','category','Medicine','raw_scan','(01)06291100080069(17)310200(10)'||batch,'scan_format','GS1','sample_serial',null,'batch_no',batch,'expiry_month',2,'expiry_year',2031,'quantity',1);
 original_cap:=cap;
 execute 'set local role authenticated';
 ack:=public.save_pharmflow_expiry_desktop_capture_v1(pa,v_session,op,cap);state_id:=(ack->>'state_id')::uuid;
 retry:=public.save_pharmflow_expiry_desktop_capture_v1(pa,v_session,op,cap);
 if ack is distinct from retry then raise exception 'Retry acknowledgement changed';end if;
 checks:=checks+1;
 cap:=cap||jsonb_build_object('raw_scan','06291100080069','scan_format','PLAIN','batch_no',lower(batch));
 ack2:=public.save_pharmflow_expiry_desktop_capture_v1(pa,v_session,op2,cap);
 if ack2->>'state_id'<>ack->>'state_id' then raise exception 'Case variants formed separate states';end if;
 checks:=checks+1;
 page:=public.query_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',batch),false,'ADDED',0,50);
 if (page->>'count')::integer<>1 or (page->>'units')::integer<>2 or page->'rows'->0->>'batch_no'<>batch then raise exception 'Inventory casing/quantity/count inconsistent';end if;
 exported:=public.export_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',batch),false);
 if jsonb_array_length(exported)<>1 or exported->0->>'batch_no'<>batch or (exported->0->>'quantity')::integer<>2 then raise exception 'Export inconsistent';end if;
 checks:=checks+2;
 -- Different expiry stays a separate state.
 ack2:=public.save_pharmflow_expiry_desktop_capture_v1(pa,v_session,gen_random_uuid(),cap||jsonb_build_object('expiry_month',3));
 if ack2->>'state_id'=ack->>'state_id' then raise exception 'Different expiry merged';end if;
 checks:=checks+1;
 -- Full GS1 accidentally passed as manual Batch is rejected by server.
 rejected:=false;
 begin perform public.save_pharmflow_expiry_desktop_capture_v1(pa,v_session,gen_random_uuid(),cap||jsonb_build_object('batch_no',original_cap->>'raw_scan'));
 exception when raise_exception then if SQLERRM<>'Use Scan Barcode, not Batch' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'Barcode Batch accepted';end if;
 checks:=checks+1;
 -- Long ordinary batches accepted without an arbitrary new length limit.
 perform public.save_pharmflow_expiry_desktop_capture_v1(pa,v_session,gen_random_uuid(),cap||jsonb_build_object('batch_no',repeat('LongAb12',20)||batch));
 checks:=checks+1;
 -- Handheld uses the same core and retains original mixed-case GS1 Batch.
 ack2:=public.save_pharmflow_expiry_session_capture_v2(pa,v_session,op3,
  cap||jsonb_build_object('source','HANDHELD','worker_id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','batch_no','Hh'||batch,'raw_scan','(01)06291100080069(17)310200(10)Hh'||batch,'scan_format','GS1'));
 if ack2->'confirmed_capture'->>'batch_no'<>'Hh'||batch then raise exception 'Handheld Batch changed';end if;
 checks:=checks+1;
 -- Manual-first groups retain deterministic first casing, not a historical rewrite.
 ack2:=public.save_pharmflow_expiry_desktop_capture_v1(pa,v_session,gen_random_uuid(),cap||jsonb_build_object('batch_no',lower('Fi'||batch)));
 retry:=public.save_pharmflow_expiry_desktop_capture_v1(pa,v_session,gen_random_uuid(),cap||jsonb_build_object('batch_no','Fi'||batch,'raw_scan','(01)06291100080069(17)310200(10)Fi'||batch,'scan_format','GS1'));
 if ack2->>'state_id'<>retry->>'state_id' then raise exception 'Manual-first GS1 case split';end if;
 page:=public.query_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search','Fi'||batch),false,'ADDED',0,50);
 if page->'rows'->0->>'batch_no'<>lower('Fi'||batch) or (page->>'units')::integer<>2 then raise exception 'First display casing unstable';end if;
 checks:=checks+1;
 -- History correction cannot introduce a full scanner payload as Batch.
 rejected:=false;
 begin perform public.correct_pharmflow_expiry_desktop_session_v1(pa,v_session,op2,gen_random_uuid(),0,jsonb_build_object('quantity',1,'batch_no',original_cap->>'raw_scan','expiry_month',2,'expiry_year',2031));
 exception when raise_exception then if SQLERRM<>'Use Scan Barcode, not Batch' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'Correction accepted barcode as Batch';end if;
 checks:=checks+1;
 -- Current-session group quantity correction and deletion retain exact membership.
 members:=jsonb_build_array(jsonb_build_object('operation_id',op,'revision',0),jsonb_build_object('operation_id',op2,'revision',0));
 perform public.correct_pharmflow_expiry_desktop_group_v1(pa,v_session,state_id,gen_random_uuid(),members,3);
 execute 'reset role';
 if (select verified_quantity from public.pharmflow_expiry_current_state_v1 where id=state_id)<>3 then raise exception 'Group edit wrong';end if;
 select jsonb_agg(jsonb_build_object('operation_id',c.operation_id,'revision',c.revision)) into members from pharmflow_expiry_private.session_captures_v1 c join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id) where c.session_id=v_session and c.quantity>0 and coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid)=state_id;
 execute 'set local role authenticated';
 perform public.correct_pharmflow_expiry_desktop_group_v1(pa,v_session,state_id,gen_random_uuid(),members,0);
 execute 'reset role';
 if (select verified_quantity from public.pharmflow_expiry_current_state_v1 where id=state_id)<>0 then raise exception 'Group delete wrong';end if;
 if (select payload from pharmflow_expiry_private.operations where pharmacy_id=pa and operation_id=op) is distinct from original_cap then raise exception 'Original GS1 operation rewritten';end if;
 checks:=checks+3;
 -- Same Batch/item/expiry in another pharmacy remains an independent state.
 perform set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
 select s.state_id into other_id from pharmflow_expiry_private.save_known_core(pb,'1011923',name,'06291100080069','Medicine',1,2,2031,null,batch,null,device,'PC','CAPTURE') s;
 if other_id=state_id or (select pharmacy_id from public.pharmflow_expiry_current_state_v1 where id=other_id)<>pb then raise exception 'Pharmacy groups merged';end if;
 checks:=checks+1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',sid,'exp',extract(epoch from now()+interval '1 hour'))::text,true);
 execute 'set local role authenticated';
 rejected:=false;
 begin perform public.save_pharmflow_expiry_capture_v3(pb,gen_random_uuid(),cap);
 exception when raise_exception then if SQLERRM<>'Pharmacy access required' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'Cross pharmacy save allowed';end if;
 execute 'reset role';
 checks:=checks+1;
 perform set_config('pharmflow.qa.batch',jsonb_build_object('checks',checks,'original_GS1','PASS','case_insensitive_identity','PASS','quantity_export_counts','PASS','group_edit_delete','PASS','retry','PASS','date_pharmacy_isolation','PASS','barcode_Batch_rejected','PASS','long_batch','PASS','historical_operations','UNCHANGED','fixtures','ROLLBACK')::text,true);
end $qa$;
select current_setting('pharmflow.qa.batch')::jsonb result;
rollback;
