-- Additive only. Original captures/evidence are immutable; no historical backfill.
begin;
do $$ begin
if md5(pg_get_functiondef('public.list_pharmflow_expiry_reviews_v1(uuid,text,integer,integer)'::regprocedure))<>'3af86756401a9efa079f9d3dc06e5a36' or md5(pg_get_functiondef('public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)'::regprocedure))<>'27c7183de79d20a33cf88a42798f2310' then raise exception 'Staging review definitions changed; stop';end if;
if to_regclass('pharmflow_expiry_private.active_sessions_v1') is not null then raise exception 'Session migration already present; stop';end if;
end $$;
lock table pharmflow_expiry_private.operations,pharmflow_expiry_private.photos,pharmflow_expiry_private.review_details,public.pharmflow_expiry_events_v1,public.pharmflow_expiry_current_state_v1,public.pharmflow_needs_review_v2,storage.objects in share mode;
create temporary table expiry_session_schema_guard on commit drop as
select 'pharmflow_expiry_private.operations' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from pharmflow_expiry_private.operations t
union all
select 'pharmflow_expiry_private.photos' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from pharmflow_expiry_private.photos t
union all
select 'pharmflow_expiry_private.review_details' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from pharmflow_expiry_private.review_details t
union all
select 'public.pharmflow_expiry_events_v1' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from public.pharmflow_expiry_events_v1 t
union all
select 'public.pharmflow_expiry_current_state_v1' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from public.pharmflow_expiry_current_state_v1 t
union all
select 'public.pharmflow_needs_review_v2' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from public.pharmflow_needs_review_v2 t
union all
select 'storage.objects' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from storage.objects t;
create table pharmflow_expiry_private.active_sessions_v1 (
 id uuid primary key, pharmacy_id uuid not null references public.pharmacies(id),
 created_by uuid not null references auth.users(id), device_id text not null,
 created_at timestamptz not null default clock_timestamp(), closed_at timestamptz
);
create table pharmflow_expiry_private.session_captures_v1 (
 pharmacy_id uuid not null, operation_id uuid not null, session_id uuid not null references pharmflow_expiry_private.active_sessions_v1(id),
 quantity integer not null check(quantity>=0), revision integer not null default 0,
 primary key(pharmacy_id,operation_id),
 foreign key(pharmacy_id,operation_id) references pharmflow_expiry_private.operations(pharmacy_id,operation_id)
);
create index on pharmflow_expiry_private.session_captures_v1(session_id);
create table pharmflow_expiry_private.session_adjustments_v1 (
 request_id uuid primary key, session_id uuid not null references pharmflow_expiry_private.active_sessions_v1(id),
 operation_id uuid not null, created_by uuid not null, previous_quantity integer not null,
 quantity integer not null, expected_revision integer not null, result jsonb not null,
 event_id uuid references public.pharmflow_expiry_events_v1(id), created_at timestamptz not null default clock_timestamp()
);
alter table pharmflow_expiry_private.active_sessions_v1 enable row level security;
alter table pharmflow_expiry_private.session_captures_v1 enable row level security;
alter table pharmflow_expiry_private.session_adjustments_v1 enable row level security;
revoke all on pharmflow_expiry_private.active_sessions_v1,pharmflow_expiry_private.session_captures_v1,pharmflow_expiry_private.session_adjustments_v1 from public,anon,authenticated;

create function public.open_pharmflow_expiry_session_v1(p_pharmacy_id uuid,p_session_id uuid,p_device_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare s pharmflow_expiry_private.active_sessions_v1%rowtype;
begin
 if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_session_id is null or nullif(btrim(p_device_id),'') is null then raise exception 'Session and device required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-session/'||p_pharmacy_id::text||'/'||auth.uid()::text||'/'||p_device_id,0));
 if not exists(select 1 from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id) then
  update pharmflow_expiry_private.active_sessions_v1 set closed_at=clock_timestamp() where pharmacy_id=p_pharmacy_id and created_by=auth.uid() and device_id=p_device_id and closed_at is null;
  insert into pharmflow_expiry_private.active_sessions_v1(id,pharmacy_id,created_by,device_id) values(p_session_id,p_pharmacy_id,auth.uid(),p_device_id);
 end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id for update;
 if s.pharmacy_id<>p_pharmacy_id or s.created_by<>auth.uid() or s.device_id<>p_device_id then raise exception 'Session scope mismatch';end if;
 if s.closed_at is not null then raise exception 'Session closed';end if;
 return jsonb_build_object('session_id',s.id,'status','OPEN');
end $$;
create function public.close_pharmflow_expiry_session_v1(p_pharmacy_id uuid,p_session_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 perform 1 from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id and pharmacy_id=p_pharmacy_id and created_by=auth.uid() for update;
 if not found then raise exception 'Session scope mismatch';end if;
 update pharmflow_expiry_private.active_sessions_v1 set closed_at=coalesce(closed_at,clock_timestamp()) where id=p_session_id;
 return jsonb_build_object('session_id',p_session_id,'status','CLOSED');
end $$;
create function public.save_pharmflow_expiry_session_capture_v1(p_pharmacy_id uuid,p_session_id uuid,p_operation_id uuid,p_capture jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare s pharmflow_expiry_private.active_sessions_v1%rowtype;r jsonb;c pharmflow_expiry_private.session_captures_v1%rowtype;
begin
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
 if p_capture->>'source' is distinct from 'HANDHELD' then raise exception 'Handheld capture required';end if;
 perform public.reserve_pharmflow_expiry_capture_v1(p_pharmacy_id,p_operation_id);
 perform 1 from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and status='COMMITTED';
 if found then raise exception 'Historical operation cannot join a session';end if;
 r:=public.save_pharmflow_expiry_capture_v3(p_pharmacy_id,p_operation_id,p_capture);
 insert into pharmflow_expiry_private.session_captures_v1(pharmacy_id,operation_id,session_id,quantity)
 values(p_pharmacy_id,p_operation_id,p_session_id,(p_capture->>'quantity')::integer);
 return r;
end $$;
create function public.list_pharmflow_expiry_session_v1(p_pharmacy_id uuid,p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare s pharmflow_expiry_private.active_sessions_v1%rowtype;r jsonb;
begin
 if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id and pharmacy_id=p_pharmacy_id and created_by=auth.uid();
 if not found then raise exception 'Session scope mismatch';end if;
 select coalesce(jsonb_agg(o.payload||jsonb_build_object('operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,'acknowledgement',o.result,'quantity',c.quantity,'revision',c.revision,'captured_at',o.created_at,'status',case when c.quantity=0 then 'DELETED' when o.payload->>'kind'='UNKNOWN' then (select n.status from public.pharmflow_needs_review_v2 n where n.id=(o.result->>'review_id')::uuid) else 'SAVED' end,'editable',s.closed_at is null and c.quantity>0 and (o.payload->>'kind'='KNOWN' or exists(select 1 from public.pharmflow_needs_review_v2 n where n.id=(o.result->>'review_id')::uuid and n.status='PENDING'))) order by o.created_at desc,o.operation_id),'[]'::jsonb) into r
 from pharmflow_expiry_private.session_captures_v1 c join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id) where c.session_id=s.id;
 return r;
end $$;
create function public.correct_pharmflow_expiry_session_v1(p_pharmacy_id uuid,p_session_id uuid,p_operation_id uuid,p_request_id uuid,p_expected_revision integer,p_quantity integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare s pharmflow_expiry_private.active_sessions_v1%rowtype;c pharmflow_expiry_private.session_captures_v1%rowtype;o pharmflow_expiry_private.operations%rowtype;
 a pharmflow_expiry_private.session_adjustments_v1%rowtype;e public.pharmflow_expiry_events_v1%rowtype;v public.pharmflow_expiry_current_state_v1%rowtype;r jsonb;ack record;total integer;
begin
 if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_request_id is null or p_quantity is null or p_quantity<0 or p_expected_revision is null then raise exception 'Valid correction required';end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id for update;
 if not found or s.pharmacy_id<>p_pharmacy_id or s.created_by<>auth.uid() then raise exception 'Session scope mismatch';end if;
 select * into a from pharmflow_expiry_private.session_adjustments_v1 where request_id=p_request_id;
 if found then
  if a.session_id<>p_session_id or a.operation_id<>p_operation_id or a.created_by<>auth.uid() or a.quantity<>p_quantity or a.expected_revision<>p_expected_revision then raise exception 'Correction payload conflict';end if;
  return a.result;
 end if;
 if s.closed_at is not null then raise exception 'Session closed';end if;
 select * into c from pharmflow_expiry_private.session_captures_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and session_id=p_session_id for update;
 if not found or c.quantity=0 then raise exception 'Operation not editable';end if;
 if c.revision<>p_expected_revision then raise exception 'Stale revision; reload History';end if;
 select * into o from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if o.created_by<>auth.uid() then raise exception 'Operation scope mismatch';end if;
 if o.payload->>'kind'='UNKNOWN' then
  perform 1 from public.pharmflow_needs_review_v2 n where n.id=(o.result->>'review_id')::uuid and n.pharmacy_id=p_pharmacy_id and n.status='PENDING' for update;
  if not found then raise exception 'Only pending review operations are editable';end if;
  if p_quantity=0 then perform public.delete_pharmflow_expiry_review_v1(p_pharmacy_id,(o.result->>'review_id')::uuid);end if;
  r:=jsonb_build_object('operation_id',p_operation_id,'request_id',p_request_id,'quantity',p_quantity,'revision',c.revision+1);
  insert into pharmflow_expiry_private.session_adjustments_v1(request_id,session_id,operation_id,created_by,previous_quantity,quantity,expected_revision,result) values(p_request_id,p_session_id,p_operation_id,auth.uid(),c.quantity,p_quantity,p_expected_revision,r);
  update pharmflow_expiry_private.session_captures_v1 set quantity=p_quantity,revision=revision+1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
  return r;
 end if;
 if o.payload->>'kind' is distinct from 'KNOWN' then raise exception 'Unsupported operation';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'/item/'||btrim(o.payload->>'item_code')||'/'||upper(btrim(coalesce(o.payload->>'batch_no','')))||'/'||(o.payload->>'expiry_year')||'/'||(o.payload->>'expiry_month'),0));
 select * into e from public.pharmflow_expiry_events_v1 where id=(o.result->>'event_id')::uuid;
 select * into v from public.pharmflow_expiry_current_state_v1 where id=(o.result->>'state_id')::uuid and pharmacy_id=p_pharmacy_id for update;
 if not found then raise exception 'Inventory unavailable';end if;
 -- An independent recount supersedes additive contributions. Never reverse it.
 if exists(select 1 from public.pharmflow_expiry_events_v1 x where x.state_id=v.id and x.occurred_at>=e.occurred_at and x.event_type in ('RECOUNT','CLEARED') and not exists(select 1 from pharmflow_expiry_private.session_adjustments_v1 y where y.event_id=x.id)) then raise exception 'Inventory recounted; operation is read only';end if;
 total:=v.verified_quantity-c.quantity+p_quantity;
 if total<0 then raise exception 'Correction would make inventory negative';end if;
 select * into ack from pharmflow_expiry_private.save_known_core(p_pharmacy_id,v.item_code,v.item_name,v.identifier_display,v.category,total,v.expiry_month,v.expiry_year,(o.payload->>'worker_id')::uuid,v.batch_no,v.sample_serial,o.payload->>'device_id','HANDHELD',case when total=0 then 'CLEARED' else 'RECOUNT' end);
 r:=jsonb_build_object('operation_id',p_operation_id,'request_id',p_request_id,'quantity',p_quantity,'revision',c.revision+1,'state_id',v.id,'event_id',ack.event_id);
 insert into pharmflow_expiry_private.session_adjustments_v1(request_id,session_id,operation_id,created_by,previous_quantity,quantity,expected_revision,result,event_id) values(p_request_id,p_session_id,p_operation_id,auth.uid(),c.quantity,p_quantity,p_expected_revision,r,ack.event_id);
 update pharmflow_expiry_private.session_captures_v1 set quantity=p_quantity,revision=revision+1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 return r;
end $$;
revoke all on function public.open_pharmflow_expiry_session_v1(uuid,uuid,text),public.close_pharmflow_expiry_session_v1(uuid,uuid),public.save_pharmflow_expiry_session_capture_v1(uuid,uuid,uuid,jsonb),public.list_pharmflow_expiry_session_v1(uuid,uuid),public.correct_pharmflow_expiry_session_v1(uuid,uuid,uuid,uuid,integer,integer) from public,anon;
grant execute on function public.open_pharmflow_expiry_session_v1(uuid,uuid,text),public.close_pharmflow_expiry_session_v1(uuid,uuid),public.save_pharmflow_expiry_session_capture_v1(uuid,uuid,uuid,jsonb),public.list_pharmflow_expiry_session_v1(uuid,uuid),public.correct_pharmflow_expiry_session_v1(uuid,uuid,uuid,uuid,integer,integer) to authenticated;
do $patch$
declare d text;needle text;
begin
 d:=pg_get_functiondef('public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)'::regprocedure);
 needle:='(v_capture->>''quantity'')::integer,(v_capture->>''expiry_month'')::integer';
 if position(needle in d)=0 then raise exception 'Resolver contract differs; stop';end if;
 d:=replace(d,needle,'coalesce((select c.quantity from pharmflow_expiry_private.session_captures_v1 c where c.pharmacy_id=p_pharmacy_id and c.operation_id=v_details.operation_id),(v_capture->>''quantity'')::integer),(v_capture->>''expiry_month'')::integer');
 execute d;
 d:=pg_get_functiondef('public.list_pharmflow_expiry_reviews_v1(uuid,text,integer,integer)'::regprocedure);
 needle:='o.payload||jsonb_build_object';
 if position(needle in d)=0 then raise exception 'Review reader contract differs; stop';end if;
 d:=replace(d,needle,'o.payload||jsonb_build_object(''original_quantity'',o.payload->''quantity'',''quantity'',coalesce((select c.quantity from pharmflow_expiry_private.session_captures_v1 c where c.pharmacy_id=o.pharmacy_id and c.operation_id=o.operation_id),(o.payload->>''quantity'')::integer))||jsonb_build_object');
 execute d;
end $patch$;
do $verify$ begin
if exists((select * from expiry_session_schema_guard except select * from (select 'pharmflow_expiry_private.operations' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from pharmflow_expiry_private.operations t
union all
select 'pharmflow_expiry_private.photos' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from pharmflow_expiry_private.photos t
union all
select 'pharmflow_expiry_private.review_details' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from pharmflow_expiry_private.review_details t
union all
select 'public.pharmflow_expiry_events_v1' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from public.pharmflow_expiry_events_v1 t
union all
select 'public.pharmflow_expiry_current_state_v1' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from public.pharmflow_expiry_current_state_v1 t
union all
select 'public.pharmflow_needs_review_v2' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from public.pharmflow_needs_review_v2 t
union all
select 'storage.objects' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from storage.objects t) q) union all (select * from (select 'pharmflow_expiry_private.operations' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from pharmflow_expiry_private.operations t
union all
select 'pharmflow_expiry_private.photos' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from pharmflow_expiry_private.photos t
union all
select 'pharmflow_expiry_private.review_details' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from pharmflow_expiry_private.review_details t
union all
select 'public.pharmflow_expiry_events_v1' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from public.pharmflow_expiry_events_v1 t
union all
select 'public.pharmflow_expiry_current_state_v1' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from public.pharmflow_expiry_current_state_v1 t
union all
select 'public.pharmflow_needs_review_v2' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from public.pharmflow_needs_review_v2 t
union all
select 'storage.objects' as relation_name,count(*) as row_count,md5(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text)) as fingerprint from storage.objects t) q except select * from expiry_session_schema_guard)) then raise exception 'Existing Staging capture/evidence changed during schema migration';end if;
end $verify$;
commit;
