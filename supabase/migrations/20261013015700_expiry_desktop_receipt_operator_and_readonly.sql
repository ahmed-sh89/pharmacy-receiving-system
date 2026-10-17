-- Keep recorded operator attribution and expose the existing external-recount read-only guard.
create or replace function public.list_pharmflow_expiry_desktop_session_v1(p_pharmacy_id uuid,p_session_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r jsonb;
begin
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id);
 select coalesce(jsonb_agg(x.receipt order by x.captured_at desc,x.operation_id desc),'[]'::jsonb) into r from (
  select coalesce(e.occurred_at,n.created_at,o.created_at) captured_at,o.operation_id,o.payload||c.facts||jsonb_build_object('worker_name',coalesce(e.verified_by_name,'Desktop'),'operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,'acknowledgement',o.result,'quantity',c.quantity,'revision',c.revision,'captured_at',coalesce(e.occurred_at,n.created_at,o.created_at),'status',case when c.quantity=0 then 'DELETED' when o.payload->>'kind'='UNKNOWN' then n.status else 'SAVED' end,'editable',c.quantity>0 and (o.payload->>'kind'='KNOWN' or n.status='PENDING') and
   (o.payload->>'kind'<>'KNOWN' or not exists(
    select 1 from public.pharmflow_expiry_events_v1 external_event
    where external_event.state_id=coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid)
    and external_event.occurred_at>=(select occurred_at from public.pharmflow_expiry_events_v1 where id=coalesce((c.facts->>'effective_event_id')::uuid,(o.result->>'event_id')::uuid))
    and external_event.event_type in ('RECOUNT','CLEARED')
    and not exists(select 1 from pharmflow_expiry_private.session_adjustments_v1 adjustment where adjustment.event_id=external_event.id or coalesce(adjustment.result->'event_ids','[]'::jsonb) ? external_event.id::text)
   ))) receipt
  from pharmflow_expiry_private.session_captures_v1 c join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id)
  left join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>'event_id')::uuid and e.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_needs_review_v2 n on n.id=(o.result->>'review_id')::uuid and n.pharmacy_id=o.pharmacy_id
  where c.session_id=p_session_id and o.payload->>'source'='PC' order by coalesce(e.occurred_at,n.created_at,o.created_at) desc,o.operation_id desc
 ) x;return r;
end $$;
