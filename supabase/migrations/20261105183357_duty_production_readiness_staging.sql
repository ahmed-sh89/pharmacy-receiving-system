-- Staging only. Supersedes the unapplied STAGING_MANUAL_HOURS.sql proposal.
-- Approved preparation: execute on Staging only. No Production execution authorized.
-- Additive permission field; old RPC/client contracts keep working.
alter table public.pharmflow_pharmacy_permissions_v1
 add column duty text not null default 'DISABLED' check(duty in ('FULL','DISABLED'));

create or replace function pharmflow_duty_private.allowed(pid uuid,writing boolean default false)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select auth.uid() is not null and pharmflow_auth_private.password_change_complete()
 and exists(select 1 from public.pharmacies p join public.pharmflow_pharmacy_permissions_v1 a on a.pharmacy_id=p.id
 where p.id=pid and p.active and p.status='active' and a.duty='FULL')
 and (public.is_system_owner() or exists(select 1 from public.pharmacy_members m
 where m.pharmacy_id=pid and m.user_id=auth.uid() and m.active and (not writing or m.role='admin')));
$$;
revoke all on function pharmflow_duty_private.allowed(uuid,boolean) from public,anon,authenticated;

-- Separate v2 signature avoids breaking existing callers or RPC overload resolution.
-- Receiving/Expiry authorization functions and the v1 permission writer stay unchanged.
create function public.owner_set_pharmflow_permissions_v2(
 p_pharmacy_id uuid,p_receiving text,p_expiry text,p_data_access text,p_duty text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare oldrow public.pharmflow_pharmacy_permissions_v1;newrow public.pharmflow_pharmacy_permissions_v1;
begin
 if not pharmflow_auth_private.password_change_complete() or not public.is_system_owner() then
  raise exception 'System Administrator required' using errcode='42501';end if;
 if p_duty is null or p_duty not in ('FULL','DISABLED') then raise exception 'Select Duty Enabled or Disabled';end if;
 select * into oldrow from public.pharmflow_pharmacy_permissions_v1 where pharmacy_id=p_pharmacy_id for update;
 if not found then raise exception 'Pharmacy policy missing';end if;
 if p_expected_revision is null or oldrow.revision<>p_expected_revision then raise exception 'Permission policy changed; reload';end if;
 update public.pharmflow_pharmacy_permissions_v1 set receiving=p_receiving,expiry=p_expiry,data_access=p_data_access,duty=p_duty,
 revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where pharmacy_id=p_pharmacy_id returning * into newrow;
 insert into public.pharmflow_permission_audit_v1(pharmacy_id,actor,before_value,after_value)
 values(p_pharmacy_id,auth.uid(),to_jsonb(oldrow),to_jsonb(newrow));
 return to_jsonb(newrow);
end $$;
revoke all on function public.owner_set_pharmflow_permissions_v2(uuid,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.owner_set_pharmflow_permissions_v2(uuid,text,text,text,text,bigint) to authenticated;

create or replace function pharmflow_duty_private.validate_entry(p jsonb) returns void language plpgsql immutable set search_path=pg_catalog as $$
declare t jsonb;s int;e int;first_start int;last_end int;idx int=0;status text=p->>'status';lim int;manual jsonb=coalesce(p->'manual_minutes','{}'::jsonb);
begin
 if jsonb_typeof(p)<>'object' or status is null or status not in ('WORK','OFF','ANNUAL_LEAVE','SICK_LEAVE','OTHER_LEAVE','EMPTY') then raise exception 'Invalid Duty status';end if;
 if jsonb_typeof(p->'periods') is distinct from 'array' then raise exception 'Duty periods must be an array';end if;
 if jsonb_typeof(manual)<>'object' then raise exception 'Invalid manual hours';end if;
 if exists(select from jsonb_each(manual) as m(k,v)
  where k not in ('basic','normal_ot','friday_ot','holiday_ot')
  or case when jsonb_typeof(v)='number' and v::text~'^\d{1,4}$' then v::text::int>1440 else true end)
 then raise exception 'Manual hours must be integer minutes from 0 to 1440';end if;
 if status<>'WORK' and manual<>'{}'::jsonb then raise exception 'Manual hours require a working day';end if;
 if jsonb_array_length(p->'periods')>2 or (status='WORK' and jsonb_array_length(p->'periods')=0 and manual='{}'::jsonb and coalesce(p->'working_pending','false'::jsonb)<>'true'::jsonb) or (status<>'WORK' and jsonb_array_length(p->'periods')<>0) then raise exception 'Invalid working periods for Duty status';end if;
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

create or replace function pharmflow_duty_private.minutes(d date,p jsonb,holiday boolean) returns jsonb language plpgsql immutable set search_path=pg_catalog as $$
declare total int; breakdown jsonb;lim int=(p->>'basic_limit')::int;friday boolean=extract(isodow from d)=5 and not holiday;
begin
 select coalesce(sum((v->>'end')::int-(v->>'start')::int),0)::int into total from jsonb_array_elements(p->'periods') v;
 breakdown:=jsonb_build_object('basic',case when not friday and not holiday then least(total,lim) else 0 end,'normal_ot',case when not friday and not holiday then greatest(total-lim,0) else 0 end,'friday_ot',case when friday then total else 0 end,'holiday_ot',case when not friday and holiday then total else 0 end)||coalesce(p->'manual_minutes','{}'::jsonb);
 select sum(v::int) into total from jsonb_each_text(breakdown) as m(k,v);
 return breakdown||jsonb_build_object('total',total);
end $$;


-- Approved Staging preparation only. Additive Duty contracts; no operational backfill.
alter table public.pharmflow_duty_employees_v1
 add column display_code text,
 add column basic_minutes integer not null default 540 check(basic_minutes between 0 and 1440),
 add column basic_defaults jsonb not null default '[]';
create unique index duty_display_code_v1 on public.pharmflow_duty_employees_v1(pharmacy_id,lower(coalesce(display_code,code)));
alter table public.pharmflow_duty_holidays_v1 add column name text not null default '',add column note text not null default '';
create table public.pharmflow_duty_settings_v1(
 pharmacy_id uuid primary key references public.pharmacies(id),
 default_basic integer not null default 540 check(default_basic between 0 and 1440),
 hour_rules jsonb not null default '[]',revision bigint not null default 1
);
alter table public.pharmflow_duty_settings_v1 enable row level security;
revoke all on public.pharmflow_duty_settings_v1 from public,anon,authenticated;

create function pharmflow_duty_private.effective_minutes(pid uuid,d date,p jsonb,employee_code text,holiday boolean)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare e public.pharmflow_duty_employees_v1;lim integer;rule jsonb;first_start text;
begin
 select * into e from public.pharmflow_duty_employees_v1 where pharmacy_id=pid and code=employee_code;
 lim=e.basic_minutes;
 select (v->>'minutes')::int into lim from jsonb_array_elements(e.basic_defaults) v where (v->>'from')::date<=d order by v->>'from' desc limit 1;
 lim=coalesce(lim,e.basic_minutes,540);
 if jsonb_array_length(p->'periods')>0 then
  first_start=to_char(d,'YYYY-MM-DD')||'T'||to_char(time '00:00'+((p->'periods'->0->>'start')::int)*interval '1 minute','HH24:MI');
  select r.value into rule from public.pharmflow_duty_settings_v1 s cross join lateral jsonb_array_elements(s.hour_rules) with ordinality r(value,ord)
  where s.pharmacy_id=pid and r.value->>'start'<=first_start and r.value->>'end'>=first_start
  and (jsonb_array_length(r.value->'codes')=0 or (r.value->'codes') ? employee_code)
  order by (jsonb_array_length(r.value->'codes')>0) desc,r.ord desc limit 1;
  lim=coalesce((rule->>'basic')::int,lim);
 end if;
 if (p->>'basic_limit')::int<>540 then lim=(p->>'basic_limit')::int;end if;
 return pharmflow_duty_private.minutes(d,p||jsonb_build_object('basic_limit',lim),holiday);
end $$;

create function pharmflow_duty_private.completed_totals(pid uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_object_agg(e.code||'/'||e.date,pharmflow_duty_private.effective_minutes(pid,e.date,e.payload,e.code,coalesce(h.active,false))),'{}')
 from public.pharmflow_duty_entries_v1 e join public.pharmflow_duty_months_v1 m on m.pharmacy_id=e.pharmacy_id and m.month=date_trunc('month',e.date)::date and m.status='Completed'
 left join public.pharmflow_duty_holidays_v1 h on h.pharmacy_id=e.pharmacy_id and h.date=e.date where e.pharmacy_id=pid;
$$;

create function pharmflow_duty_private.validate_defaults(v jsonb) returns void language plpgsql immutable set search_path=pg_catalog as $$
declare r jsonb;prior text='';
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>500 then raise exception 'Invalid Basic defaults';end if;
 for r in select value from jsonb_array_elements(v) loop
  if coalesce(r->>'from','')!~'^\d{4}-\d{2}-\d{2}$' or (r->>'from')::date not between date '1900-01-01' and date '2199-12-31'
   or r->>'from'<=prior or jsonb_typeof(r->'minutes') is distinct from 'number' or coalesce(r->>'minutes','')!~'^\d{1,4}$' or (r->>'minutes')::int>1440 then raise exception 'Invalid Basic effective date or minutes';end if;
  prior=r->>'from';
 end loop;
end $$;

create function public.save_pharmflow_duty_settings_v1(p_pharmacy_id uuid,p_default_basic integer,p_hour_rules jsonb,p_employee_defaults jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare oldrow public.pharmflow_duty_settings_v1;newrow public.pharmflow_duty_settings_v1;r jsonb;c jsonb;before_completed jsonb;oldemp public.pharmflow_duty_employees_v1;newemp public.pharmflow_duty_employees_v1;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 select * into oldrow from public.pharmflow_duty_settings_v1 where pharmacy_id=p_pharmacy_id for update;
 if p_expected_revision is null or p_expected_revision<>coalesce(oldrow.revision,0) then raise exception 'DUTY_CONFLICT';end if;
 if p_default_basic is null or p_default_basic not between 0 and 1440 or jsonb_typeof(p_hour_rules) is distinct from 'array' or jsonb_array_length(p_hour_rules)>500
  or jsonb_typeof(p_employee_defaults) is distinct from 'array' or jsonb_array_length(p_employee_defaults)>1000 then raise exception 'Invalid Duty settings';end if;
 for r in select value from jsonb_array_elements(p_hour_rules) loop
  if length(trim(coalesce(r->>'name','')))=0 or length(r->>'name')>80 or jsonb_typeof(r->'basic') is distinct from 'number' or coalesce(r->>'basic','')!~'^\d{1,4}$' or (r->>'basic')::int>1440
   or coalesce(r->>'start','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' or coalesce(r->>'end','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' or r->>'start'>r->>'end'
   or jsonb_typeof(r->'codes') is distinct from 'array' then raise exception 'Invalid Duty hour rule';end if;
  perform (r->>'start')::timestamp,(r->>'end')::timestamp;
  if exists(select 1 from jsonb_array_elements(r->'codes') x where jsonb_typeof(x)<>'string' or not exists(select 1 from public.pharmflow_duty_employees_v1 e where e.pharmacy_id=p_pharmacy_id and e.code=x#>>'{}')) then raise exception 'Unknown rule employee';end if;
 end loop;
 before_completed=pharmflow_duty_private.completed_totals(p_pharmacy_id);
 insert into public.pharmflow_duty_settings_v1(pharmacy_id,default_basic,hour_rules) values(p_pharmacy_id,p_default_basic,p_hour_rules)
 on conflict(pharmacy_id) do update set default_basic=excluded.default_basic,hour_rules=excluded.hour_rules,revision=pharmflow_duty_settings_v1.revision+1 returning * into newrow;
 for c in select value from jsonb_array_elements(p_employee_defaults) loop
  select * into oldemp from public.pharmflow_duty_employees_v1 where pharmacy_id=p_pharmacy_id and code=c->>'code' for update;
  if not found or not oldemp.active then raise exception 'Unknown or inactive Duty employee';end if;
  if c->>'expected_revision' is null or (c->>'expected_revision')::bigint<>oldemp.revision then raise exception 'DUTY_CONFLICT';end if;
  perform pharmflow_duty_private.validate_defaults(c->'defaults');
  -- Bulk changes preserve the exact historical prefix and take effect today or later.
  if exists(select 1 from jsonb_array_elements(c->'defaults') v where (v->>'from')::date<(now() at time zone 'Asia/Riyadh')::date and not oldemp.basic_defaults @> jsonb_build_array(v))
   or exists(select 1 from jsonb_array_elements(oldemp.basic_defaults) v where (v->>'from')::date<(now() at time zone 'Asia/Riyadh')::date and not (c->'defaults') @> jsonb_build_array(v)) then raise exception 'Historical Basic defaults must be preserved';end if;
  update public.pharmflow_duty_employees_v1 set basic_defaults=c->'defaults',revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and code=oldemp.code returning * into newemp;
  insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,'employee-defaults',oldemp.code,auth.uid(),to_jsonb(oldemp),to_jsonb(newemp));
 end loop;
 if before_completed<>pharmflow_duty_private.completed_totals(p_pharmacy_id) then raise exception 'Reopen completed Duty months before changing their hours';end if;
 insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,'settings','settings',auth.uid(),case when oldrow.pharmacy_id is null then null else to_jsonb(oldrow) end,to_jsonb(newrow));
 return to_jsonb(newrow);
end $$;

create function public.save_pharmflow_duty_employee_v2(p_pharmacy_id uuid,p_code text,p_display_code text,p_name text,p_position_key text,p_active boolean,p_basic_minutes integer,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;oldemp public.pharmflow_duty_employees_v1;newemp public.pharmflow_duty_employees_v1;before_completed jsonb;today date=(now() at time zone 'Asia/Riyadh')::date;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501';end if;
 if p_display_code is null or p_display_code!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$' or p_basic_minutes is null or p_basic_minutes not between 0 and 1440 then raise exception 'Invalid Duty employee details';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 select * into oldemp from public.pharmflow_duty_employees_v1 where pharmacy_id=p_pharmacy_id and code=p_code;
 before_completed=pharmflow_duty_private.completed_totals(p_pharmacy_id);
 result=public.save_pharmflow_duty_employee_v1(p_pharmacy_id,p_code,p_name,p_position_key,p_active,p_expected_revision);
 update public.pharmflow_duty_employees_v1 set display_code=p_display_code,
 basic_minutes=case when oldemp.code is null then p_basic_minutes else basic_minutes end,
 basic_defaults=case when oldemp.code is null or p_basic_minutes=coalesce((select (v->>'minutes')::int from jsonb_array_elements(basic_defaults) v order by v->>'from' desc limit 1),basic_minutes) then basic_defaults else
 coalesce((select jsonb_agg(v order by v->>'from') from jsonb_array_elements(basic_defaults) v where (v->>'from')::date<today),'[]')||jsonb_build_array(jsonb_build_object('from',today,'minutes',p_basic_minutes)) end
 where pharmacy_id=p_pharmacy_id and code=p_code returning * into newemp;
 if before_completed<>pharmflow_duty_private.completed_totals(p_pharmacy_id) then raise exception 'Reopen completed Duty months before changing their hours';end if;
 insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,'employee-settings',p_code,auth.uid(),case when oldemp.code is null then null else to_jsonb(oldemp) end,to_jsonb(newemp));
 return to_jsonb(newemp);
end $$;

create function public.set_pharmflow_duty_holidays_v2(p_pharmacy_id uuid,p_dates jsonb,p_active boolean,p_name text,p_note text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r jsonb;d date;result jsonb;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501';end if;
 if p_active is null or p_name is null or p_note is null or (p_active and length(trim(p_name))=0) or length(p_name)>80 or length(p_note)>300 or jsonb_typeof(p_dates) is distinct from 'array' or jsonb_array_length(p_dates) not between 1 and 366 then raise exception 'Invalid Duty holiday range';end if;
 if (select count(distinct v->>'date') from jsonb_array_elements(p_dates) v)<>jsonb_array_length(p_dates) then raise exception 'Duplicate holiday date';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 for r in select value from jsonb_array_elements(p_dates) loop
  d=(r->>'date')::date;
  result=public.set_pharmflow_duty_holiday_v1(p_pharmacy_id,d,p_active,(r->>'expected_revision')::bigint);
  update public.pharmflow_duty_holidays_v1 set name=trim(p_name),note=trim(p_note) where pharmacy_id=p_pharmacy_id and date=d;
  insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,'holiday-details',d::text,auth.uid(),result,result||jsonb_build_object('name',trim(p_name),'note',trim(p_note)));
 end loop;
 return jsonb_build_object('saved',jsonb_array_length(p_dates));
end $$;

revoke all on function pharmflow_duty_private.effective_minutes(uuid,date,jsonb,text,boolean),pharmflow_duty_private.completed_totals(uuid),pharmflow_duty_private.validate_defaults(jsonb) from public,anon,authenticated;
revoke all on function public.save_pharmflow_duty_settings_v1(uuid,integer,jsonb,jsonb,bigint),public.save_pharmflow_duty_employee_v2(uuid,text,text,text,text,boolean,integer,bigint),public.set_pharmflow_duty_holidays_v2(uuid,jsonb,boolean,text,text) from public,anon,authenticated;
grant execute on function public.save_pharmflow_duty_settings_v1(uuid,integer,jsonb,jsonb,bigint),public.save_pharmflow_duty_employee_v2(uuid,text,text,text,text,boolean,integer,bigint),public.set_pharmflow_duty_holidays_v2(uuid,jsonb,boolean,text,text) to authenticated;


create or replace function public.get_pharmflow_duty_schedule_v1(p_pharmacy_id uuid,p_month date) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;finish date=(p_month+interval '1 month')::date;s public.pharmflow_duty_settings_v1;
begin
 result=public.get_pharmflow_duty_foundation_v1(p_pharmacy_id,p_month);
 select * into s from public.pharmflow_duty_settings_v1 where pharmacy_id=p_pharmacy_id;
 return result||jsonb_build_object('manual_hours',true,'working_pending',true,'holiday_first',true,'persistent_settings',true,
 'default_basic',coalesce(s.default_basic,540),'hour_rules',coalesce(s.hour_rules,'[]'::jsonb),'settings_revision',coalesce(s.revision,0),
 'entries',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('minutes',pharmflow_duty_private.effective_minutes(p_pharmacy_id,e.date,e.payload,e.code,coalesce(h.active,false))) order by e.date,e.code) from public.pharmflow_duty_entries_v1 e left join public.pharmflow_duty_holidays_v1 h on h.pharmacy_id=e.pharmacy_id and h.date=e.date where e.pharmacy_id=p_pharmacy_id and e.date>=p_month and e.date<finish),'[]'::jsonb),
 'holidays',coalesce((select jsonb_agg(to_jsonb(h) order by h.date) from public.pharmflow_duty_holidays_v1 h where h.pharmacy_id=p_pharmacy_id and h.date>=p_month and h.date<finish),'[]'::jsonb));
end $$;

