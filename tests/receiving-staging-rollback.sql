-- STAGING ONLY: tovkcakucyagvbzvlnks. Run through the Staging connector.
-- Every fixture and RPC write is enclosed in a subtransaction deliberately
-- rolled back before the PASS result. No schema, grants or persistent data change.
do $test$
declare
 pid uuid; actor uuid; marker text:='PFRC_'||replace(gen_random_uuid()::text,'-','');
 orders text[]; rid uuid; operation uuid:=gen_random_uuid(); response jsonb;
 allocations jsonb; ack record; denied boolean; count_rows integer;
begin
 begin
  select m.pharmacy_id,m.user_id into pid,actor
  from public.pharmacy_members m join public.pharmacies p on p.id=m.pharmacy_id
  join auth.users u on u.id=m.user_id join public.pharmflow_pharmacy_permissions_v1 a on a.pharmacy_id=p.id
  where m.role='admin' and m.active and p.active and p.status='active' and a.receiving='FULL'
    and coalesce(u.raw_app_meta_data->>'pharmflow_must_change_password','false')<>'true'
  order by m.pharmacy_id,m.user_id limit 1;
  if pid is null then raise exception 'No authorized Staging test admin'; end if;
  orders:=array[marker||'_A',marker||'_B',marker||'_C'];
  insert into public.pharmflow_orders(pharmacy_id,order_number,status)
   select pid,x,'uploaded' from unnest(orders) x;
  insert into public.pharmflow_active_order_manifest_v1(pharmacy_id,manifest)
  values(pid,jsonb_build_object('active',true,'orderData',jsonb_build_array(jsonb_build_object('itemCode',marker,'orderNumbers',to_jsonb(orders)))))
  on conflict(pharmacy_id) do update set manifest=excluded.manifest;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select review_id into rid from public.create_pharmflow_needs_review_v6(
   p_operation_id=>marker,p_pharmacy_id=>pid,p_workflow=>'RECEIVING',p_identifier_display=>marker,
   p_source=>'HANDHELD',p_device_id=>'STAGING_ROLLBACK_TEST',p_work_scope_order_numbers=>orders,p_pending_quantity=>70);
  allocations:=jsonb_build_array(
   jsonb_build_object('orderNumber',orders[1],'quantity',60,'transactionId',marker||':A1'),
   jsonb_build_object('orderNumber',orders[2],'quantity',10,'transactionId',marker||':A2'));
  response:=public.request_pharmflow_needs_review_resolution_v5(operation,pid,rid,marker,'Staging rollback item',marker,allocations);
  if response->>'status'<>'PENDING' then raise exception 'Expected pending intent, got %',response;end if;
  select * into ack from public.append_pharmflow_receiving_action_v4(pid,marker||':A1',orders[1],marker,'Staging rollback item',marker,60,'SCAN','PC1',now(),'{}');
  if not ack.inserted or ack.authoritative_received<>60 then raise exception 'First allocation incorrect';end if;
  select * into ack from public.append_pharmflow_receiving_action_v4(pid,marker||':A2',orders[2],marker,'Staging rollback item',marker,10,'SCAN','PC2',now(),'{}');
  if not ack.inserted or ack.authoritative_received<>10 then raise exception 'Second allocation incorrect';end if;
  response:=public.request_pharmflow_needs_review_resolution_v5(operation,pid,rid,marker,'Staging rollback item',marker,allocations);
  if response->>'status'<>'RESOLVED' then raise exception 'Expected resolved review, got %',response;end if;
  select * into ack from public.append_pharmflow_receiving_action_v4(pid,marker||':A1',orders[1],marker,'Staging rollback item',marker,60,'SCAN','PC1',now(),'{}');
  if ack.inserted or ack.authoritative_received<>60 then raise exception 'Repeated receipt duplicated quantity';end if;
  response:=public.request_pharmflow_needs_review_resolution_v5(gen_random_uuid(),pid,rid,marker,'Staging rollback item',marker,allocations);
  if response->>'status'<>'RESOLVED' then raise exception 'Repeated Resolve failed';end if;
  denied:=false;
  begin
   perform public.append_pharmflow_receiving_action_v4(gen_random_uuid(),marker||':foreign',orders[1],marker,'',marker,1,'SCAN','PC2',now(),'{}');
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Foreign pharmacy write was not denied';end if;
  execute 'reset role';
  select count(*) into count_rows from public.pharmflow_receiving_transactions_v1 where pharmacy_id=pid and item_code=marker;
  if count_rows<>2 then raise exception 'Unexpected receipt count %',count_rows;end if;
  if (select sum(quantity) from public.pharmflow_receiving_transactions_v1 where pharmacy_id=pid and item_code=marker)<>70 then raise exception 'Wrong aggregate quantity';end if;
  raise exception using errcode='P0002',message='PF_RECEIVING_EXPECTED_ROLLBACK_PASS';
 exception when sqlstate 'P0002' then
  if sqlerrm<>'PF_RECEIVING_EXPECTED_ROLLBACK_PASS' then raise;end if;
 end;
end $test$;
select jsonb_build_object('status','PASS','fixture','fully rolled back','role','authenticated SQL role with existing authorized Staging admin',
 'checks',jsonb_build_array('capture three Orders','durable resolution intent','60/10 two-device receipts','resolved state','duplicate receipt','repeated Resolve','foreign pharmacy denial','exactly two receipts total 70')) as evidence;
