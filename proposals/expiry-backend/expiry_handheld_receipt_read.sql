-- Additive Expiry-only reader. Applied to staging only; no capture/data writes.
-- The operation payload/result are the committed receipt, not a new ledger.
create function public.list_pharmflow_expiry_capture_receipts_v1(
 p_pharmacy_id uuid, p_device_id text, p_worker_id uuid, p_operation_ids uuid[]
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
declare v_rows jsonb;
begin
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then
  raise exception 'Pharmacy access required';
 end if;
 if nullif(btrim(p_device_id),'') is null or p_worker_id is null or p_operation_ids is null or cardinality(p_operation_ids)>15 then
  raise exception 'Device, operator and at most 15 operation IDs required';
 end if;
 select coalesce(jsonb_agg(q.receipt order by q.captured_at desc,q.operation_id desc),'[]'::jsonb)
 into v_rows from (
  select o.operation_id,coalesce(e.occurred_at,n.created_at,o.created_at) as captured_at,
   o.payload || jsonb_build_object(
    'operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,
    'acknowledgement',o.result,'captured_at',coalesce(e.occurred_at,n.created_at,o.created_at),
    'operator_name',coalesce(e.verified_by_name,d.worker_name,w.worker_name),
    'status',case when o.payload->>'kind'='UNKNOWN' then coalesce(n.status::text,'PENDING') else 'SAVED' end
   ) as receipt
  from pharmflow_expiry_private.operations o
  left join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>'event_id')::uuid and e.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_needs_review_v2 n on n.id=(o.result->>'review_id')::uuid and n.pharmacy_id=o.pharmacy_id
  left join pharmflow_expiry_private.review_details d on d.review_id=n.id and d.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_expiry_workers_v1 w on w.id=p_worker_id and w.pharmacy_id=o.pharmacy_id
  where o.pharmacy_id=p_pharmacy_id and o.created_by=auth.uid() and o.status='COMMITTED'
   and o.operation_id=any(p_operation_ids) and o.payload->>'source'='HANDHELD'
   and o.payload->>'device_id'=p_device_id and o.payload->>'worker_id'=p_worker_id::text
 ) q;
 return v_rows;
end $$;
revoke all on function public.list_pharmflow_expiry_capture_receipts_v1(uuid,text,uuid,uuid[]) from public,anon;
grant execute on function public.list_pharmflow_expiry_capture_receipts_v1(uuid,text,uuid,uuid[]) to authenticated;
