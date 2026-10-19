-- Attribution-only recovery for previously re-keyed/merged operation groups.
-- The source operation, correction receipt, events and quantities are not changed.
do $$
declare x record;
begin
 for x in
 select (a.result->>'state_id')::uuid state_id,o.pharmacy_id,a.event_id,
 (o.payload->>'worker_id')::uuid worker_id,coalesce(e.verified_by_name,d.worker_name) operator_name,o.created_at
 from pharmflow_expiry_private.session_adjustments_v1 a
 join pharmflow_expiry_private.operations o on o.operation_id=a.operation_id
 join pharmflow_expiry_private.active_sessions_v1 s on s.id=a.session_id and s.pharmacy_id=o.pharmacy_id
 left join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>'event_id')::uuid and e.pharmacy_id=o.pharmacy_id
 left join pharmflow_expiry_private.review_details d on d.operation_id=o.operation_id and d.pharmacy_id=o.pharmacy_id
 where a.event_id is not null and a.result->>'state_id' is not null
 loop perform pharmflow_expiry_private.keep_operator_origin_v1(x.state_id,x.pharmacy_id,x.event_id,x.worker_id,x.operator_name,x.created_at);end loop;
end $$;
