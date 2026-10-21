-- REVIEW ONLY. NOT APPLIED. Staging tovkcakucyagvbzvlnks only.
-- Execute transactionally after approval and live preflight against recorded contracts.
begin;
lock table pharmflow_expiry_private.active_sessions_v1 in share row exclusive mode;
create table pharmflow_expiry_private.session_clear_requests_v1 (
 request_id uuid primary key,
 pharmacy_id uuid not null,
 created_by uuid not null,
 auth_session_id uuid not null,
 previous_session_id uuid not null unique references pharmflow_expiry_private.active_sessions_v1(id),
 next_session_id uuid not null unique references pharmflow_expiry_private.active_sessions_v1(id),
 device_id text not null,
 cleared_at timestamptz not null default clock_timestamp(),
 result jsonb not null
);
alter table pharmflow_expiry_private.session_clear_requests_v1 enable row level security;
revoke all on pharmflow_expiry_private.session_clear_requests_v1 from public, anon, authenticated;
-- Keep all historical rows and their signed identity; allow exactly one OPEN successor.
drop index pharmflow_expiry_private.expiry_signed_session_scope;
create unique index expiry_signed_session_scope on pharmflow_expiry_private.active_sessions_v1
 (pharmacy_id,created_by,auth_session_id) where auth_session_id is not null and closed_at is null;
create or replace function public.get_pharmflow_expiry_auth_session_v1(p_pharmacy_id uuid,p_device_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare sid uuid:=pharmflow_expiry_private.valid_auth_session();s pharmflow_expiry_private.active_sessions_v1%rowtype;
begin
 if public.is_pharmacy_member(p_pharmacy_id) is not true or nullif(btrim(p_device_id),'') is null then raise exception 'Pharmacy and device required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth-lifecycle/'||auth.uid()::text||'/'||sid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth/'||p_pharmacy_id::text||'/'||sid::text,0));
 select * into s from pharmflow_expiry_private.active_sessions_v1 where pharmacy_id=p_pharmacy_id and created_by=auth.uid() and auth_session_id=sid and closed_at is null;
 if not found then
  if exists(select 1 from pharmflow_expiry_private.active_sessions_v1 where pharmacy_id=p_pharmacy_id and created_by=auth.uid() and auth_session_id=sid) then raise exception 'Session closed; Sign In required';end if;
  insert into pharmflow_expiry_private.active_sessions_v1(id,pharmacy_id,created_by,device_id,auth_session_id,created_at)
  values(gen_random_uuid(),p_pharmacy_id,auth.uid(),p_device_id,sid,coalesce((select created_at from auth.sessions where id=sid),clock_timestamp())) returning * into s;
 end if;
 return jsonb_build_object('session_id',s.id,'auth_session_id',sid,'status','OPEN');
end $$;
-- Coordinate existing sign-out with getter/rotation; preserve cross-pharmacy closure.
create or replace function public.close_pharmflow_expiry_auth_session_v1()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare sid uuid:=pharmflow_expiry_private.valid_auth_session();
begin
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth-lifecycle/'||auth.uid()::text||'/'||sid::text,0));
 update pharmflow_expiry_private.active_sessions_v1 set closed_at=coalesce(closed_at,clock_timestamp()) where created_by=auth.uid() and auth_session_id=sid;
 return jsonb_build_object('status','CLOSED','auth_session_id',sid);
end $$;
create function public.clear_pharmflow_expiry_desktop_session_v1(p_pharmacy_id uuid,p_session_id uuid,p_request_id uuid,p_device_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare sid uuid:=pharmflow_expiry_private.valid_auth_session();s pharmflow_expiry_private.active_sessions_v1%rowtype;
 a pharmflow_expiry_private.session_clear_requests_v1%rowtype; nextid uuid; result jsonb;
begin
 if public.is_pharmacy_member(p_pharmacy_id) is not true or p_request_id is null or p_session_id is null or nullif(btrim(p_device_id),'') is null then raise exception 'Clear scope and request required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-auth-lifecycle/'||auth.uid()::text||'/'||sid::text,0));
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
end $$;
revoke all on function public.clear_pharmflow_expiry_desktop_session_v1(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.clear_pharmflow_expiry_desktop_session_v1(uuid,uuid,uuid,text) to authenticated;
commit;
