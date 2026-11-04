-- Staging Duty only. Existing module contracts and data are unchanged.
create table public.pharmflow_duty_entries_v1(
 pharmacy_id uuid not null,code text not null,date date not null,
 payload jsonb not null,identity jsonb not null,revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 primary key(pharmacy_id,code,date),
 foreign key(pharmacy_id,code) references public.pharmflow_duty_employees_v1(pharmacy_id,code)
);
create table public.pharmflow_duty_holidays_v1(
 pharmacy_id uuid not null references public.pharmacies(id),date date not null,active boolean not null,
 revision bigint not null default 1,primary key(pharmacy_id,date)
);
create index duty_entries_month_v1 on public.pharmflow_duty_entries_v1(pharmacy_id,date);
alter table public.pharmflow_duty_entries_v1 enable row level security;
alter table public.pharmflow_duty_holidays_v1 enable row level security;
revoke all on public.pharmflow_duty_entries_v1,public.pharmflow_duty_holidays_v1 from public,anon,authenticated;

create function pharmflow_duty_private.validate_entry(p jsonb) returns void language plpgsql immutable set search_path=pg_catalog as $$
declare t jsonb;s int;e int;first_start int;last_end int;idx int=0;status text=p->>'status';lim int;
begin
 if jsonb_typeof(p)<>'object' or status is null or status not in ('WORK','OFF','ANNUAL_LEAVE','SICK_LEAVE','OTHER_LEAVE','EMPTY') then raise exception 'Invalid Duty status';end if;
 if jsonb_typeof(p->'periods') is distinct from 'array' then raise exception 'Duty periods must be an array';end if;
 if jsonb_array_length(p->'periods')>2 or (status='WORK' and jsonb_array_length(p->'periods')=0) or (status<>'WORK' and jsonb_array_length(p->'periods')<>0) then raise exception 'Invalid working periods for Duty status';end if;
 if jsonb_typeof(p->'basic_limit') is distinct from 'number' or (p->>'basic_limit')!~'^\d+$' then raise exception 'Invalid basic limit';end if;
 lim=(p->>'basic_limit')::int;if lim<0 or lim>1440 then raise exception 'Invalid basic limit';end if;
 if jsonb_typeof(p->'note') is distinct from 'string' or length(p->>'note')>300 then raise exception 'Duty note exceeds 300 characters';end if;
 if coalesce(p->>'highlight','INVALID') not in ('','blue','mint','violet','rose') then raise exception 'Invalid Duty highlight';end if;
 for t in select value from jsonb_array_elements(p->'periods') loop
  if jsonb_typeof(t->'start') is distinct from 'number' or jsonb_typeof(t->'end') is distinct from 'number' or (t->>'start')!~'^\d+$' or (t->>'end')!~'^\d+$' then raise exception 'Duty times must be integer minutes';end if;
  s=(t->>'start')::int;e=(t->>'end')::int;
  if s<0 or s>=2880 or e<=s or e>=2880 or (idx=0 and s>=1440) then raise exception 'Invalid Duty interval';end if;
  if idx=0 then first_start=s;elsif s<last_end then raise exception 'Duty periods overlap';end if;
  if e-first_start>1440 then raise exception 'Duty span exceeds 24 hours';end if;
  last_end=e;idx=idx+1;
 end loop;
end $$;

create function pharmflow_duty_private.minutes(d date,p jsonb,holiday boolean) returns jsonb language plpgsql immutable set search_path=pg_catalog as $$
declare total int;lim int=(p->>'basic_limit')::int;friday boolean=extract(isodow from d)=5;
begin
 select coalesce(sum((v->>'end')::int-(v->>'start')::int),0)::int into total from jsonb_array_elements(p->'periods') v;
 return jsonb_build_object('basic',case when not friday and not holiday then least(total,lim) else 0 end,'normal_ot',case when not friday and not holiday then greatest(total-lim,0) else 0 end,'friday_ot',case when friday then total else 0 end,'holiday_ot',case when not friday and holiday then total else 0 end,'total',total);
end $$;

create function public.get_pharmflow_duty_schedule_v1(p_pharmacy_id uuid,p_month date) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;finish date=(p_month+interval '1 month')::date;
begin
 result=public.get_pharmflow_duty_foundation_v1(p_pharmacy_id,p_month);
 return result||jsonb_build_object('entries',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('minutes',pharmflow_duty_private.minutes(e.date,e.payload,coalesce(h.active,false))) order by e.date,e.code) from public.pharmflow_duty_entries_v1 e left join public.pharmflow_duty_holidays_v1 h on h.pharmacy_id=e.pharmacy_id and h.date=e.date where e.pharmacy_id=p_pharmacy_id and e.date>=p_month and e.date<finish),'[]'::jsonb),
 'holidays',coalesce((select jsonb_agg(to_jsonb(h) order by h.date) from public.pharmflow_duty_holidays_v1 h where h.pharmacy_id=p_pharmacy_id and h.date>=p_month and h.date<finish),'[]'::jsonb));
end $$;

create function public.save_pharmflow_duty_entries_v1(p_pharmacy_id uuid,p_changes jsonb,p_reason text default 'Inline edit') returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c jsonb;oldrow public.pharmflow_duty_entries_v1;newrow public.pharmflow_duty_entries_v1;d date;emp public.pharmflow_duty_employees_v1;position_label text;n int=0;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501';end if;
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)<1 or jsonb_array_length(p_changes)>1000 then raise exception 'Select 1 to 1000 Duty cells';end if;
 if length(trim(coalesce(p_reason,'')))<1 or length(p_reason)>200 then raise exception 'Enter a short change reason';end if;
 if (select count(*) from jsonb_array_elements(p_changes))<>(select count(distinct (v->>'code',v->>'date')) from jsonb_array_elements(p_changes) v) then raise exception 'Duplicate Duty destinations';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 for c in select value from jsonb_array_elements(p_changes) loop
  d=(c->>'date')::date;if d is null or d<'1900-01-01' or d>'2199-12-31' then raise exception 'Invalid Duty date';end if;
  if exists(select 1 from public.pharmflow_duty_months_v1 where pharmacy_id=p_pharmacy_id and month=date_trunc('month',d)::date and status='Completed') then raise exception 'Duty month is completed. Reopen with a reason before changing it.';end if;
  select * into emp from public.pharmflow_duty_employees_v1 where pharmacy_id=p_pharmacy_id and code=c->>'code';if not found then raise exception 'Unknown Duty employee';end if;
  select * into oldrow from public.pharmflow_duty_entries_v1 where pharmacy_id=p_pharmacy_id and code=c->>'code' and date=d for update;
  if c->>'expected_revision' is null or (c->>'expected_revision')::bigint<>coalesce(oldrow.revision,0) then raise exception 'DUTY_CONFLICT: % / %',c->>'code',d;end if;
  perform pharmflow_duty_private.validate_entry(c->'payload');
  if oldrow.code is null then
   select label into position_label from public.pharmflow_duty_positions_v1 where pharmacy_id=p_pharmacy_id and key=emp.position_key;
   insert into public.pharmflow_duty_entries_v1(pharmacy_id,code,date,payload,identity) values(p_pharmacy_id,emp.code,d,c->'payload',jsonb_build_object('name',emp.name,'position_key',emp.position_key,'position_label',position_label)) returning * into newrow;
  else
   update public.pharmflow_duty_entries_v1 set payload=c->'payload',revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and code=emp.code and date=d returning * into newrow;
  end if;
  insert into public.pharmflow_duty_months_v1(pharmacy_id,month) values(p_pharmacy_id,date_trunc('month',d)::date) on conflict do nothing;
  insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,'schedule',emp.code||'/'||d,auth.uid(),case when oldrow.code is null then null else to_jsonb(oldrow) end,to_jsonb(newrow)||jsonb_build_object('reason',p_reason));
  n=n+1;
 end loop;
 -- Validate final batch state, including adjacent dates/months. The same pharmacy
 -- lock serializes employee, schedule, holiday and month mutations.
 if exists(
  with intervals as (select e.code,e.date,e.date::timestamp+((v->>'start')::int)*interval '1 minute' as starts,e.date::timestamp+((v->>'end')::int)*interval '1 minute' as ends
   from public.pharmflow_duty_entries_v1 e cross join lateral jsonb_array_elements(e.payload->'periods') v
   where e.pharmacy_id=p_pharmacy_id and e.code in (select value->>'code' from jsonb_array_elements(p_changes))),
  ordered as (select *,max(ends) over(partition by code order by starts,ends rows between unbounded preceding and 1 preceding) prior_end from intervals)
  select 1 from ordered where starts<prior_end
 ) then raise exception 'Duty overlaps another period or date for this employee';end if;
 return jsonb_build_object('saved',n);
end $$;

create function public.set_pharmflow_duty_holiday_v1(p_pharmacy_id uuid,p_date date,p_active boolean,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare oldrow public.pharmflow_duty_holidays_v1;newrow public.pharmflow_duty_holidays_v1;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501';end if;
 if p_date is null or p_date<'1900-01-01' or p_date>'2199-12-31' then raise exception 'Invalid holiday date';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 if exists(select 1 from public.pharmflow_duty_months_v1 where pharmacy_id=p_pharmacy_id and month=date_trunc('month',p_date)::date and status='Completed') then raise exception 'Duty month is completed';end if;
 select * into oldrow from public.pharmflow_duty_holidays_v1 where pharmacy_id=p_pharmacy_id and date=p_date for update;
 if p_expected_revision is null or p_expected_revision<>coalesce(oldrow.revision,0) then raise exception 'DUTY_CONFLICT';end if;
 insert into public.pharmflow_duty_holidays_v1(pharmacy_id,date,active) values(p_pharmacy_id,p_date,p_active) on conflict(pharmacy_id,date) do update set active=excluded.active,revision=pharmflow_duty_holidays_v1.revision+1 returning * into newrow;
 insert into public.pharmflow_duty_months_v1(pharmacy_id,month) values(p_pharmacy_id,date_trunc('month',p_date)::date) on conflict do nothing;
 insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,'holiday',p_date::text,auth.uid(),case when oldrow.date is null then null else to_jsonb(oldrow) end,to_jsonb(newrow));return to_jsonb(newrow);
end $$;

create function public.set_pharmflow_duty_month_v1(p_pharmacy_id uuid,p_month date,p_status text,p_expected_revision bigint,p_reason text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare oldrow public.pharmflow_duty_months_v1;newrow public.pharmflow_duty_months_v1;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501';end if;
 if p_month is null or extract(day from p_month)<>1 or p_status not in ('Draft','Active','Completed') or length(trim(coalesce(p_reason,'')))<3 or length(p_reason)>200 then raise exception 'Select a month status and enter a reason';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 select * into oldrow from public.pharmflow_duty_months_v1 where pharmacy_id=p_pharmacy_id and month=p_month for update;
 if p_expected_revision is null or p_expected_revision<>coalesce(oldrow.revision,0) then raise exception 'DUTY_CONFLICT';end if;
 insert into public.pharmflow_duty_months_v1(pharmacy_id,month,status) values(p_pharmacy_id,p_month,p_status) on conflict(pharmacy_id,month) do update set status=excluded.status,revision=pharmflow_duty_months_v1.revision+1 returning * into newrow;
 insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,'month',p_month::text,auth.uid(),case when oldrow.month is null then null else to_jsonb(oldrow) end,to_jsonb(newrow)||jsonb_build_object('reason',p_reason));return to_jsonb(newrow);
end $$;
revoke all on function pharmflow_duty_private.validate_entry(jsonb),pharmflow_duty_private.minutes(date,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.get_pharmflow_duty_schedule_v1(uuid,date),public.save_pharmflow_duty_entries_v1(uuid,jsonb,text),public.set_pharmflow_duty_holiday_v1(uuid,date,boolean,bigint),public.set_pharmflow_duty_month_v1(uuid,date,text,bigint,text) from public,anon,authenticated;
grant execute on function public.get_pharmflow_duty_schedule_v1(uuid,date),public.save_pharmflow_duty_entries_v1(uuid,jsonb,text),public.set_pharmflow_duty_holiday_v1(uuid,date,boolean,bigint),public.set_pharmflow_duty_month_v1(uuid,date,text,bigint,text) to authenticated;
