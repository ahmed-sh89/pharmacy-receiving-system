-- Append-only receipt reversal, sharing allocation consumption and locking.
create or replace function public.cancel_pharmflow_extra_receipt_v1(
 p_pharmacy_id uuid,p_operation_id uuid,p_transaction_id text,p_expected_quantity integer,
 p_expected_revision bigint,p_device_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.pharmflow_receiving_transactions_v1%rowtype; m public.pharmflow_active_order_manifest_v1%rowtype;
 prior pharmflow_receiving_private.operations_v1%rowtype; req jsonb; result jsonb; balance bigint; moved bigint; qty bigint; txid text;
begin
 perform pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'cancel_pharmflow_extra_receipt_v1');
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access required';end if;
 if p_operation_id is null or coalesce(p_transaction_id,'')='' or coalesce(p_expected_quantity,0)<=0 or p_expected_revision is null then raise exception 'Exact receipt, quantity and revision required';end if;
 req:=jsonb_build_object('action','CANCEL_RECEIPT','transaction',p_transaction_id,'quantity',p_expected_quantity,'revision',p_expected_revision,'device',p_device_id);
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|extra-batch',0));
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|allocation|'||p_operation_id::text,0));
 select * into prior from pharmflow_receiving_private.operations_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if found then
  if prior.kind<>'ALLOCATION' or prior.request<>req or prior.actor is distinct from auth.uid() then raise exception 'Operation ID content mismatch';end if;
  return prior.result;
 end if;
 select * into m from public.pharmflow_active_order_manifest_v1 where pharmacy_id=p_pharmacy_id for share;
 if not found or m.revision is distinct from p_expected_revision then raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';end if;
 select * into t from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and transaction_id=p_transaction_id;
 if not found or t.quantity<=0 or t.payload->>'undone'='true' then raise exception 'Positive source receipt required';end if;
 if coalesce(t.order_number,'')='' then
  if t.payload->>'unassigned' is distinct from 'true' then raise exception 'Explicit Unassigned receipt required';end if;
 else
  if not exists(select 1 from jsonb_array_elements(m.manifest->'orderFiles') f where upper(trim(f->>'documentId'))=t.order_number) then raise exception 'Active source Order required';end if;
  if exists(select 1 from jsonb_array_elements(m.manifest->'orderFiles') f cross join lateral jsonb_array_elements(f->'sourceRows') r where upper(trim(f->>'documentId'))=t.order_number and upper(trim(r->>'itemCode'))=t.item_code and (r->>'orderedQty')::numeric>0) then raise exception 'Ordinary receiving cannot be cancelled here';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||coalesce(t.order_number,'')||'|'||t.item_code,0));
 select coalesce(sum(quantity),0) into balance from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and item_code=t.item_code and coalesce(order_number,'')=coalesce(t.order_number,'');
 select coalesce(sum((a.result->>'moved')::bigint),0) into moved from pharmflow_receiving_private.operations_v1 a where a.pharmacy_id=p_pharmacy_id and a.kind='ALLOCATION' and a.request->>'transaction'=p_transaction_id;
 select greatest(moved,coalesce(-sum(quantity),0)) into moved from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and quantity<0 and payload->>'correctsTransactionId'=p_transaction_id;
 qty:=least(t.quantity-moved,balance);
 if qty<=0 or qty is distinct from p_expected_quantity::bigint then raise exception 'STALE_RECEIPT_QUANTITY';end if;
 txid:='CANCEL-'||p_operation_id::text;
 insert into public.pharmflow_receiving_transactions_v1(pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload,created_by)
 values(p_pharmacy_id,txid,t.order_number,t.item_code,t.item_name,t.gtin,-qty::integer,'ORDER_ALLOCATION',p_device_id,now(),
 t.payload||jsonb_build_object('transactionId',txid,'orderId',coalesce(t.order_number,''),'selectedOrderNumber',coalesce(t.order_number,''),'quantity',-qty,'dateTime',now(),'deviceId',p_device_id,'source','ORDER_ALLOCATION','unassigned',coalesce(t.order_number,'')='','allocationOperation',p_operation_id,'correctsTransactionId',t.transaction_id,'correctionReason','Receipt cancelled','action','CANCEL_RECEIPT','originalOccurredAt',t.occurred_at,'originalCreatedBy',t.created_by),auth.uid());
 -- Source consumption uses the existing allocation audit contract. Unlike a
 -- transfer this explicit cancellation has a negative net quantity change.
 result:=jsonb_build_object('operationId',p_operation_id,'transactionId',txid,'action','CANCEL_RECEIPT','moved',qty,'netQuantityChange',-qty);
 insert into pharmflow_receiving_private.operations_v1 values(p_pharmacy_id,p_operation_id,'ALLOCATION',req,to_jsonb(t),result,auth.uid(),now());
 return result;
end $$;
revoke all on function public.cancel_pharmflow_extra_receipt_v1(uuid,uuid,text,integer,bigint,text) from public,anon;
grant execute on function public.cancel_pharmflow_extra_receipt_v1(uuid,uuid,text,integer,bigint,text) to authenticated;
