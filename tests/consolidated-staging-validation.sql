begin;
create temp table validation_result(result jsonb);
do $test$
declare j jsonb;r jsonb; expected_items int;expected_ids int; n int:=0; cursor_value text:=''; pages int:=0; pid uuid:=gen_random_uuid(); old_version text; denied boolean; ph_before int;hist_before int;
begin
 perform set_config('request.jwt.claims',(select jsonb_build_object('sub',u.id,'role','authenticated','session_id',(select s.id from auth.sessions s where s.user_id=u.id limit 1),'exp',extract(epoch from now())+3600)::text from auth.users u where u.id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),true);
 j:=public.owner_export_global_items_page_v1('Items','',750);expected_items:=(j->>'items')::int;expected_ids:=(j->>'identifiers')::int;old_version:=j->>'version';
 select count(*) into hist_before from public.pharmflow_expiry_events_v1;
 -- Synthetic pharmacy and dependent permission row exist only in this rollback.
 insert into public.pharmacies(id,name,code,status,active) values(pid,'Synthetic consolidated test','SYN-CON-28','active',true);
 insert into public.pharmflow_pharmacy_permissions_v1(pharmacy_id) values(pid) on conflict do nothing;
 perform public.owner_update_pharmacy_identity_v1(pid,'Synthetic renamed','SYN-CON-29');
 if not exists(select 1 from public.pharmacies where id=pid and code='SYN-CON-29') or not exists(select 1 from public.pharmflow_pharmacy_permissions_v1 where pharmacy_id=pid) then raise exception 'Identity failed';end if;
 -- Exercise real server paging beyond the API default cap using synthetic data.
 insert into public.pharmflow_global_items_v2(item_code,item_name,group_name) select 'SYN-CON-'||lpad(g::text,5,'0'),'Synthetic export '||g,'Medicine' from generate_series(1,1007) g;
 insert into public.pharmflow_global_item_identifiers_v2(id,item_code,identifier_display,identifier_key) select gen_random_uuid(),'SYN-CON-'||lpad(g::text,5,'0'),'0000CON'||g,'0000CON'||g from generate_series(1,1007) g;
 loop
  j:=public.owner_export_global_items_page_v1('Items',cursor_value,317);pages:=pages+1;
  exit when jsonb_array_length(j->'rows')=0;
  n:=n+jsonb_array_length(j->'rows');cursor_value:=j->'rows'->-1->>'item_code';
 end loop;
 if n<>expected_items+1007 or old_version=j->>'version' then raise exception 'Items paging or fingerprint failed';end if;
 cursor_value:='';n:=0;
 loop
  j:=public.owner_export_global_items_page_v1('Identifiers',cursor_value,317);
  exit when jsonb_array_length(j->'rows')=0;
  n:=n+jsonb_array_length(j->'rows');cursor_value:=j->'rows'->-1->>'id';
 end loop;
 if n<>expected_ids+1007 then raise exception 'Identifier paging failed';end if;
 -- Non-owner cannot call either Owner function, regardless of browser controls.
 perform set_config('request.jwt.claims',(select jsonb_build_object('sub',u.id,'role','authenticated','session_id',(select s.id from auth.sessions s where s.user_id=u.id limit 1),'exp',extract(epoch from now())+3600)::text from auth.users u where u.id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),true);
 denied:=false;begin perform public.owner_export_global_items_page_v1('Items','',1);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Non-owner export leaked';end if;
 denied:=false;begin perform public.owner_update_pharmacy_identity_v1(pid,'Bad','BAD-CODE');exception when others then if sqlerrm like '%Owner%' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Non-owner identity changed';end if;
 if has_function_privilege('anon','public.owner_export_global_items_page_v1(text,text,integer)','EXECUTE') then raise exception 'Anon grant leak';end if;
 if (select count(*) from public.pharmflow_expiry_events_v1)<>hist_before then raise exception 'Operational history changed';end if;
 insert into validation_result values(jsonb_build_object('owner_export','PASS','non_owner_export_denied',denied,'anonymous_execute_denied',true,'pharmacy_code_uuid_and_dependency','PASS','non_owner_identity_denied',true,'items_baseline',expected_items,'identifiers_baseline',expected_ids,'synthetic_items_paged',expected_items+1007,'synthetic_identifiers_paged',n,'pages_items',pages,'fingerprint_mutation_detected',true,'operational_history_unchanged',true,'all_fixtures','ROLLBACK'));
end $test$;
select result from validation_result;
rollback;
