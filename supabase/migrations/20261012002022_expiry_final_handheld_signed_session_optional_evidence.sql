begin;
set local lock_timeout='10s';
do $guard$ begin
if md5(pg_get_functiondef('public.get_pharmflow_expiry_review_v1(uuid,uuid)'::regprocedure))<>'0e4288e641836ad31d51b27fc8f34b0f' then raise exception 'Preflight definition changed: get_pharmflow_expiry_review_v1';end if;
if md5(pg_get_functiondef('public.list_pharmflow_expiry_reviews_v1(uuid,text,integer,integer)'::regprocedure))<>'246db7043866a584200656128f004ce4' then raise exception 'Preflight definition changed: list_pharmflow_expiry_reviews_v1';end if;
if md5(pg_get_functiondef('public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)'::regprocedure))<>'2e25370a3ce15ec9512308b878c13af5' then raise exception 'Preflight definition changed: resolve_pharmflow_expiry_review_v1';end if;
if md5(pg_get_functiondef('public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb)'::regprocedure))<>'2df2914e575276e316ac310add08dd61' then raise exception 'Preflight definition changed: save_pharmflow_expiry_capture_v3';end if;
if md5(pg_get_functiondef('pharmflow_expiry_private.scan_facts(text,text)'::regprocedure))<>'02c421e4814fd04ed1c76e89e5709189' then raise exception 'AI11 helper changed';end if;
end $guard$;
lock table pharmflow_expiry_private.active_sessions_v1,pharmflow_expiry_private.session_captures_v1,pharmflow_expiry_private.session_adjustments_v1 in share row exclusive mode;
lock table pharmflow_expiry_private.operations,pharmflow_expiry_private.photos,pharmflow_expiry_private.review_details,pharmflow_expiry_private.photo_cleanup_jobs,public.pharmflow_expiry_events_v1,public.pharmflow_expiry_current_state_v1,public.pharmflow_needs_review_v2,storage.objects in share mode;
create temporary table expiry_gate_snapshot(table_name text primary key,fingerprint text) on commit drop;
do $snapshot$ declare t text;h text;begin
foreach t in array array['pharmflow_expiry_private.active_sessions_v1','pharmflow_expiry_private.session_captures_v1','pharmflow_expiry_private.session_adjustments_v1','pharmflow_expiry_private.operations','pharmflow_expiry_private.photos','pharmflow_expiry_private.review_details','pharmflow_expiry_private.photo_cleanup_jobs','public.pharmflow_expiry_events_v1','public.pharmflow_expiry_current_state_v1','public.pharmflow_needs_review_v2','storage.objects'] loop
execute format('select md5(coalesce(string_agg(v::text,'''' order by v::text),'''')) from (select to_jsonb(x)-''facts''-''auth_session_id'' v from %s x) q',t) into h;
insert into expiry_gate_snapshot values(t,h);end loop;end $snapshot$;
-- No historical capture/evidence rewrite, no polling, no scheduler changes.
alter table pharmflow_expiry_private.active_sessions_v1 add column auth_session_id uuid;
create unique index expiry_signed_session_scope on pharmflow_expiry_private.active_sessions_v1(pharmacy_id,created_by,auth_session_id) where auth_session_id is not null;
alter table pharmflow_expiry_private.session_captures_v1 add column facts jsonb not null default '{}'::jsonb;
alter table pharmflow_expiry_private.review_details alter column product_photo_path drop not null;

create function pharmflow_expiry_private.valid_auth_session() returns uuid
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare sid uuid;j jsonb:=auth.jwt();
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 sid:=nullif(j->>'session_id','')::uuid;
 if sid is null or coalesce((j->>'exp')::numeric,0)<=extract(epoch from now()) or not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())) then raise exception 'Authentication session expired or revoked';end if;
 return sid;
end $$;
revoke all on function pharmflow_expiry_private.valid_auth_session() from public,anon,authenticated;
create function pharmflow_expiry_private.require_signed_session(p_pharmacy_id uuid,p_session_id uuid,p_open boolean default true) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare sid uuid:=pharmflow_expiry_private.valid_auth_session();s pharmflow_expiry_private.active_sessions_v1%rowtype;
begin
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id for update;
 if not found or s.pharmacy_id<>p_pharmacy_id or s.created_by<>auth.uid() or s.auth_session_id is distinct from sid then raise exception 'Signed session scope mismatch';end if;
 if p_open and s.closed_at is not null then raise exception 'Session closed';end if;
end $$;
revoke all on function pharmflow_expiry_private.require_signed_session(uuid,uuid,boolean) from public,anon,authenticated;
create function public.get_pharmflow_expiry_auth_session_v1(p_pharmacy_id uuid,p_device_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare sid uuid:=pharmflow_expiry_private.valid_auth_session();s pharmflow_expiry_private.active_sessions_v1%rowtype;
begin
 if public.is_pharmacy_member(p_pharmacy_id) is not true or nullif(btrim(p_device_id),'') is null then raise exception 'Pharmacy and device required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth/'||p_pharmacy_id::text||'/'||sid::text,0));
 select * into s from pharmflow_expiry_private.active_sessions_v1 where pharmacy_id=p_pharmacy_id and created_by=auth.uid() and auth_session_id=sid;
 if not found then
  insert into pharmflow_expiry_private.active_sessions_v1(id,pharmacy_id,created_by,device_id,auth_session_id,created_at) values(gen_random_uuid(),p_pharmacy_id,auth.uid(),p_device_id,sid,coalesce((select created_at from auth.sessions where id=sid),clock_timestamp())) returning * into s;
 end if;
 if s.closed_at is not null then raise exception 'Session closed; Sign In required';end if;
 return jsonb_build_object('session_id',s.id,'auth_session_id',sid,'status','OPEN');
end $$;
create function public.close_pharmflow_expiry_auth_session_v1() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare sid uuid:=pharmflow_expiry_private.valid_auth_session();
begin
 update pharmflow_expiry_private.active_sessions_v1 set closed_at=coalesce(closed_at,clock_timestamp()) where created_by=auth.uid() and auth_session_id=sid;
 return jsonb_build_object('status','CLOSED','auth_session_id',sid);
end $$;
create function public.save_pharmflow_expiry_session_capture_v2(p_pharmacy_id uuid,p_session_id uuid,p_operation_id uuid,p_capture jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r jsonb;s pharmflow_expiry_private.active_sessions_v1%rowtype;
begin
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id,false);
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id;
 -- The original per-device validation is retained. Other devices sign in with their own signed auth session.
 r:=public.save_pharmflow_expiry_session_capture_v1(p_pharmacy_id,p_session_id,p_operation_id,p_capture);
 return r||jsonb_build_object('confirmed_capture',p_capture,'pharmacy_id',p_pharmacy_id);
end $$;
create function public.list_pharmflow_expiry_session_v2(p_pharmacy_id uuid,p_session_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r jsonb;
begin
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id);
 select coalesce(jsonb_agg(x.receipt order by x.captured_at desc,x.operation_id desc),'[]'::jsonb) into r from (
  select coalesce(e.occurred_at,n.created_at,o.created_at) captured_at,o.operation_id,o.payload||c.facts||jsonb_build_object('operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,'acknowledgement',o.result,'quantity',c.quantity,'revision',c.revision,'captured_at',coalesce(e.occurred_at,n.created_at,o.created_at),'status',case when c.quantity=0 then 'DELETED' when o.payload->>'kind'='UNKNOWN' then n.status else 'SAVED' end,'editable',c.quantity>0 and (o.payload->>'kind'='KNOWN' or n.status='PENDING')) receipt
  from pharmflow_expiry_private.session_captures_v1 c join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id)
  left join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>'event_id')::uuid and e.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_needs_review_v2 n on n.id=(o.result->>'review_id')::uuid and n.pharmacy_id=o.pharmacy_id
  where c.session_id=p_session_id order by coalesce(e.occurred_at,n.created_at,o.created_at) desc,o.operation_id desc limit 10
 ) x;return r;
end $$;

create function public.correct_pharmflow_expiry_session_v2(p_pharmacy_id uuid,p_session_id uuid,p_operation_id uuid,p_request_id uuid,p_expected_revision integer,p_correction jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
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
  select * into ack from pharmflow_expiry_private.save_known_core(p_pharmacy_id,v.item_code,v.item_name,v.identifier_display,v.category,total,v.expiry_month,v.expiry_year,(o.payload->>'worker_id')::uuid,v.batch_no,v.sample_serial,o.payload->>'device_id','HANDHELD',case when total=0 then 'CLEARED' else 'RECOUNT' end);
  events:=events||jsonb_build_array(ack.event_id::text);
  if keyold<>keynew and qty>0 then
   select * into target from pharmflow_expiry_private.save_known_core(p_pharmacy_id,o.payload->>'item_code',o.payload->>'item_name',o.payload->>'identifier_display',o.payload->>'category',qty,mo,yr,(o.payload->>'worker_id')::uuid,batch,o.payload->>'sample_serial',o.payload->>'device_id','HANDHELD','CAPTURE');
   oldid:=target.state_id;anchor:=target.event_id;events:=events||jsonb_build_array(target.event_id::text);
  else anchor:=ack.event_id;end if;
 end if;
 result:=jsonb_build_object('operation_id',p_operation_id,'request_id',p_request_id,'quantity',qty,'revision',c.revision+1,'correction',p_correction,'event_ids',events,'state_id',oldid);
 insert into pharmflow_expiry_private.session_adjustments_v1(request_id,session_id,operation_id,created_by,previous_quantity,quantity,expected_revision,result,event_id) values(p_request_id,p_session_id,p_operation_id,auth.uid(),c.quantity,qty,p_expected_revision,result,anchor);
 update pharmflow_expiry_private.session_captures_v1 set quantity=qty,revision=revision+1,facts=jsonb_build_object('batch_no',batch,'expiry_month',mo,'expiry_year',yr,'effective_state_id',oldid,'effective_event_id',anchor,'correction_source','OPERATOR_CORRECTION') where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 return result;
end $$;
-- Close old client entry points: signed-session guards cannot be bypassed.
revoke execute on function public.open_pharmflow_expiry_session_v1(uuid,uuid,text),public.close_pharmflow_expiry_session_v1(uuid,uuid),public.save_pharmflow_expiry_session_capture_v1(uuid,uuid,uuid,jsonb),public.list_pharmflow_expiry_session_v1(uuid,uuid),public.correct_pharmflow_expiry_session_v1(uuid,uuid,uuid,uuid,integer,integer) from authenticated;
revoke all on function public.get_pharmflow_expiry_auth_session_v1(uuid,text),public.close_pharmflow_expiry_auth_session_v1(),public.save_pharmflow_expiry_session_capture_v2(uuid,uuid,uuid,jsonb),public.list_pharmflow_expiry_session_v2(uuid,uuid),public.correct_pharmflow_expiry_session_v2(uuid,uuid,uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.get_pharmflow_expiry_auth_session_v1(uuid,text),public.close_pharmflow_expiry_auth_session_v1(),public.save_pharmflow_expiry_session_capture_v2(uuid,uuid,uuid,jsonb),public.list_pharmflow_expiry_session_v2(uuid,uuid),public.correct_pharmflow_expiry_session_v2(uuid,uuid,uuid,uuid,integer,jsonb) to authenticated;
do $patch$
declare d text;needle text;
begin
 d:=pg_get_functiondef('public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb)'::regprocedure);
 needle:='if v_product is null or (v_expiry is not null and v_product=v_expiry) then';
 if position(needle in d)=0 then raise exception 'Photo contract changed';end if;
 d:=replace(d,needle,'if (v_product is null and v_expiry is not null) or (v_expiry is not null and v_product=v_expiry) then');
 d:=replace(d,'if not exists(select 1 from pharmflow_expiry_private.photos p join storage.objects o','if (v_product is not null and not exists(select 1 from pharmflow_expiry_private.photos p join storage.objects o');
 d:=replace(d,'p.deleted_at is null)'||chr(10)||'   or (v_expiry','p.deleted_at is null))'||chr(10)||'   or (v_expiry');
 d:=replace(d,'begin'||chr(10)||' if auth.uid()', 'begin'||chr(10)||' perform pharmflow_expiry_private.valid_auth_session();'||chr(10)||' if auth.uid()');
 d:=replace(d,'v_kind:=p_capture->>''kind'';','if p_capture ? ''identification_note'' and (jsonb_typeof(p_capture->''identification_note'') not in (''string'',''null'') or length(p_capture->>''identification_note'')>250) then raise exception ''Invalid identification note'';end if;'||chr(10)||' v_kind:=p_capture->>''kind'';');
 execute d;
 d:=pg_get_functiondef('public.get_pharmflow_expiry_review_v1(uuid,uuid)'::regprocedure);
 d:=replace(d,'join pharmflow_expiry_private.photos p on p.path=d.product_photo_path','left join pharmflow_expiry_private.photos p on p.path=d.product_photo_path');execute d;
 d:=pg_get_functiondef('public.list_pharmflow_expiry_reviews_v1(uuid,text,integer,integer)'::regprocedure);
 d:=replace(d,'o.payload||jsonb_build_object','o.payload||coalesce((select c.facts from pharmflow_expiry_private.session_captures_v1 c where c.pharmacy_id=o.pharmacy_id and c.operation_id=o.operation_id),''{}''::jsonb)||jsonb_build_object');execute d;
 d:=pg_get_functiondef('public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)'::regprocedure);
 needle:='if v_capture is null or jsonb_typeof(v_capture)';
 if position(needle in d)=0 then raise exception 'Resolver contract changed';end if;
 d:=replace(d,needle,'v_capture:=v_capture||coalesce((select c.facts from pharmflow_expiry_private.session_captures_v1 c where c.pharmacy_id=p_pharmacy_id and c.operation_id=v_details.operation_id),''{}''::jsonb);'||chr(10)||'  '||needle);execute d;
end $patch$;
do $verify$ declare r record;h text;begin
for r in select * from expiry_gate_snapshot loop
execute format('select md5(coalesce(string_agg(v::text,'''' order by v::text),'''')) from (select to_jsonb(x)-''facts''-''auth_session_id'' v from %s x) q',r.table_name) into h;
if h is distinct from r.fingerprint then raise exception 'Historical data changed: %',r.table_name;end if;end loop;
if md5(pg_get_functiondef('pharmflow_expiry_private.scan_facts(text,text)'::regprocedure))<>'02c421e4814fd04ed1c76e89e5709189' then raise exception 'AI11 helper changed';end if;
end $verify$;
commit;
