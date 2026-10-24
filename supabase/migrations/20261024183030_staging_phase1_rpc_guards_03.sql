CREATE OR REPLACE FUNCTION public.mutate_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_request_id uuid, p_action text, p_selection jsonb, p_quantity integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare payload jsonb:=jsonb_build_object('action',p_action,'selection',p_selection,'quantity',p_quantity);
 prior pharmflow_expiry_private.inventory_requests_v1%rowtype;sel jsonb;viewrow record;s public.pharmflow_expiry_current_state_v1%rowtype;
 resolved pharmflow_expiry_private.resolved_inventory_v1%rowtype;stamp timestamptz;oldqty integer;newqty integer;n integer:=0;result jsonb;lockkey text;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'mutate_pharmflow_expiry_inventory_v1',p_request_id::text);

 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_action='CLEAR_RESOLVED' and not exists (
  select 1 from public.pharmacy_members m join public.pharmacies p on p.id=m.pharmacy_id
  where m.pharmacy_id=p_pharmacy_id and m.user_id=auth.uid() and m.active=true and p.status='active'
 ) then raise exception 'Pharmacy access required';end if;
 if p_request_id is null or p_action is null or p_selection is null or p_action not in ('QUANTITY','RESOLVE','RESTORE','CLEAR_RESOLVED') or jsonb_typeof(p_selection)<>'array' or jsonb_array_length(p_selection)=0 then raise exception 'Explicit selection required';end if;
 if p_action='QUANTITY' and (jsonb_array_length(p_selection)<>1 or p_quantity is null or p_quantity<0) then raise exception 'Nonnegative integer quantity required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-inventory-request/'||p_request_id::text,0));
 select * into prior from pharmflow_expiry_private.inventory_requests_v1 where request_id=p_request_id;
 if found then if prior.pharmacy_id<>p_pharmacy_id or prior.created_by<>auth.uid() or prior.payload is distinct from payload then raise exception 'Request payload conflict';end if;return prior.result;end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_selection) x)<>jsonb_array_length(p_selection) then raise exception 'Duplicate selection';end if;
 -- Acquire the SAME canonical item locks used by captures, in a stable order.
 for lockkey in select distinct p_pharmacy_id::text||'/item/'||r.item_code||'/'||upper(btrim(coalesce(r.batch_no,'')))||'/'||r.expiry_year||'/'||r.expiry_month
 from pharmflow_expiry_private.inventory_rows_v1(p_pharmacy_id,p_action in ('RESTORE','CLEAR_RESOLVED')) r
 where r.row_id in(select (x->>'id')::uuid from jsonb_array_elements(p_selection) x) order by 1
 loop perform pg_advisory_xact_lock(hashtextextended(lockkey,0));end loop;
 for sel in select x from jsonb_array_elements(p_selection) x order by x->>'id' loop
  select * into viewrow from pharmflow_expiry_private.inventory_rows_v1(p_pharmacy_id,p_action in ('RESTORE','CLEAR_RESOLVED')) r where r.row_id=(sel->>'id')::uuid;
  if not found or viewrow.version is distinct from sel->>'version' then raise exception 'Inventory changed; refresh and confirm selection again';end if;
  if p_action='CLEAR_RESOLVED' then
   -- Same canonical advisory locks as Restore/Capture, then a row-level eligibility recheck.
   update pharmflow_expiry_private.resolved_inventory_v1 r
    set cleared_at=clock_timestamp(),cleared_by=auth.uid()
    where r.id=viewrow.row_id and r.pharmacy_id=p_pharmacy_id and r.restored_at is null and r.cleared_at is null;
   if not found then raise exception 'Resolved list changed; refresh and confirm again';end if;
   n:=n+1;
   continue;
  end if;
  select * into s from public.pharmflow_expiry_current_state_v1 where id=viewrow.state_id and pharmacy_id=p_pharmacy_id for update;
  if not found then raise exception 'Inventory state unavailable';end if;
  stamp:=clock_timestamp();oldqty:=s.verified_quantity;
  if p_action='RESOLVE' then
   insert into pharmflow_expiry_private.resolved_inventory_v1(pharmacy_id,state_id,snapshot,quantity,resolved_at,resolved_by) values(p_pharmacy_id,s.id,to_jsonb(s),oldqty,stamp,auth.uid());newqty:=0;
  elsif p_action='RESTORE' then
   select * into resolved from pharmflow_expiry_private.resolved_inventory_v1 where id=viewrow.row_id and pharmacy_id=p_pharmacy_id and restored_at is null and cleared_at is null for update;
   if not found then raise exception 'Resolved row changed';end if;
   if s.item_code is distinct from resolved.snapshot->>'item_code' or s.batch_key is distinct from resolved.snapshot->>'batch_key' or s.expiry_year<>(resolved.snapshot->>'expiry_year')::integer or s.expiry_month<>(resolved.snapshot->>'expiry_month')::integer then raise exception 'Original identity changed; restore blocked';end if;
   newqty:=case when s.status='ACTIVE' then oldqty else 0 end+resolved.quantity;
   update pharmflow_expiry_private.resolved_inventory_v1 set restored_at=stamp,restored_by=auth.uid() where id=resolved.id;
  else newqty:=p_quantity;end if;
  update public.pharmflow_expiry_current_state_v1 set verified_quantity=newqty,status=case when p_action='RESOLVE' then 'CLEARED' else 'ACTIVE' end,
   verified_by_user_id=auth.uid(),last_verified_at=stamp,updated_at=stamp where id=s.id;
  insert into public.pharmflow_expiry_events_v1(state_id,pharmacy_id,event_type,item_code,item_name,identifier_display,identifier_key,category,batch_no,sample_serial,expiry_month,expiry_year,previous_quantity,verified_quantity,worker_id,verified_by_name,verified_by_user_id,device_id,source,occurred_at)
  values(s.id,p_pharmacy_id,case when p_action='RESOLVE' then 'CLEARED' else 'RECOUNT' end,s.item_code,s.item_name,s.identifier_display,s.identifier_key,s.category,s.batch_no,s.sample_serial,s.expiry_month,s.expiry_year,oldqty,newqty,s.worker_id,s.verified_by_name,auth.uid(),s.device_id,'PC',stamp);
  n:=n+1;
 end loop;
 result:=jsonb_build_object('request_id',p_request_id,'count',n,'action',p_action);
 insert into pharmflow_expiry_private.inventory_requests_v1 values(p_request_id,p_pharmacy_id,auth.uid(),payload,result,clock_timestamp());
 return result;
end $function$;

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
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'correct_pharmflow_expiry_session_v2',p_operation_id::text);

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
 update pharmflow_expiry_private.session_captures_v1 set quantity=qty,revision=revision+1,facts=jsonb_build_object('gs1_source_locks',pharmflow_expiry_private.gs1_source_locks(o.payload,c.facts),'batch_no',batch,'expiry_month',mo,'expiry_year',yr,'effective_state_id',oldid,'effective_event_id',anchor,'correction_source','OPERATOR_CORRECTION') where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.save_pharmflow_expiry_session_capture_v2(p_pharmacy_id uuid, p_session_id uuid, p_operation_id uuid, p_capture jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare r jsonb;s pharmflow_expiry_private.active_sessions_v1%rowtype;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmflow_expiry_session_capture_v2',p_operation_id::text);

 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,false);
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id;
 -- The original per-device validation is retained. Other devices sign in with their own signed auth session.
 r:=public.save_pharmflow_expiry_session_capture_v1(p_pharmacy_id,p_session_id,p_operation_id,p_capture);
 return r||jsonb_build_object('confirmed_capture',p_capture,'pharmacy_id',p_pharmacy_id);
end $function$;

CREATE OR REPLACE FUNCTION public.list_pharmflow_expiry_reviews_v1(p_pharmacy_id uuid, p_status text DEFAULT 'PENDING'::text, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare v_status text:=upper(btrim(coalesce(p_status,'PENDING')));v_limit integer:=least(greatest(coalesce(p_limit,250),1),500);v_offset integer:=greatest(coalesce(p_offset,0),0);
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmflow_expiry_reviews_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if v_status not in ('PENDING','RESOLVED','ALL') then raise exception 'Invalid Expiry review status';end if;
 return query select o.payload||coalesce((select c.facts from pharmflow_expiry_private.session_captures_v1 c where c.pharmacy_id=o.pharmacy_id and c.operation_id=o.operation_id),'{}'::jsonb)||jsonb_build_object('original_quantity',o.payload->'quantity','quantity',coalesce((select c.quantity from pharmflow_expiry_private.session_captures_v1 c where c.pharmacy_id=o.pharmacy_id and c.operation_id=o.operation_id),(o.payload->>'quantity')::integer))||jsonb_build_object('review_id',r.id,'pharmacy_id',r.pharmacy_id,'identifier_key',r.identifier_key,'status',r.status,'created_by',r.created_by,'created_at',r.created_at,'review_reason',r.review_reason,'resolved_by',r.resolved_by,'resolved_item_code',r.resolved_item_code,'resolved_item_name',r.resolved_item_name,'resolved_at',r.resolved_at,'resolution_transaction_id',r.resolution_transaction_id,'worker_name',d.worker_name,'product_photo_path',d.product_photo_path,'expiry_photo_path',d.expiry_photo_path,'evidence_photo_path',coalesce(d.product_photo_path,d.expiry_photo_path),'evidence_photo_deleted',coalesce(p.deleted_at,e.deleted_at) is not null)
 from public.pharmflow_needs_review_v2 r join pharmflow_expiry_private.review_details d on d.review_id=r.id and d.pharmacy_id=r.pharmacy_id join pharmflow_expiry_private.operations o on o.pharmacy_id=d.pharmacy_id and o.operation_id=d.operation_id left join pharmflow_expiry_private.photos p on p.path=d.product_photo_path left join pharmflow_expiry_private.photos e on e.path=d.expiry_photo_path
 where r.pharmacy_id=p_pharmacy_id and r.workflow='EXPIRY' and (v_status='ALL' or r.status=v_status)
 order by r.created_at desc,r.id desc limit v_limit offset v_offset;
end $function$;

CREATE OR REPLACE FUNCTION public.list_pharmflow_expiry_session_v2(p_pharmacy_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare r jsonb;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmflow_expiry_session_v2',NULL);

 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id);
 select coalesce(jsonb_agg(x.receipt order by x.captured_at desc,x.operation_id desc),'[]'::jsonb) into r from (
  select coalesce(e.occurred_at,n.created_at,o.created_at) captured_at,o.operation_id,o.payload||c.facts||jsonb_build_object('gs1_source_locks',pharmflow_expiry_private.gs1_source_locks(o.payload,c.facts),'operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,'acknowledgement',o.result,'quantity',c.quantity,'revision',c.revision,'captured_at',coalesce(e.occurred_at,n.created_at,o.created_at),'status',case when c.quantity=0 then 'DELETED' when o.payload->>'kind'='UNKNOWN' then n.status else 'SAVED' end,'editable',c.quantity>0 and (o.payload->>'kind'='KNOWN' or n.status='PENDING')) receipt
  from pharmflow_expiry_private.session_captures_v1 c join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id)
  left join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>'event_id')::uuid and e.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_needs_review_v2 n on n.id=(o.result->>'review_id')::uuid and n.pharmacy_id=o.pharmacy_id
  where c.session_id=p_session_id and c.quantity>0 and n.status is distinct from 'DELETED' order by coalesce(e.occurred_at,n.created_at,o.created_at) desc,o.operation_id desc limit 10
 ) x;return r;
end $function$;

CREATE OR REPLACE FUNCTION public.summary_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare cur integer:=(extract(year from timezone('Asia/Riyadh',now()))::integer*12+extract(month from timezone('Asia/Riyadh',now()))::integer);result jsonb;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'summary_pharmflow_expiry_inventory_v1',NULL);

 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select jsonb_agg(jsonb_build_object('key',p.key,'from',p.lo,'to',p.hi,'count',q.n,'units',q.units)) into result
 from (values('EXPIRED',null::integer,cur),('NEXT1',cur+1,cur+1),('NEXT2',cur+1,cur+2),('NEXT6',cur+1,cur+6)) p(key,lo,hi)
 cross join lateral(select count(*) n,coalesce(sum(s.verified_quantity),0) units from public.pharmflow_expiry_current_state_v1 s
 where s.pharmacy_id=p_pharmacy_id and s.status='ACTIVE' and (p.lo is null or s.expiry_year*12+s.expiry_month>=p.lo) and s.expiry_year*12+s.expiry_month<=p.hi) q;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.correct_pharmflow_expiry_desktop_session_v1(p_pharmacy_id uuid, p_session_id uuid, p_operation_id uuid, p_request_id uuid, p_expected_revision integer, p_correction jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare c pharmflow_expiry_private.session_captures_v1%rowtype;o pharmflow_expiry_private.operations%rowtype;
 a pharmflow_expiry_private.session_adjustments_v1%rowtype;v public.pharmflow_expiry_current_state_v1%rowtype;
 qty integer;mo integer;yr integer;batch text;oldid uuid;anchor uuid;keyold text;keynew text;lockkey text;total integer;ack record;target record;result jsonb;events jsonb:='[]'::jsonb;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'correct_pharmflow_expiry_desktop_session_v1',p_operation_id::text);

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
 if o.payload->>'source' is distinct from 'PC' then raise exception 'Desktop operation required';end if;
 if o.created_by<>auth.uid() then raise exception 'Operation scope mismatch';end if;
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
  keynew:=p_pharmacy_id::text||'/item/'||v.item_code||'/'||upper(coalesce(batch,''))||'/'||yr||'/'||mo;
  for lockkey in select distinct k from unnest(array[keyold,keynew]) k order by k loop perform pg_advisory_xact_lock(hashtextextended(lockkey,0));end loop;
  select * into v from public.pharmflow_expiry_current_state_v1 where id=oldid for update;
  if exists(select 1 from public.pharmflow_expiry_events_v1 x where x.state_id=oldid and x.occurred_at>=(select occurred_at from public.pharmflow_expiry_events_v1 where id=anchor) and x.event_type in ('RECOUNT','CLEARED') and not exists(select 1 from pharmflow_expiry_private.session_adjustments_v1 y where y.event_id=x.id or coalesce(y.result->'event_ids','[]'::jsonb) ? x.id::text)) then raise exception 'Inventory recounted; operation is read only';end if;
  total:=v.verified_quantity-c.quantity+case when keyold=keynew then qty else 0 end;
  if total<0 then raise exception 'Correction would make inventory negative';end if;
  select * into ack from pharmflow_expiry_private.save_known_core(p_pharmacy_id,v.item_code,v.item_name,v.identifier_display,v.category,total,v.expiry_month,v.expiry_year,(o.payload->>'worker_id')::uuid,v.batch_no,v.sample_serial,o.payload->>'device_id','PC',case when total=0 then 'CLEARED' else 'RECOUNT' end);
  events:=events||jsonb_build_array(ack.event_id::text);
  if keyold<>keynew and qty>0 then
   select * into target from pharmflow_expiry_private.save_known_core(p_pharmacy_id,o.payload->>'item_code',o.payload->>'item_name',o.payload->>'identifier_display',o.payload->>'category',qty,mo,yr,(o.payload->>'worker_id')::uuid,batch,o.payload->>'sample_serial',o.payload->>'device_id','PC','CAPTURE');
   oldid:=target.state_id;anchor:=target.event_id;events:=events||jsonb_build_array(target.event_id::text);
  else anchor:=ack.event_id;end if;
 end if;
 result:=jsonb_build_object('operation_id',p_operation_id,'request_id',p_request_id,'quantity',qty,'revision',c.revision+1,'correction',p_correction,'event_ids',events,'state_id',oldid);
 insert into pharmflow_expiry_private.session_adjustments_v1(request_id,session_id,operation_id,created_by,previous_quantity,quantity,expected_revision,result,event_id) values(p_request_id,p_session_id,p_operation_id,auth.uid(),c.quantity,qty,p_expected_revision,result,anchor);
 update pharmflow_expiry_private.session_captures_v1 set quantity=qty,revision=revision+1,facts=jsonb_build_object('batch_no',batch,'expiry_month',mo,'expiry_year',yr,'effective_state_id',oldid,'effective_event_id',anchor,'correction_source','OPERATOR_CORRECTION') where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.list_pharmflow_expiry_desktop_session_v1(p_pharmacy_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare r jsonb;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmflow_expiry_desktop_session_v1',NULL);

 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id);
 select coalesce(jsonb_agg(x.receipt order by x.captured_at desc,x.operation_id desc),'[]'::jsonb) into r from (
  select coalesce(e.occurred_at,n.created_at,o.created_at) captured_at,o.operation_id,o.payload||c.facts||jsonb_build_object('group_name',(select public.pharmflow_normalize_main_group_v1(g.group_name) from public.pharmflow_global_items_v2 g where g.item_code=coalesce(c.facts->>'item_code',o.payload->>'item_code')),'worker_name',coalesce(e.verified_by_name,'Desktop'),'operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,'acknowledgement',o.result,'quantity',c.quantity,'revision',c.revision,'captured_at',coalesce(e.occurred_at,n.created_at,o.created_at),'status',case when c.quantity=0 then 'DELETED' when o.payload->>'kind'='UNKNOWN' then n.status else 'SAVED' end,'editable',c.quantity>0 and (o.payload->>'kind'='KNOWN' or n.status='PENDING') and
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
end $function$;

CREATE OR REPLACE FUNCTION public.save_pharmflow_expiry_desktop_capture_v1(p_pharmacy_id uuid, p_session_id uuid, p_operation_id uuid, p_capture jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare s pharmflow_expiry_private.active_sessions_v1%rowtype;r jsonb;c pharmflow_expiry_private.session_captures_v1%rowtype;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmflow_expiry_desktop_capture_v1',p_operation_id::text);

 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,false);
 if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id for update;
 if not found or s.pharmacy_id<>p_pharmacy_id or s.created_by<>auth.uid() or s.device_id is distinct from p_capture->>'device_id' then raise exception 'Session scope mismatch';end if;
 select * into c from pharmflow_expiry_private.session_captures_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if found then
  if c.session_id<>p_session_id then raise exception 'Operation belongs to another session';end if;
  -- Read-only acknowledgement retry remains possible after closure.
  return public.save_pharmflow_expiry_capture_v3(p_pharmacy_id,p_operation_id,p_capture);
 end if;
 if s.closed_at is not null then raise exception 'Session closed';end if;
 if p_capture->>'source' is distinct from 'PC' then raise exception 'Desktop capture required';end if;
 perform public.reserve_pharmflow_expiry_capture_v1(p_pharmacy_id,p_operation_id);
 perform 1 from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and status='COMMITTED';
 if found then raise exception 'Historical operation cannot join a session';end if;
 r:=public.save_pharmflow_expiry_capture_v3(p_pharmacy_id,p_operation_id,p_capture);
 insert into pharmflow_expiry_private.session_captures_v1(pharmacy_id,operation_id,session_id,quantity)
 values(p_pharmacy_id,p_operation_id,p_session_id,(p_capture->>'quantity')::integer);
 return r;
end $function$;

CREATE OR REPLACE FUNCTION public.correct_pharmflow_expiry_desktop_group_v1(p_pharmacy_id uuid, p_session_id uuid, p_state_id uuid, p_request_id uuid, p_expected_members jsonb, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 prior pharmflow_expiry_private.session_group_adjustments_v1%rowtype;
 v public.pharmflow_expiry_current_state_v1%rowtype;
 member record;
 expected jsonb;actual jsonb;results jsonb:='[]'::jsonb;
 old_total bigint;delta bigint;new_qty integer;child jsonb;answer jsonb;
 added_operation uuid;device text;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'correct_pharmflow_expiry_desktop_group_v1',p_request_id::text);

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
end $function$;

CREATE OR REPLACE FUNCTION public.clear_pharmflow_expiry_desktop_session_v1(p_pharmacy_id uuid, p_session_id uuid, p_request_id uuid, p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare sid uuid:=pharmflow_expiry_private.valid_auth_session();s pharmflow_expiry_private.active_sessions_v1%rowtype;
 a pharmflow_expiry_private.session_clear_requests_v1%rowtype; nextid uuid; result jsonb;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'clear_pharmflow_expiry_desktop_session_v1',p_request_id::text);

 if public.is_pharmacy_member(p_pharmacy_id) is not true or p_request_id is null or p_session_id is null or nullif(btrim(p_device_id),'') is null then raise exception 'Clear scope and request required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth-lifecycle/'||auth.uid()::text||'/'||sid::text,0));
 perform pharmflow_expiry_private.valid_auth_session();
 if exists(select 1 from pharmflow_expiry_private.closed_auth_sessions_v1 where created_by=auth.uid() and auth_session_id=sid) then raise exception 'Session closed; Sign In required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth/'||p_pharmacy_id::text||'/'||sid::text,0));
 -- Validate signed scope before returning any retained receipt.
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,false);
 select * into a from pharmflow_expiry_private.session_clear_requests_v1 where request_id=p_request_id;
 if found then
  if a.pharmacy_id<>p_pharmacy_id or a.created_by<>auth.uid() or a.auth_session_id<>sid or a.previous_session_id<>p_session_id or a.device_id<>p_device_id then raise exception 'Clear payload conflict';end if;
  return a.result;
 end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id for update;
 if s.device_id is distinct from p_device_id then raise exception 'Session device mismatch';end if;
 if s.closed_at is not null then raise exception 'Stale session; reload before clearing';end if;
 nextid:=gen_random_uuid();
 update pharmflow_expiry_private.active_sessions_v1 set closed_at=clock_timestamp() where id=s.id;
 insert into pharmflow_expiry_private.active_sessions_v1(id,pharmacy_id,created_by,device_id,auth_session_id)
 values(nextid,p_pharmacy_id,auth.uid(),s.device_id,sid);
 result:=jsonb_build_object('status','CLEARED','request_id',p_request_id,'previous_session_id',s.id,'session_id',nextid,'auth_session_id',sid);
 insert into pharmflow_expiry_private.session_clear_requests_v1(request_id,pharmacy_id,created_by,auth_session_id,previous_session_id,next_session_id,device_id,result)
 values(p_request_id,p_pharmacy_id,auth.uid(),sid,s.id,nextid,p_device_id,result);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_expiry_auth_session_v1(p_pharmacy_id uuid, p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare sid uuid:=pharmflow_expiry_private.valid_auth_session();s pharmflow_expiry_private.active_sessions_v1%rowtype;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'get_pharmflow_expiry_auth_session_v1',NULL);

 if public.is_pharmacy_member(p_pharmacy_id) is not true or nullif(btrim(p_device_id),'') is null then raise exception 'Pharmacy and device required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth-lifecycle/'||auth.uid()::text||'/'||sid::text,0));
 perform pharmflow_expiry_private.valid_auth_session();
 if exists(select 1 from pharmflow_expiry_private.closed_auth_sessions_v1 where created_by=auth.uid() and auth_session_id=sid) then raise exception 'Session closed; Sign In required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth/'||p_pharmacy_id::text||'/'||sid::text,0));
 select * into s from pharmflow_expiry_private.active_sessions_v1 where pharmacy_id=p_pharmacy_id and created_by=auth.uid() and auth_session_id=sid and closed_at is null;
 if not found then
  if exists(select 1 from pharmflow_expiry_private.active_sessions_v1 where pharmacy_id=p_pharmacy_id and created_by=auth.uid() and auth_session_id=sid) then raise exception 'Session closed; Sign In required';end if;
  insert into pharmflow_expiry_private.active_sessions_v1(id,pharmacy_id,created_by,device_id,auth_session_id,created_at)
  values(gen_random_uuid(),p_pharmacy_id,auth.uid(),p_device_id,sid,coalesce((select created_at from auth.sessions where id=sid),clock_timestamp())) returning * into s;
 end if;
 return jsonb_build_object('session_id',s.id,'auth_session_id',sid,'status','OPEN');
end $function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_master_cache_page_v2(p_offset integer DEFAULT 0, p_limit integer DEFAULT 1000)
 RETURNS TABLE(item_code text, gtin text, item_name text, group_name text, category text, sub_category text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'get_pharmflow_master_cache_page_v2',NULL);

 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required';END IF;
 RETURN QUERY SELECT g.item_code,i.identifier_display,g.item_name,g.group_name,g.category,g.sub_category
 FROM public.pharmflow_global_item_identifiers_v2 i JOIN public.pharmflow_global_items_v2 g ON g.item_code=i.item_code
 WHERE i.identifier_display ~ '^[0-9]+$' ORDER BY i.identifier_key,i.id
 OFFSET greatest(coalesce(p_offset,0),0) LIMIT least(greatest(coalesce(p_limit,1000),1),2000);
END $function$;

CREATE OR REPLACE FUNCTION public.count_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_workflow text DEFAULT 'RECEIVING'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare n bigint;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),false,'count_pharmflow_needs_review_v2',NULL);

  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  select count(*) into n from public.pharmflow_needs_review_v2 r
   where r.pharmacy_id=p_pharmacy_id and r.status='PENDING'
     and r.workflow=upper(btrim(coalesce(p_workflow,'RECEIVING')));
  return n;
end
$function$;

CREATE OR REPLACE FUNCTION public.select_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_filters jsonb, p_resolved boolean, p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare result jsonb; filters jsonb:=coalesce(p_filters,'{}'::jsonb);
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'select_pharmflow_expiry_inventory_v1',NULL);

  perform pharmflow_expiry_private.valid_auth_session();
  if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required'; end if;
  if p_filters is null or p_resolved is null or jsonb_typeof(filters)<>'object'
     or (filters ? 'groups' and jsonb_typeof(filters->'groups')<>'array')
     or (filters ? 'departments' and jsonb_typeof(filters->'departments')<>'array')
     or (filters ? 'operators' and (jsonb_typeof(filters->'operators')<>'array' or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(filters->'operators')='array' then filters->'operators' else '[]'::jsonb end) v where jsonb_typeof(v)<>'string')))
     or (filters ? 'months' and jsonb_typeof(filters->'months')<>'array')
     or (filters ? 'include_unassigned' and jsonb_typeof(filters->'include_unassigned')<>'boolean') then
    raise exception 'Invalid inventory query';
  end if;
  select jsonb_build_object('count',count(*),'units',coalesce(sum(r.quantity),0),
    'selection',coalesce(jsonb_agg(jsonb_build_object('id',r.row_id,'version',r.version) order by r.row_id),'[]'::jsonb))
  into result
  from pharmflow_expiry_private.inventory_rows_group_v1(p_pharmacy_id,p_resolved) r
  where pharmflow_expiry_private.inventory_match_v1(case when coalesce(jsonb_array_length(filters->'operators'),0)>0 then pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(r)) else to_jsonb(r) end,filters)
    and (p_ids is null or r.row_id=any(p_ids));
  return result;
end
$function$;

CREATE OR REPLACE FUNCTION public.list_pharmflow_needs_review_history_v3(p_pharmacy_id uuid, p_workflow text DEFAULT 'RECEIVING'::text, p_order_number text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, workflow text, session_id text, order_number text, order_name text, gtin text, raw_barcode text, pending_quantity integer, review_reason text, master_item_code_hint text, master_item_name_hint text, photo_path text, source text, device_id text, status text, resolved_item_code text, resolved_item_name text, resolution_type text, resolution_transaction_id text, created_at timestamp with time zone, updated_at timestamp with time zone, resolved_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),false,'list_pharmflow_needs_review_history_v3',NULL);

  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  return query select r.id,r.workflow,coalesce(r.session_id,''),coalesce(r.order_number,''),coalesce(r.order_name,''),
    r.gtin,coalesce(r.raw_barcode,''),r.pending_quantity,r.review_reason,coalesce(r.master_item_code_hint,''),
    coalesce(r.master_item_name_hint,''),coalesce(r.photo_path,''),r.source,coalesce(r.device_id,''),r.status,
    coalesce(r.resolved_item_code,''),coalesce(r.resolved_item_name,''),coalesce(r.resolution_type,''),
    coalesce(r.resolution_transaction_id,''),r.created_at,r.updated_at,r.resolved_at
  from public.pharmflow_needs_review_v2 r
  where r.pharmacy_id=p_pharmacy_id and r.workflow=upper(btrim(coalesce(p_workflow,'RECEIVING')))
    and (nullif(btrim(coalesce(p_order_number,'')),'') is null or coalesce(r.order_number,'')=btrim(p_order_number))
  order by r.updated_at desc,r.created_at desc;
end
$function$;

