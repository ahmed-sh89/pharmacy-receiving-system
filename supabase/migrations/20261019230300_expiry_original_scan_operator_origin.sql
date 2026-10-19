-- Use original operation provenance, including delayed Needs Review resolution.
-- Only the new attribution metadata changes; operation/event payloads remain immutable.
create or replace function pharmflow_expiry_private.keep_operator_origin_v1(p_state uuid,p_pharmacy uuid,p_event uuid,p_worker uuid,p_name text,p_recorded_at timestamptz)
returns void language sql security definer set search_path=pg_catalog as $$
 insert into pharmflow_expiry_private.first_operator_v1(state_id,pharmacy_id,event_id,worker_id,operator_name,occurred_at)
 select p_state,p_pharmacy,p_event,p_worker,case when p_worker is not null then p_name end,p_recorded_at
 where exists(select 1 from public.pharmflow_expiry_events_v1 where id=p_event and state_id=p_state and pharmacy_id=p_pharmacy)
 on conflict(state_id) do update set event_id=excluded.event_id,worker_id=excluded.worker_id,operator_name=excluded.operator_name,occurred_at=excluded.occurred_at
 where (excluded.occurred_at,excluded.event_id)<(first_operator_v1.occurred_at,first_operator_v1.event_id)
$$;
create or replace function pharmflow_expiry_private.record_operation_operator_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare e public.pharmflow_expiry_events_v1%rowtype;
begin
 if new.status='COMMITTED' and new.payload->>'kind'='KNOWN' and new.result->>'event_id' is not null then
 select * into e from public.pharmflow_expiry_events_v1 where id=(new.result->>'event_id')::uuid and pharmacy_id=new.pharmacy_id;
 if found then perform pharmflow_expiry_private.keep_operator_origin_v1(e.state_id,e.pharmacy_id,e.id,(new.payload->>'worker_id')::uuid,e.verified_by_name,new.created_at);end if;
 end if;return new;
end $$;
create or replace function pharmflow_expiry_private.record_review_operator_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r record;
begin
 select op.payload,op.created_at,d.worker_name into r from pharmflow_expiry_private.review_details d join pharmflow_expiry_private.operations op on op.pharmacy_id=d.pharmacy_id and op.operation_id=d.operation_id
 where d.review_id=new.review_id and d.pharmacy_id=new.pharmacy_id;
 if found then perform pharmflow_expiry_private.keep_operator_origin_v1(new.expiry_state_id,new.pharmacy_id,new.expiry_event_id,(r.payload->>'worker_id')::uuid,r.worker_name,r.created_at);end if;
 return new;
end $$;
revoke all on function pharmflow_expiry_private.keep_operator_origin_v1(uuid,uuid,uuid,uuid,text,timestamptz),pharmflow_expiry_private.record_operation_operator_v1(),pharmflow_expiry_private.record_review_operator_v1() from public,anon,authenticated;
create trigger expiry_operation_operator_origin_v1 after update of status on pharmflow_expiry_private.operations for each row execute function pharmflow_expiry_private.record_operation_operator_v1();
create trigger expiry_review_operator_origin_v1 after insert on public.pharmflow_expiry_review_resolution_audit_v1 for each row execute function pharmflow_expiry_private.record_review_operator_v1();
-- Reconcile attribution-only records against preserved original evidence.
do $$
declare x record;
begin
 for x in select e.state_id,e.pharmacy_id,e.id event_id,(o.payload->>'worker_id')::uuid worker_id,e.verified_by_name operator_name,o.created_at
 from pharmflow_expiry_private.operations o join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>'event_id')::uuid and e.pharmacy_id=o.pharmacy_id where o.status='COMMITTED' and o.payload->>'kind'='KNOWN'
 union all
 select a.expiry_state_id,a.pharmacy_id,a.expiry_event_id,(o.payload->>'worker_id')::uuid,d.worker_name,o.created_at
 from public.pharmflow_expiry_review_resolution_audit_v1 a join pharmflow_expiry_private.review_details d on d.review_id=a.review_id and d.pharmacy_id=a.pharmacy_id
 join pharmflow_expiry_private.operations o on o.pharmacy_id=d.pharmacy_id and o.operation_id=d.operation_id
 loop perform pharmflow_expiry_private.keep_operator_origin_v1(x.state_id,x.pharmacy_id,x.event_id,x.worker_id,x.operator_name,x.created_at);end loop;
end $$;

