-- REVIEW ONLY. NOT APPLIED. Staging target tovkcakucyagvbzvlnks only.
-- No change to existing capture, Inventory, Receiving or single-operation RPCs.
begin;
create table pharmflow_expiry_private.session_group_adjustments_v1 (
 request_id uuid primary key,
 pharmacy_id uuid not null,
 session_id uuid not null,
 state_id uuid not null,
 created_by uuid not null,
 expected_members jsonb not null,
 previous_quantity integer not null check(previous_quantity>0),
 quantity integer not null check(quantity>=0),
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table pharmflow_expiry_private.session_group_adjustments_v1 enable row level security;
revoke all on pharmflow_expiry_private.session_group_adjustments_v1 from public,anon,authenticated;

create function public.correct_pharmflow_expiry_desktop_group_v1(
 p_pharmacy_id uuid,p_session_id uuid,p_state_id uuid,p_request_id uuid,
 p_expected_members jsonb,p_quantity integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $group$
declare
 prior pharmflow_expiry_private.session_group_adjustments_v1%rowtype;
 v public.pharmflow_expiry_current_state_v1%rowtype;
 member record;
 expected jsonb;actual jsonb;results jsonb:='[]'::jsonb;
 old_total bigint;delta bigint;new_qty integer;child jsonb;answer jsonb;
 added_operation uuid;device text;
begin
 -- Existing helper validates pharmacy membership, auth.uid(), live auth.sessions
 -- and exact signed auth-session ownership; it locks the session row first.
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,false);
 if p_state_id is null or p_request_id is null or p_quantity is null or p_quantity<0
    or p_expected_members is null or jsonb_typeof(p_expected_members)<>'array' then
  raise exception 'Complete group correction required';
 end if;
 if jsonb_array_length(p_expected_members) not between 1 and 500 then
  raise exception 'Unsupported group size';
 end if;
 for member in select value entry from jsonb_array_elements(p_expected_members) loop
  if jsonb_typeof(member.entry)<>'object'
     or not(member.entry ?& array['operation_id','revision'])
     or (select count(*) from jsonb_object_keys(member.entry))<>2
     or jsonb_typeof(member.entry->'operation_id')<>'string'
     or jsonb_typeof(member.entry->'revision')<>'number'
     or (member.entry->>'revision') !~ '^[0-9]+$' then
   raise exception 'Invalid expected membership';
  end if;
 end loop;
 select jsonb_agg(jsonb_build_object('operation_id',(value->>'operation_id')::uuid,
     'revision',(value->>'revision')::integer) order by (value->>'operation_id')::uuid)
 into expected from jsonb_array_elements(p_expected_members);
 if (select count(distinct (value->>'operation_id')::uuid)
     from jsonb_array_elements(expected))<>jsonb_array_length(expected) then
  raise exception 'Duplicate expected member';
 end if;
 -- Serialize a request ID across sessions; scope/payload conflicts never return
 -- another owner's result. Transaction locks disappear on error/rollback.
 perform pg_advisory_xact_lock(hashtextextended('expiry-group-request/'||p_request_id::text,0));
 select * into prior from pharmflow_expiry_private.session_group_adjustments_v1 where request_id=p_request_id;
 if found then
  if prior.pharmacy_id<>p_pharmacy_id or prior.session_id<>p_session_id
     or prior.state_id<>p_state_id or prior.created_by<>auth.uid()
     or prior.expected_members is distinct from expected or prior.quantity<>p_quantity then
   raise exception 'Group request payload conflict';
  end if;
  return prior.result;
 end if;
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,true);
 select * into v from public.pharmflow_expiry_current_state_v1 where id=p_state_id and pharmacy_id=p_pharmacy_id;
 if not found then raise exception 'Group inventory unavailable';end if;
 -- Reuse exact canonical lock used by capture and single corrections.
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'/item/'||v.item_code||'/'||v.batch_key||'/'||v.expiry_year||'/'||v.expiry_month,0));
 select * into v from public.pharmflow_expiry_current_state_v1 where id=p_state_id and pharmacy_id=p_pharmacy_id for update;
 -- The session lock serializes same-session new captures/corrections. The
 -- canonical/state locks serialize other sessions' Inventory changes.
 perform c.operation_id from pharmflow_expiry_private.session_captures_v1 c
 join pharmflow_expiry_private.operations o on o.pharmacy_id=c.pharmacy_id and o.operation_id=c.operation_id
 where c.pharmacy_id=p_pharmacy_id and c.session_id=p_session_id and c.quantity>0
   and o.created_by=auth.uid() and o.payload->>'kind'='KNOWN'
   and coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid)=p_state_id
 order by c.operation_id for update of c;
 select jsonb_agg(jsonb_build_object('operation_id',c.operation_id,'revision',c.revision) order by c.operation_id),sum(c.quantity)
 into actual,old_total from pharmflow_expiry_private.session_captures_v1 c
 join pharmflow_expiry_private.operations o on o.pharmacy_id=c.pharmacy_id and o.operation_id=c.operation_id
 where c.pharmacy_id=p_pharmacy_id and c.session_id=p_session_id and c.quantity>0
   and o.created_by=auth.uid() and o.payload->>'kind'='KNOWN'
   and coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid)=p_state_id;
 if actual is null or actual is distinct from expected then raise exception 'Stale group membership; reload Session Activity';end if;
 if v.verified_quantity::bigint-old_total+p_quantity not between 0 and 2147483647 then
  raise exception 'Invalid resulting Inventory quantity';
 end if;
 delta:=p_quantity-old_total;
 -- Reduce serial-free group adjustments first, then original captures.
 -- NEVER increase an original capture quantity or copy its serial to new units.
 -- Calls below execute INSIDE THIS ONE database transaction, never client loops.
 for member in
  select c.*,o.payload from pharmflow_expiry_private.session_captures_v1 c
  join pharmflow_expiry_private.operations o on o.pharmacy_id=c.pharmacy_id and o.operation_id=c.operation_id
  where c.pharmacy_id=p_pharmacy_id and c.session_id=p_session_id and c.quantity>0
    and o.created_by=auth.uid() and o.payload->>'kind'='KNOWN'
    and coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid)=p_state_id
  order by case when exists(select 1 from pharmflow_expiry_private.session_group_adjustments_v1 g
    where g.pharmacy_id=p_pharmacy_id and g.session_id=p_session_id and g.created_by=auth.uid()
      and g.result->>'added_operation_id'=c.operation_id::text) then 0 else 1 end,c.operation_id desc
 loop
  if member.payload->>'source' is distinct from 'PC' then raise exception 'Desktop group required';end if;
  -- Preserve the existing external recount/read-only check even for no-op members.
  if exists(select 1 from public.pharmflow_expiry_events_v1 e
    where e.state_id=p_state_id and e.occurred_at >= (
      select occurred_at from public.pharmflow_expiry_events_v1 where id=coalesce(
        (member.facts->>'effective_event_id')::uuid,
        (select (o.result->>'event_id')::uuid from pharmflow_expiry_private.operations o where o.pharmacy_id=p_pharmacy_id and o.operation_id=member.operation_id)))
    and e.event_type in ('RECOUNT','CLEARED') and not exists(
      select 1 from pharmflow_expiry_private.session_adjustments_v1 a
      where a.event_id=e.id or coalesce(a.result->'event_ids','[]'::jsonb) ? e.id::text)) then
   raise exception 'Inventory recounted; group read only';
  end if;
  new_qty:=case when delta<0 then greatest(0,member.quantity::bigint+delta)::integer else member.quantity end;
  delta:=delta-(new_qty-member.quantity);
  if new_qty<>member.quantity then
   child:=public.correct_pharmflow_expiry_desktop_session_v1(p_pharmacy_id,p_session_id,
     member.operation_id,gen_random_uuid(),member.revision,jsonb_build_object(
       'quantity',new_qty,'batch_no',coalesce(member.facts->>'batch_no',member.payload->>'batch_no'),
       'expiry_month',v.expiry_month,'expiry_year',v.expiry_year));
   results:=results||jsonb_build_array(child);
  end if;
 end loop;
 if delta>0 then
  select device_id into device from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id;
  added_operation:=gen_random_uuid();
  -- Reuse the existing signed-session capture transaction for a new serial-free
  -- quantity contribution. Explicit provenance says this is a group adjustment,
  -- NOT a physical scan. raw_scan is required by the existing PLAIN validator;
  -- it contains only the derived exact identifier, no invented GS1/serial.
  child:=public.save_pharmflow_expiry_desktop_capture_v1(p_pharmacy_id,p_session_id,
    added_operation,jsonb_build_object('kind','KNOWN','source','PC','worker_id',null,
      'device_id',device,'item_code',v.item_code,'item_name',v.item_name,
      'identifier_display',v.identifier_display,'category',v.category,
      'raw_scan',v.identifier_display,'scan_format','PLAIN','sample_serial',null,
      'batch_no',v.batch_no,'expiry_month',v.expiry_month,'expiry_year',v.expiry_year,
      'quantity',delta::integer,'contribution_type','GROUP_QUANTITY_ADJUSTMENT',
      'origin_request_id',p_request_id,'raw_scan_origin','SERVER_DERIVED_IDENTIFIER_NOT_SCANNER'));
  if (child->>'state_id')::uuid is distinct from p_state_id then raise exception 'Adjustment group identity mismatch';end if;
  update pharmflow_expiry_private.session_captures_v1
   set facts=facts||jsonb_build_object('contribution_type','GROUP_QUANTITY_ADJUSTMENT',
       'origin_request_id',p_request_id,'serial_attribution','NONE')
   where pharmacy_id=p_pharmacy_id and operation_id=added_operation and session_id=p_session_id;
  results:=results||jsonb_build_array(child||jsonb_build_object('contribution_type','GROUP_QUANTITY_ADJUSTMENT'));
  delta:=0;
 end if;
 if delta<>0 then raise exception 'Group allocation failed';end if;
 answer:=jsonb_build_object('request_id',p_request_id,'state_id',p_state_id,
   'session_id',p_session_id,'previous_quantity',old_total,'quantity',p_quantity,'adjustments',results,
   'added_operation_id',added_operation,'serial_policy','ORIGINALS_UNCHANGED_ADDITIONS_UNSERIALIZED');
 insert into pharmflow_expiry_private.session_group_adjustments_v1
  (request_id,pharmacy_id,session_id,state_id,created_by,expected_members,previous_quantity,quantity,result)
 values(p_request_id,p_pharmacy_id,p_session_id,p_state_id,auth.uid(),expected,old_total,p_quantity,answer);
 return answer;
end $group$;
revoke all on function public.correct_pharmflow_expiry_desktop_group_v1(uuid,uuid,uuid,uuid,jsonb,integer) from public,anon;
grant execute on function public.correct_pharmflow_expiry_desktop_group_v1(uuid,uuid,uuid,uuid,jsonb,integer) to authenticated;
commit;
-- Rollback of API exposure: REVOKE EXECUTE from authenticated first, then DROP
-- FUNCTION only. Retain new audit table and all correction/event records.
-- Never automatically reverse completed quantities or drop audit evidence.
