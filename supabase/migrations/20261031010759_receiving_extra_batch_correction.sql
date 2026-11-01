-- STAGING candidate: exceptional full-receipt correction, one destination,
-- one transaction. Reuse the validated compensating-ledger implementation.
create or replace function public.correct_pharmflow_extra_receipts_v1(
 p_pharmacy_id uuid,p_operation_id uuid,p_receipts jsonb,p_destination_order text,
 p_expected_revision bigint,p_device_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.pharmflow_active_order_manifest_v1%rowtype;
 prior pharmflow_receiving_private.operations_v1%rowtype; t public.pharmflow_receiving_transactions_v1%rowtype;
 req jsonb; selection jsonb; destination text:=upper(trim(p_destination_order));
 balance bigint; moved bigint; available bigint; total bigint:=0; count_rows integer:=0; source_file jsonb; child uuid;
begin
 perform pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'correct_pharmflow_extra_receipts_v1');
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access required';end if;
 if p_operation_id is null or jsonb_typeof(p_receipts) is distinct from 'array' or jsonb_array_length(p_receipts) not between 1 and 100 then raise exception 'Select 1 to 100 eligible receipts';end if;
 if (select count(distinct x->>'transactionId') from jsonb_array_elements(p_receipts) x)<>jsonb_array_length(p_receipts) then raise exception 'Duplicate receipt selection';end if;
 req:=jsonb_build_object('receipts',p_receipts,'destination',destination,'revision',p_expected_revision,'device',p_device_id);
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|extra-batch',0));
 select * into prior from pharmflow_receiving_private.operations_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if found then if prior.kind<>'EXTRA_BATCH' or prior.request<>req then raise exception 'Operation ID content mismatch';end if;return prior.result;end if;
 select * into m from public.pharmflow_active_order_manifest_v1 where pharmacy_id=p_pharmacy_id for share;
 if not found or m.revision<>p_expected_revision then raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';end if;
 if destination='' or not exists(select 1 from jsonb_array_elements(m.manifest->'orderFiles') f where upper(trim(f->>'documentId'))=destination) then raise exception 'Active destination in this pharmacy required';end if;
 -- All item/order locks are acquired in stable order before any child write.
 for source_file in
  select to_jsonb(k) from (
   select distinct coalesce(r.order_number,'') ord,r.item_code code from public.pharmflow_receiving_transactions_v1 r
    join jsonb_array_elements(p_receipts) x on x->>'transactionId'=r.transaction_id where r.pharmacy_id=p_pharmacy_id
   union select distinct destination,r.item_code from public.pharmflow_receiving_transactions_v1 r
    join jsonb_array_elements(p_receipts) x on x->>'transactionId'=r.transaction_id where r.pharmacy_id=p_pharmacy_id
  ) k order by k.ord,k.code
 loop perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||(source_file->>'ord')||'|'||(source_file->>'code'),0));end loop;
 for selection in select value from jsonb_array_elements(p_receipts) order by value->>'transactionId' loop
  select * into t from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and transaction_id=selection->>'transactionId';
  if not found or t.quantity<=0 then raise exception 'Eligible receipt in this pharmacy required';end if;
  if coalesce(t.order_number,'')='' then
   if coalesce((t.payload->>'unassigned')::boolean,false)<>true then raise exception 'Explicit Unassigned receipt required';end if;
  else
   select f into source_file from jsonb_array_elements(m.manifest->'orderFiles') f where upper(trim(f->>'documentId'))=t.order_number;
   if not found or jsonb_typeof(source_file->'sourceRows') is distinct from 'array' then raise exception 'Active source lines required';end if;
   if exists(select 1 from jsonb_array_elements(source_file->'sourceRows') line where upper(trim(line->>'itemCode'))=t.item_code and (line->>'orderedQty')::numeric>0) then raise exception 'Ordinary receiving cannot be reassigned';end if;
  end if;
  if destination=coalesce(t.order_number,'') or not exists(
   select 1 from jsonb_array_elements(m.manifest->'orderFiles') f cross join lateral jsonb_array_elements(coalesce(f->'sourceRows','[]'::jsonb)) line
   where upper(trim(f->>'documentId'))=destination and upper(trim(line->>'itemCode'))=t.item_code and (line->>'orderedQty')::numeric>0
  ) then raise exception 'Destination must contain every selected item';end if;
  select coalesce(sum(quantity),0) into balance from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and item_code=t.item_code and coalesce(order_number,'')=coalesce(t.order_number,'');
  select coalesce(sum((o.result->>'moved')::bigint),0) into moved from pharmflow_receiving_private.operations_v1 o where o.pharmacy_id=p_pharmacy_id and o.kind='ALLOCATION' and o.request->>'transaction'=t.transaction_id;
  available:=least(t.quantity-moved,balance);
  if available<=0 or (selection->>'quantity') is distinct from available::text then raise exception 'STALE_RECEIVING_BALANCE';end if;
  child:=md5(p_operation_id::text||'/'||t.transaction_id)::uuid;
  perform public.allocate_pharmflow_receiving_v1(p_pharmacy_id,child,t.transaction_id,jsonb_build_array(jsonb_build_object('orderNumber',destination,'quantity',available)),p_expected_revision,balance,'Extra / Unassigned order correction',p_device_id);
  total:=total+available;count_rows:=count_rows+1;
 end loop;
 insert into pharmflow_receiving_private.operations_v1 values(p_pharmacy_id,p_operation_id,'EXTRA_BATCH',req,p_receipts,jsonb_build_object('receipts',count_rows,'moved',total,'netQuantityChange',0),auth.uid(),now());
 return jsonb_build_object('receipts',count_rows,'moved',total,'netQuantityChange',0);
end $$;
revoke all on function public.correct_pharmflow_extra_receipts_v1(uuid,uuid,jsonb,text,bigint,text) from public,anon;
grant execute on function public.correct_pharmflow_extra_receipts_v1(uuid,uuid,jsonb,text,bigint,text) to authenticated;
-- The former general-purpose candidate endpoint is now internal only.
revoke execute on function public.allocate_pharmflow_receiving_v1(uuid,uuid,text,jsonb,bigint,bigint,text,text) from public,anon,authenticated;
