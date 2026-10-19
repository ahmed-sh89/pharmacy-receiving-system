CREATE OR REPLACE FUNCTION public.correct_pharmflow_expiry_session_v2(p_pharmacy_id uuid, p_session_id uuid, p_operation_id uuid, p_request_id uuid, p_expected_revision integer, p_correction jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare c pharmflow_expiry_private.session_captures_v1%rowtype;o pharmflow_expiry_private.operations%rowtype;
 a pharmflow_expiry_private.session_adjustments_v1%rowtype;v public.pharmflow_expiry_current_state_v1%rowtype;
 qty integer;mo integer;yr integer;batch text;oldid uuid;anchor uuid;keyold text;keynew text;lockkey text;total integer;ack record;target record;result jsonb;events jsonb:='[]'::jsonb;
begin
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,false);
 if p_request_id is null or p_expected_revision is null or jsonb_typeof(p_correction)<>'object' or not(p_correction ?& array['quantity','batch_no','expiry_month','expiry_year']) or (select count(*) from jsonb_object_keys(p_correction))<>4 then raise exception 'Complete correction required';end if;
 select * into a from pharmflow_expiry_private.session_adjustments_v1 where request_id=p_request_id;
 if found then
  if a.session_id<>p_session_id or a.operation_id<>p_operation_id or a.created_by<>auth.uid() or a.expected_revision<>p_expected_revision or a.result->'correction' is distinct from p_correction then raise exception 'Correction payload conflict';end if;return a.result;
 end if;
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,true);
 if jsonb_typeof(p_correction->'quantity')<>'number' or (p_correction->>'quantity') !~ '^[0-9]+$' or jsonb_typeof(p_correction->'expiry_month')<>'number' or jsonb_typeof(p_correction->'expiry_year')<>'number' or jsonb_typeof(p_correction->'batch_no') not in ('string','null') then raise exception 'Invalid correction values';end if;
 qty:=(p_correction->>'quantity')::integer;mo:=(p_correction->>'expiry_month')::integer;yr:=(p_correction->>'expiry_year')::integer;batch:=nullif(btrim(p_correction->>'batch_no'),'');
 if mo not between 1 and 12 or yr not between 2020 and 2200 then raise exception 'Invalid corrected batch or expiry';end if;
 select * into c from pharmflow_expiry_private.session_captures_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and session_id=p_session_id for update;
 if not found or c.quantity=0 then raise exception 'Operation not editable';end if;
 if c.revision<>p_expected_revision then raise exception 'Stale revision; reload History';end if;
 select * into o from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if o.created_by<>auth.uid() then raise exception 'Operation scope mismatch';end if;
 if (pharmflow_expiry_private.gs1_source_locks(o.payload,c.facts)->>'batch')::boolean and (p_correction->>'batch_no') is not distinct from (o.payload->>'batch_no') then batch:=nullif(o.payload->>'batch_no','');end if;
 if qty>0 then
  if (pharmflow_expiry_private.gs1_source_locks(o.payload,c.facts)->>'batch')::boolean and coalesce(batch,'') is distinct from coalesce(o.payload->>'batch_no','') then raise exception 'Batch captured from GS1 is read only';end if;
  if (pharmflow_expiry_private.gs1_source_locks(o.payload,c.facts)->>'expiry')::boolean and (mo<>(o.payload->>'expiry_month')::integer or yr<>(o.payload->>'expiry_year')::integer) then raise exception 'Expiry captured from GS1 is read only';end if;
 end if;
 if batch is distinct from coalesce(c.facts->>'batch_no',o.payload->>'batch_no') and pharmflow_expiry_private.batch_is_scanner_payload(batch) then raise exception 'Use Scan Barcode, not Batch';end if;
 if batch is distinct from coalesce(c.facts->>'batch_no',o.payload->>'batch_no') and (length(coalesce(batch,''))>case when o.payload->>'scan_format'='GS1' then 20 else 128 end or coalesce(batch,'')~'[[:cntrl:]]') then raise exception 'Invalid corrected batch';end if;
 if o.payload->>'kind'='UNKNOWN' then
  perform 1 from public.pharmflow_needs_review_v2 where id=(o.result->>'review_id')::uuid and pharmacy_id=p_pharmacy_id and status='PENDING' for update;
  if not found then raise exception 'Only pending review operations are editable';end if;
  if qty=0 then perform public.delete_pharmflow_expiry_review_v1(p_pharmacy_id,(o.result->>'review_id')::uuid);end if;
 else
  oldid:=coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid);anchor:=coalesce((c.facts->>'effective_event_id')::uuid,(o.result->>'event_id')::uuid);
  select * into v from public.pharmflow_expiry_current_state_v1 where id=oldid and pharmacy_id=p_pharmacy_id;
  if not found then raise exception 'Inventory unavailable';end if;
  keyold:=p_pharmacy_id::text||'/item/'||v.item_code||'/'||v.batch_key||'/'||v.expiry_year||'/'||v.expiry_month;
  keynew:=p_pharmacy_id::text||'/item/'||v.item_code||'/'||upper(btrim(coalesce(batch,'')))||'/'||yr||'/'||mo;
  for lockkey in select distinct k from unnest(array[keyold,keynew]) k order by k loop perform pg_advisory_xact_lock(hashtextextended(lockkey,0));end loop;
  select * into v from public.pharmflow_expiry_current_state_v1 where id=oldid for update;
  if exists(select 1 from public.pharmflow_expiry_events_v1 x where x.state_id=oldid and x.occurred_at>=(select occurred_at from public.pharmflow_expiry_events_v1 where id=anchor) and x.event_type in ('RECOUNT','CLEARED') and not exists(select 1 from pharmflow_expiry_private.session_adjustments_v1 y where y.event_id=x.id or coalesce(y.result->'event_ids','[]'::jsonb) ? x.id::text)) then raise exception 'Inventory recounted; operation is read only';end if;
  total:=v.verified_quantity-c.quantity+case when keyold=keynew then qty else 0 end;
  if total<0 then raise exception 'Correction would make inventory negative';end if;
  select * into ack from pharmflow_expiry_private.save_known_core(p_pharmacy_id,v.item_code,v.item_name,v.identifier_display,v.category,total,v.expiry_month,v.expiry_year,(o.payload->>'worker_id')::uuid,v.batch_no,v.sample_serial,o.payload->>'device_id','HANDHELD',case when total=0 then 'CLEARED' else 'RECOUNT' end);
  events:=events||jsonb_build_array(ack.event_id::text);
  if keyold<>keynew and qty>0 then
   select * into target from pharmflow_expiry_private.save_known_core(p_pharmacy_id,o.payload->>'item_code',o.payload->>'item_name',o.payload->>'identifier_display',o.payload->>'category',qty,mo,yr,(o.payload->>'worker_id')::uuid,batch,o.payload->>'sample_serial',o.payload->>'device_id','HANDHELD','CAPTURE');

   insert into pharmflow_expiry_private.first_operator_v1(state_id,pharmacy_id,event_id,worker_id,operator_name,occurred_at)
   select target.state_id,f.pharmacy_id,f.event_id,f.worker_id,f.operator_name,f.occurred_at from pharmflow_expiry_private.first_operator_v1 f where f.state_id=oldid and f.pharmacy_id=p_pharmacy_id
   on conflict(state_id) do update set event_id=excluded.event_id,worker_id=excluded.worker_id,operator_name=excluded.operator_name,occurred_at=excluded.occurred_at
   where (excluded.occurred_at,excluded.event_id)<(first_operator_v1.occurred_at,first_operator_v1.event_id);
   oldid:=target.state_id;anchor:=target.event_id;events:=events||jsonb_build_array(target.event_id::text);
  else anchor:=ack.event_id;end if;
 end if;
 result:=jsonb_build_object('operation_id',p_operation_id,'request_id',p_request_id,'quantity',qty,'revision',c.revision+1,'correction',p_correction,'event_ids',events,'state_id',oldid);
 insert into pharmflow_expiry_private.session_adjustments_v1(request_id,session_id,operation_id,created_by,previous_quantity,quantity,expected_revision,result,event_id) values(p_request_id,p_session_id,p_operation_id,auth.uid(),c.quantity,qty,p_expected_revision,result,anchor);
 update pharmflow_expiry_private.session_captures_v1 set quantity=qty,revision=revision+1,facts=jsonb_build_object('batch_no',batch,'expiry_month',mo,'expiry_year',yr,'effective_state_id',oldid,'effective_event_id',anchor,'correction_source','OPERATOR_CORRECTION') where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 return result;
end $function$

;
