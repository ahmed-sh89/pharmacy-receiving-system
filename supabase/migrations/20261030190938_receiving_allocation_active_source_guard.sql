-- STAGING ONLY: preserve closed/historical domain boundaries.
create or replace function public.allocate_pharmflow_receiving_v1(
 p_pharmacy_id uuid,p_operation_id uuid,p_transaction_id text,p_allocations jsonb,
 p_expected_revision bigint,p_expected_balance bigint,p_reason text,p_device_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.pharmflow_receiving_transactions_v1%rowtype; m public.pharmflow_active_order_manifest_v1%rowtype;
 prior pharmflow_receiving_private.operations_v1%rowtype; a jsonb; req jsonb; result jsonb; balance bigint; moved bigint; qty bigint; total bigint; ord text; k text; idx int:=0; txid text;
begin
 perform pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'allocate_pharmflow_receiving_v1');
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access required';end if;
 if p_operation_id is null or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Operation and correction reason required';end if;
 if jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) not between 1 and 20 then raise exception 'Invalid allocation';end if;
 req:=jsonb_build_object('transaction',p_transaction_id,'allocations',p_allocations,'revision',p_expected_revision,'balance',p_expected_balance,'reason',p_reason,'device',p_device_id);
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|allocation|'||p_operation_id::text,0));
 select * into prior from pharmflow_receiving_private.operations_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if found then if prior.kind<>'ALLOCATION' or prior.request<>req then raise exception 'Operation ID content mismatch';end if;return prior.result;end if;
 select * into m from public.pharmflow_active_order_manifest_v1 where pharmacy_id=p_pharmacy_id for share;
 if not found or m.revision<>p_expected_revision then raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';end if;
 select * into t from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and transaction_id=p_transaction_id;
 if not found or t.quantity<=0 then raise exception 'Positive source receipt required';end if;
 if coalesce(t.order_number,'')<>'' and not exists(select 1 from jsonb_array_elements(m.manifest->'orderFiles') file where upper(trim(file->>'documentId'))=t.order_number) then raise exception 'Closed or historical source Order cannot be reallocated';end if;
 -- Same locks as the existing append action. Stable ordering prevents opposing
 -- A->B/B->A corrections from deadlocking and protects balance checks from scans.
 for k in select distinct coalesce(q.ord,'') from (select t.order_number ord union all select upper(trim(x->>'orderNumber')) from jsonb_array_elements(p_allocations) x) q order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||k||'|'||t.item_code,0));
 end loop;
 select coalesce(sum(quantity),0) into balance from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and item_code=t.item_code and coalesce(order_number,'')=coalesce(t.order_number,'');
 if balance is distinct from p_expected_balance then raise exception 'STALE_RECEIVING_BALANCE';end if;
 select coalesce(sum((audit.result->>'moved')::bigint),0) into moved from pharmflow_receiving_private.operations_v1 audit where audit.pharmacy_id=p_pharmacy_id and audit.kind='ALLOCATION' and audit.request->>'transaction'=p_transaction_id;
 total:=0;
 for a in select value from jsonb_array_elements(p_allocations) loop
  ord:=upper(trim(coalesce(a->>'orderNumber','')));
  if coalesce(a->>'quantity','') !~ '^[0-9]+$' then raise exception 'Positive whole quantity required';end if;qty:=(a->>'quantity')::bigint;
  if qty is null or qty<=0 or (a->>'quantity')::numeric<>qty or qty>2147483647 then raise exception 'Positive whole quantity required';end if;
  if ord='' or ord=coalesce(t.order_number,'') or not exists(select 1 from jsonb_array_elements(m.manifest->'orderFiles') f where upper(trim(f->>'documentId'))=ord) then raise exception 'Active distinct target Order required';end if;
  total:=total+qty;
 end loop;
 if total>t.quantity-moved or total>balance then raise exception 'Allocation exceeds available receipt quantity';end if;
 -- Append a compensating source entry and target entries in ONE transaction.
 -- Original item/user/time/provenance remains on the original immutable row.
 for a in select jsonb_build_object('orderNumber',coalesce(t.order_number,''),'quantity',-total) union all select value from jsonb_array_elements(p_allocations) loop
  idx:=idx+1;ord:=upper(trim(a->>'orderNumber'));qty:=(a->>'quantity')::bigint;txid:='ALLOC-'||p_operation_id::text||'-'||idx;
  insert into public.pharmflow_receiving_transactions_v1(pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload,created_by)
  values(p_pharmacy_id,txid,nullif(ord,''),t.item_code,t.item_name,t.gtin,qty::integer,'ORDER_ALLOCATION',p_device_id,now(),
   t.payload||jsonb_build_object('transactionId',txid,'orderId',ord,'selectedOrderNumber',ord,'quantity',qty,'dateTime',now(),'deviceId',p_device_id,'source','ORDER_ALLOCATION','unassigned',ord='','allocationOperation',p_operation_id,'correctsTransactionId',t.transaction_id,'correctionReason',p_reason,'originalOccurredAt',t.occurred_at,'originalCreatedBy',t.created_by),auth.uid());
 end loop;
 result:=jsonb_build_object('operationId',p_operation_id,'moved',total,'netQuantityChange',0);
 insert into pharmflow_receiving_private.operations_v1 values(p_pharmacy_id,p_operation_id,'ALLOCATION',req,to_jsonb(t),result,auth.uid(),now());return result;
end $$;
