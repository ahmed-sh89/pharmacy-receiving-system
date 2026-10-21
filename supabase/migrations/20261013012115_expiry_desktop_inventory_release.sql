-- Additive Expiry Stage 1 inventory contracts. No existing records are rewritten.
create table pharmflow_expiry_private.resolved_inventory_v1 (
 id uuid primary key default gen_random_uuid(), pharmacy_id uuid not null,
 state_id uuid not null references public.pharmflow_expiry_current_state_v1(id),
 snapshot jsonb not null, quantity integer not null check(quantity>=0),
 resolved_at timestamptz not null default clock_timestamp(), resolved_by uuid not null,
 restored_at timestamptz, restored_by uuid
);
create index on pharmflow_expiry_private.resolved_inventory_v1(pharmacy_id,resolved_at desc) where restored_at is null;
alter table pharmflow_expiry_private.resolved_inventory_v1 enable row level security;
revoke all on pharmflow_expiry_private.resolved_inventory_v1 from public,anon,authenticated;
create table pharmflow_expiry_private.inventory_requests_v1 (
 request_id uuid primary key, pharmacy_id uuid not null, created_by uuid not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
alter table pharmflow_expiry_private.inventory_requests_v1 enable row level security;
revoke all on pharmflow_expiry_private.inventory_requests_v1 from public,anon,authenticated;

create function pharmflow_expiry_private.inventory_rows_v1(p_pharmacy uuid,p_resolved boolean)
returns table(row_id uuid,state_id uuid,item_code text,item_name text,identifier_display text,
 department text,batch_no text,expiry_month integer,expiry_year integer,quantity integer,
 updated_at timestamptz,added_at timestamptz,status text,version text)
language sql stable set search_path=pg_catalog,public,pg_temp as $$
 with source as (
 select s.id row_id,s.id state_id,to_jsonb(s) facts,s.verified_quantity quantity,s.last_verified_at stamp,'ACTIVE'::text status
 from public.pharmflow_expiry_current_state_v1 s where not p_resolved and s.pharmacy_id=p_pharmacy and s.status='ACTIVE'
 union all
 select r.id,r.state_id,r.snapshot,r.quantity,r.resolved_at,'RESOLVED'
 from pharmflow_expiry_private.resolved_inventory_v1 r where p_resolved and r.pharmacy_id=p_pharmacy and r.restored_at is null
 )
 select s.row_id,s.state_id,s.facts->>'item_code',s.facts->>'item_name',s.facts->>'identifier_display',
 coalesce(nullif(g.group_name,''),nullif(s.facts->>'category',''),'Uncategorized'),s.facts->>'batch_no',
 (s.facts->>'expiry_month')::integer,(s.facts->>'expiry_year')::integer,s.quantity,s.stamp,
 coalesce(e.stamp,(s.facts->>'created_at')::timestamptz,s.stamp),s.status,
 md5(s.facts::text||s.quantity::text||s.stamp::text)
 from source s left join public.pharmflow_global_items_v2 g on g.item_code=s.facts->>'item_code'
 left join lateral (select max(occurred_at) stamp from public.pharmflow_expiry_events_v1 x
 where x.state_id=s.state_id and x.event_type='CAPTURE') e on true
$$;
revoke all on function pharmflow_expiry_private.inventory_rows_v1(uuid,boolean) from public,anon,authenticated;

create function pharmflow_expiry_private.inventory_match_v1(r jsonb,f jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select
 (coalesce(f->>'search','')='' or exists(select 1 from unnest(array[r->>'item_name',r->>'item_code',r->>'identifier_display',r->>'batch_no']) v
 where strpos(lower(coalesce(v,'')),lower(btrim(f->>'search')))>0))
 and (coalesce(jsonb_array_length(f->'departments'),0)=0 or (f->'departments') ? (r->>'department'))
 and (coalesce(jsonb_array_length(f->'months'),0)=0 or (f->'months') ? ((r->>'expiry_year')||'-'||lpad(r->>'expiry_month',2,'0')))
 and (not(f ? 'from') or ((r->>'expiry_year')::integer*12+(r->>'expiry_month')::integer)>= (f->>'from')::integer)
 and (not(f ? 'to') or ((r->>'expiry_year')::integer*12+(r->>'expiry_month')::integer)<= (f->>'to')::integer)
$$;
revoke all on function pharmflow_expiry_private.inventory_match_v1(jsonb,jsonb) from public,anon,authenticated;

create function public.query_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid,p_filters jsonb default '{}'::jsonb,
 p_resolved boolean default false,p_sort text default 'ADDED',p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;begin
 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_limit not between 1 and 250 or p_offset<0 or jsonb_typeof(p_filters)<>'object' or p_sort not in ('ADDED','UPDATED','EXPIRY') then raise exception 'Invalid inventory query';end if;
 with rows as materialized(select * from pharmflow_expiry_private.inventory_rows_v1(p_pharmacy_id,p_resolved)),
 matching as materialized(select * from rows r where pharmflow_expiry_private.inventory_match_v1(to_jsonb(r),p_filters)),
 page as (select * from matching order by
 case when p_sort='EXPIRY' then expiry_year*12+expiry_month end asc,
 case when p_sort='UPDATED' or p_resolved then updated_at end desc,
 case when p_sort='ADDED' and not p_resolved then added_at end desc,row_id limit p_limit offset p_offset)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),
 'count',(select count(*) from matching),'units',(select coalesce(sum(quantity),0) from matching),
 'departments',(select coalesce(jsonb_agg(d order by d),'[]'::jsonb) from (select distinct department d from rows) v),
 'months',(select coalesce(jsonb_agg(m order by m),'[]'::jsonb) from (select distinct expiry_year::text||'-'||lpad(expiry_month::text,2,'0') m from rows) v)) into result;
 return result;
end $$;
revoke all on function public.query_pharmflow_expiry_inventory_v1(uuid,jsonb,boolean,text,integer,integer) from public,anon;
grant execute on function public.query_pharmflow_expiry_inventory_v1(uuid,jsonb,boolean,text,integer,integer) to authenticated;

create function public.summary_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare cur integer:=(extract(year from timezone('Asia/Riyadh',now()))::integer*12+extract(month from timezone('Asia/Riyadh',now()))::integer);result jsonb;
begin
 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select jsonb_agg(jsonb_build_object('key',p.key,'from',p.lo,'to',p.hi,'count',q.n,'units',q.units)) into result
 from (values('EXPIRED',null::integer,cur),('NEXT1',cur+1,cur+1),('NEXT2',cur+1,cur+2),('NEXT6',cur+1,cur+6)) p(key,lo,hi)
 cross join lateral(select count(*) n,coalesce(sum(s.verified_quantity),0) units from public.pharmflow_expiry_current_state_v1 s
 where s.pharmacy_id=p_pharmacy_id and s.status='ACTIVE' and (p.lo is null or s.expiry_year*12+s.expiry_month>=p.lo) and s.expiry_year*12+s.expiry_month<=p.hi) q;
 return result;
end $$;
revoke all on function public.summary_pharmflow_expiry_inventory_v1(uuid) from public,anon;
grant execute on function public.summary_pharmflow_expiry_inventory_v1(uuid) to authenticated;

-- Selection preview returns immutable versions, not a live filter command.
create function public.select_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid,p_filters jsonb,p_resolved boolean,p_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;begin
 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select jsonb_build_object('count',count(*),'units',coalesce(sum(r.quantity),0),'selection',coalesce(jsonb_agg(jsonb_build_object('id',r.row_id,'version',r.version) order by r.row_id),'[]'::jsonb)) into result
 from pharmflow_expiry_private.inventory_rows_v1(p_pharmacy_id,p_resolved) r
 where pharmflow_expiry_private.inventory_match_v1(to_jsonb(r),p_filters) and (p_ids is null or r.row_id=any(p_ids));
 return result;
end $$;
revoke all on function public.select_pharmflow_expiry_inventory_v1(uuid,jsonb,boolean,uuid[]) from public,anon;
grant execute on function public.select_pharmflow_expiry_inventory_v1(uuid,jsonb,boolean,uuid[]) to authenticated;

create function public.mutate_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid,p_request_id uuid,p_action text,p_selection jsonb,p_quantity integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare payload jsonb:=jsonb_build_object('action',p_action,'selection',p_selection,'quantity',p_quantity);
 prior pharmflow_expiry_private.inventory_requests_v1%rowtype;sel jsonb;viewrow record;s public.pharmflow_expiry_current_state_v1%rowtype;
 resolved pharmflow_expiry_private.resolved_inventory_v1%rowtype;stamp timestamptz;oldqty integer;newqty integer;n integer:=0;result jsonb;lockkey text;
begin
 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_request_id is null or p_action not in ('QUANTITY','RESOLVE','RESTORE') or jsonb_typeof(p_selection)<>'array' or jsonb_array_length(p_selection)=0 then raise exception 'Explicit selection required';end if;
 if p_action='QUANTITY' and (jsonb_array_length(p_selection)<>1 or p_quantity is null or p_quantity<0) then raise exception 'Nonnegative integer quantity required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-inventory-request/'||p_request_id::text,0));
 select * into prior from pharmflow_expiry_private.inventory_requests_v1 where request_id=p_request_id;
 if found then if prior.pharmacy_id<>p_pharmacy_id or prior.created_by<>auth.uid() or prior.payload is distinct from payload then raise exception 'Request payload conflict';end if;return prior.result;end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_selection) x)<>jsonb_array_length(p_selection) then raise exception 'Duplicate selection';end if;
 -- Acquire the SAME canonical item locks used by captures, in a stable order.
 for lockkey in select distinct p_pharmacy_id::text||'/item/'||r.item_code||'/'||upper(btrim(coalesce(r.batch_no,'')))||'/'||r.expiry_year||'/'||r.expiry_month
 from pharmflow_expiry_private.inventory_rows_v1(p_pharmacy_id,p_action='RESTORE') r
 where r.row_id in(select (x->>'id')::uuid from jsonb_array_elements(p_selection) x) order by 1
 loop perform pg_advisory_xact_lock(hashtextextended(lockkey,0));end loop;
 for sel in select x from jsonb_array_elements(p_selection) x order by x->>'id' loop
  select * into viewrow from pharmflow_expiry_private.inventory_rows_v1(p_pharmacy_id,p_action='RESTORE') r where r.row_id=(sel->>'id')::uuid;
  if not found or viewrow.version is distinct from sel->>'version' then raise exception 'Inventory changed; refresh and confirm selection again';end if;
  select * into s from public.pharmflow_expiry_current_state_v1 where id=viewrow.state_id and pharmacy_id=p_pharmacy_id for update;
  if not found then raise exception 'Inventory state unavailable';end if;
  stamp:=clock_timestamp();oldqty:=s.verified_quantity;
  if p_action='RESOLVE' then
   insert into pharmflow_expiry_private.resolved_inventory_v1(pharmacy_id,state_id,snapshot,quantity,resolved_at,resolved_by) values(p_pharmacy_id,s.id,to_jsonb(s),oldqty,stamp,auth.uid());newqty:=0;
  elsif p_action='RESTORE' then
   select * into resolved from pharmflow_expiry_private.resolved_inventory_v1 where id=viewrow.row_id and pharmacy_id=p_pharmacy_id and restored_at is null for update;
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
end $$;
revoke all on function public.mutate_pharmflow_expiry_inventory_v1(uuid,uuid,text,jsonb,integer) from public,anon;
grant execute on function public.mutate_pharmflow_expiry_inventory_v1(uuid,uuid,text,jsonb,integer) to authenticated;

create function public.list_pharmflow_expiry_desktop_session_v1(p_pharmacy_id uuid,p_session_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r jsonb;
begin
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id);
 select coalesce(jsonb_agg(x.receipt order by x.captured_at desc,x.operation_id desc),'[]'::jsonb) into r from (
  select coalesce(e.occurred_at,n.created_at,o.created_at) captured_at,o.operation_id,o.payload||c.facts||jsonb_build_object('operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,'acknowledgement',o.result,'quantity',c.quantity,'revision',c.revision,'captured_at',coalesce(e.occurred_at,n.created_at,o.created_at),'status',case when c.quantity=0 then 'DELETED' when o.payload->>'kind'='UNKNOWN' then n.status else 'SAVED' end,'editable',c.quantity>0 and (o.payload->>'kind'='KNOWN' or n.status='PENDING')) receipt
  from pharmflow_expiry_private.session_captures_v1 c join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id)
  left join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>'event_id')::uuid and e.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_needs_review_v2 n on n.id=(o.result->>'review_id')::uuid and n.pharmacy_id=o.pharmacy_id
  where c.session_id=p_session_id and o.payload->>'source'='PC' order by coalesce(e.occurred_at,n.created_at,o.created_at) desc,o.operation_id desc
 ) x;return r;
end $$;

create function public.correct_pharmflow_expiry_desktop_session_v1(p_pharmacy_id uuid,p_session_id uuid,p_operation_id uuid,p_request_id uuid,p_expected_revision integer,p_correction jsonb) returns jsonb
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
 if o.payload->>'source' is distinct from 'PC' then raise exception 'Desktop operation required';end if;
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
end $$;
-- Close old client entry points: signed-session guards cannot be bypassed.
revoke all on function public.list_pharmflow_expiry_desktop_session_v1(uuid,uuid) from public,anon;
grant execute on function public.list_pharmflow_expiry_desktop_session_v1(uuid,uuid) to authenticated;
revoke all on function public.correct_pharmflow_expiry_desktop_session_v1(uuid,uuid,uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.correct_pharmflow_expiry_desktop_session_v1(uuid,uuid,uuid,uuid,integer,jsonb) to authenticated;

create function public.save_pharmflow_expiry_desktop_capture_v1(p_pharmacy_id uuid,p_session_id uuid,p_operation_id uuid,p_capture jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare s pharmflow_expiry_private.active_sessions_v1%rowtype;r jsonb;c pharmflow_expiry_private.session_captures_v1%rowtype;
begin
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
end $$;
revoke all on function public.save_pharmflow_expiry_desktop_capture_v1(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_pharmflow_expiry_desktop_capture_v1(uuid,uuid,uuid,jsonb) to authenticated;

create function public.export_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid,p_filters jsonb,p_resolved boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r jsonb;begin
 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.expiry_year,x.expiry_month,x.item_name,x.row_id),'[]'::jsonb) into r
 from pharmflow_expiry_private.inventory_rows_v1(p_pharmacy_id,p_resolved) x
 where pharmflow_expiry_private.inventory_match_v1(to_jsonb(x),p_filters);
 return r;
end $$;
revoke all on function public.export_pharmflow_expiry_inventory_v1(uuid,jsonb,boolean) from public,anon;
grant execute on function public.export_pharmflow_expiry_inventory_v1(uuid,jsonb,boolean) to authenticated;
