begin;
create temp table expiry_focused_result(result jsonb);
do $qa$
declare actor uuid;pa uuid;pb uuid;sid uuid;ses uuid;device text;worker uuid;op uuid:=gen_random_uuid();prefix text:='SYN-CON-EXP-'||gen_random_uuid();cap jsonb;ack jsonb;again jsonb;denied boolean:=false;total int;
begin
 select id into strict actor from auth.users where email='pharmflow-staging-a@example.invalid';
 select pharmacy_id into strict pa from public.pharmacy_members where user_id=actor and active;
 select id into strict pb from public.pharmacies where id<>pa limit 1;
 sid:=gen_random_uuid();insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,actor,now(),now());
 update public.pharmflow_expiry_workers_v1 set active=true where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',sid,'exp',extract(epoch from now()+interval '1 hour'))::text,true);
 execute 'set local role authenticated';
 select worker_id into strict worker from public.list_pharmacy_expiry_workers(pa) where worker_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 ses:=(public.get_pharmflow_expiry_auth_session_v1(pa,prefix)->>'session_id')::uuid;
 execute 'reset role';select device_id into strict device from pharmflow_expiry_private.active_sessions_v1 where id=ses;execute 'set local role authenticated';
 cap:=jsonb_build_object('kind','KNOWN','source','PC','worker_id',worker,'device_id',device,'item_code','1011923','item_name','Synthetic acknowledgement test','identifier_display','06291100080069','raw_scan','06291100080069','scan_format','PLAIN','sample_serial',null,'batch_no',prefix,'expiry_month',2,'expiry_year',2031,'quantity',1);
 ack:=public.save_pharmflow_expiry_desktop_capture_v1(pa,ses,op,cap);
 -- Ignore the first response, then resend the exact retained operation.
 again:=public.save_pharmflow_expiry_desktop_capture_v1(pa,ses,op,cap);
 if ack is distinct from again then raise exception 'Retry acknowledgement differs';end if;
 begin perform public.save_pharmflow_expiry_desktop_capture_v1(pa,ses,op,cap||jsonb_build_object('quantity',2));exception when others then denied:=true;end;
 if not denied then raise exception 'Changed retry accepted';end if;
 denied:=false;begin perform public.save_pharmflow_expiry_desktop_capture_v1(pb,ses,op,cap);exception when others then denied:=true;end;
 if not denied then raise exception 'Cross pharmacy save accepted';end if;
 execute 'reset role';
 if (select count(*) from pharmflow_expiry_private.operations where pharmacy_id=pa and operation_id=op and status='COMMITTED')<>1 then raise exception 'Duplicate operation';end if;
 if (select count(*) from pharmflow_expiry_private.session_captures_v1 where pharmacy_id=pa and operation_id=op)<>1 then raise exception 'Duplicate capture';end if;
 select sum(verified_quantity) into total from public.pharmflow_expiry_current_state_v1 where pharmacy_id=pa and batch_no=prefix;
 if total<>1 then raise exception 'Retry duplicated quantity';end if;
 insert into expiry_focused_result values(jsonb_build_object('lost_ack_same_operation','PASS','one_committed_operation',true,'one_session_capture',true,'quantity_after_retry',total,'changed_payload_denied',true,'cross_pharmacy_denied',true,'fixtures','ROLLBACK'));
end $qa$;
select result from expiry_focused_result;
rollback;
