-- STAGING ONLY. Unique disposable fixture operations. All writes roll back.
begin;
set local statement_timeout='45s';
do $qa$
declare actor uuid;pa uuid;pb uuid;sid uuid;ses uuid;device text;wid uuid;op uuid:=gen_random_uuid();req uuid:=gen_random_uuid();
 prefix text:='QA-CLEAR-'||gen_random_uuid();cap jsonb;ack jsonb;preview jsonb;resolved_preview jsonb;receipt jsonb;page jsonb;rejected boolean;
 summary_before jsonb;history_before jsonb;state_before text;events_before text;operators_before text;other_before text;one jsonb;
begin
 select id into strict actor from auth.users where email='pharmflow-staging-owner@example.invalid';
 select pharmacy_id into strict pa from public.pharmacy_members where user_id=actor and active;
 select id into strict pb from public.pharmacies where id<>pa limit 1;
 select id into strict sid from auth.sessions where user_id=actor and (not_after is null or not_after>now()) order by created_at desc limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',sid,'exp',extract(epoch from now()+interval '1 hour'))::text,true);
 execute 'set local role authenticated';
 select worker_id into strict wid from public.list_pharmacy_expiry_workers(pa) where worker_name='Desktop';
 ses:=(public.get_pharmflow_expiry_auth_session_v1(pa,'QA-'||prefix)->>'session_id')::uuid;
 execute 'reset role';select device_id into strict device from pharmflow_expiry_private.active_sessions_v1 where id=ses;execute 'set local role authenticated';
 cap:=jsonb_build_object('kind','KNOWN','source','HANDHELD','worker_id',wid,'device_id',device,'item_code','1011923','item_name','Disposable Clear All fixture','identifier_display','06291100080069','raw_scan','06291100080069','scan_format','PLAIN','sample_serial',null,'batch_no',prefix||'A','expiry_month',2,'expiry_year',2031,'quantity',2);
 ack:=public.save_pharmflow_expiry_session_capture_v2(pa,ses,op,cap);
 perform public.save_pharmflow_expiry_session_capture_v2(pa,ses,gen_random_uuid(),cap||jsonb_build_object('batch_no',prefix||'B','quantity',3));
 preview:=public.select_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',prefix),false,null);
 perform public.mutate_pharmflow_expiry_inventory_v1(pa,gen_random_uuid(),'RESOLVE',preview->'selection');
 perform public.save_pharmflow_expiry_session_capture_v2(pa,ses,gen_random_uuid(),cap||jsonb_build_object('batch_no',prefix||'C','quantity',4));
 resolved_preview:=public.select_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',prefix),true,null);
 if (resolved_preview->>'count')::int<>2 then raise exception 'Fixture count incorrect';end if;
 -- A restore winning before a stale Clear All must abort the whole Clear, leaving the other row intact.
 one:=jsonb_build_array(resolved_preview->'selection'->0);
 perform public.mutate_pharmflow_expiry_inventory_v1(pa,gen_random_uuid(),'RESTORE',one);
 rejected:=false;begin perform public.mutate_pharmflow_expiry_inventory_v1(pa,gen_random_uuid(),'CLEAR_RESOLVED',resolved_preview->'selection');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Stale clear accepted';end if;
 page:=public.select_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',prefix),true,null);
 if (page->>'count')::int<>1 then raise exception 'Failed clear partially changed history';end if;
 preview:=public.select_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',prefix,'months',jsonb_build_array('2031-02')),false,null);
 -- Remove the restored fixture only; retain C as an active quantity control.
 execute 'reset role';select jsonb_build_array(jsonb_build_object('id',s.id,'version',v.version)) into one from public.pharmflow_expiry_current_state_v1 s join pharmflow_expiry_private.inventory_rows_v1(pa,false) v on v.row_id=s.id where s.batch_no in (prefix||'A',prefix||'B') and s.status='ACTIVE';execute 'set local role authenticated';
 perform public.mutate_pharmflow_expiry_inventory_v1(pa,gen_random_uuid(),'RESOLVE',one);
 resolved_preview:=public.select_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',prefix),true,null);
 -- An active recapture may share the original state with a resolved snapshot. Clear must not touch it.
 perform public.save_pharmflow_expiry_session_capture_v2(pa,ses,gen_random_uuid(),cap||jsonb_build_object('batch_no',prefix||'A','quantity',6));
 summary_before:=public.summary_pharmflow_expiry_inventory_v1(pa);
 execute 'reset role';
 select md5(string_agg(to_jsonb(s)::text,'' order by s.id)) into state_before from public.pharmflow_expiry_current_state_v1 s;
 select md5(string_agg(to_jsonb(e)::text,'' order by e.id)) into events_before from public.pharmflow_expiry_events_v1 e;
 select md5(string_agg(to_jsonb(o)::text,'' order by o.state_id)) into operators_before from pharmflow_expiry_private.first_operator_v1 o;
 select jsonb_agg(to_jsonb(r)-'cleared_at'-'cleared_by' order by r.id) into history_before from pharmflow_expiry_private.resolved_inventory_v1 r;
 select md5(string_agg(to_jsonb(r)::text,'' order by r.id)) into other_before from pharmflow_expiry_private.resolved_inventory_v1 r where r.pharmacy_id<>pa;
 execute 'set local role authenticated';
 rejected:=false;begin perform public.mutate_pharmflow_expiry_inventory_v1(pb,gen_random_uuid(),'CLEAR_RESOLVED',resolved_preview->'selection');exception when raise_exception then if SQLERRM<>'Pharmacy access required' then raise;end if;rejected:=true;end;if not rejected then raise exception 'Cross-pharmacy clear accepted';end if;
 receipt:=public.mutate_pharmflow_expiry_inventory_v1(pa,req,'CLEAR_RESOLVED',resolved_preview->'selection');
 if (receipt->>'count')::int<>2 or receipt->>'action'<>'CLEAR_RESOLVED' then raise exception 'Clear receipt mismatch';end if;
 if public.mutate_pharmflow_expiry_inventory_v1(pa,req,'CLEAR_RESOLVED',resolved_preview->'selection') is distinct from receipt then raise exception 'Retry changed receipt';end if;
 rejected:=false;begin perform public.mutate_pharmflow_expiry_inventory_v1(pa,req,'RESTORE',resolved_preview->'selection');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Request payload conflict accepted';end if;
 rejected:=false;begin perform public.mutate_pharmflow_expiry_inventory_v1(pa,gen_random_uuid(),'CLEAR_RESOLVED',resolved_preview->'selection');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Already cleared rows accepted again';end if;
 rejected:=false;begin perform public.mutate_pharmflow_expiry_inventory_v1(pa,gen_random_uuid(),'RESTORE',resolved_preview->'selection');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Cleared rows restored';end if;
 page:=public.query_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',prefix),true,'UPDATED',0,40);
 if (page->>'count')::int<>0 or jsonb_array_length(page->'rows')<>0 then raise exception 'Cleared rows remain visible';end if;
 if jsonb_array_length(public.export_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',prefix),true))<>0 then raise exception 'Export leaked cleared rows';end if;
 if public.summary_pharmflow_expiry_inventory_v1(pa) is distinct from summary_before then raise exception 'Clear changed KPIs';end if;
 preview:=public.select_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',prefix||'C'),false,null);
 rejected:=false;begin perform public.mutate_pharmflow_expiry_inventory_v1(pa,gen_random_uuid(),'CLEAR_RESOLVED',preview->'selection');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Active Inventory cleared';end if;
 -- Re-enter authenticated context; the result is authoritative, not client memory.
 perform set_config('request.jwt.claims','{}',true);
 rejected:=false;begin perform public.mutate_pharmflow_expiry_inventory_v1(pa,gen_random_uuid(),'CLEAR_RESOLVED',resolved_preview->'selection');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Unsigned clear accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',sid,'exp',extract(epoch from now()+interval '1 hour'))::text,true);
 if (public.select_pharmflow_expiry_inventory_v1(pa,jsonb_build_object('search',prefix),true,null)->>'count')::int<>0 then raise exception 'Cleared rows reappeared on reauthentication';end if;
 execute 'reset role';
 if state_before is distinct from (select md5(string_agg(to_jsonb(s)::text,'' order by s.id)) from public.pharmflow_expiry_current_state_v1 s) then raise exception 'Clear changed active/state values';end if;
 if events_before is distinct from (select md5(string_agg(to_jsonb(e)::text,'' order by e.id)) from public.pharmflow_expiry_events_v1 e) then raise exception 'Clear changed events';end if;
 if operators_before is distinct from (select md5(string_agg(to_jsonb(o)::text,'' order by o.state_id)) from pharmflow_expiry_private.first_operator_v1 o) then raise exception 'Clear changed attribution';end if;
 if history_before is distinct from (select jsonb_agg(to_jsonb(r)-'cleared_at'-'cleared_by' order by r.id) from pharmflow_expiry_private.resolved_inventory_v1 r) then raise exception 'Clear rewrote history';end if;
 if other_before is distinct from (select md5(string_agg(to_jsonb(r)::text,'' order by r.id)) from pharmflow_expiry_private.resolved_inventory_v1 r where r.pharmacy_id<>pa) then raise exception 'Other pharmacy changed';end if;
 if (select count(*) from pharmflow_expiry_private.inventory_requests_v1 where request_id=req)<>1 then raise exception 'Clear request audit missing/duplicated';end if;
 if (select count(*) from pharmflow_expiry_private.resolved_inventory_v1 where pharmacy_id=pa and id in(select (v->>'id')::uuid from jsonb_array_elements(resolved_preview->'selection') v) and cleared_by=actor and cleared_at is not null)<>2 then raise exception 'Clear actor/time missing';end if;
end $qa$;
rollback;
