-- Staging only. Additive directory lifecycle and schedule-only labels.
-- Existing names, immutable IDs, sort order, entries and historical snapshots are untouched.
alter table public.pharmflow_duty_employees_v1 add column archived boolean not null default false,
 add column schedule_display_name text not null default '' check(length(schedule_display_name)<=80),
 add constraint duty_employee_archive_inactive check(not (archived and active));
alter table public.pharmflow_duty_positions_v1 add column archived boolean not null default false,
 add constraint duty_position_archive_inactive check(not (archived and active));

create function public.save_pharmflow_duty_employee_v3(p_pharmacy_id uuid,p_code text,p_display_code text,p_name text,p_position_key text,p_active boolean,p_basic_minutes integer,p_expected_revision bigint,p_schedule_display_name text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare before_row jsonb; result jsonb;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501';end if;
 if p_schedule_display_name is null or length(trim(p_schedule_display_name))>80 then raise exception 'Schedule display name must be 80 characters or fewer';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 select to_jsonb(e) into before_row from public.pharmflow_duty_employees_v1 e where pharmacy_id=p_pharmacy_id and code=p_code;
 if coalesce((before_row->>'archived')::boolean,false) then raise exception 'Restore archived employee before editing';end if;
 perform public.save_pharmflow_duty_employee_v2(p_pharmacy_id,p_code,p_display_code,p_name,p_position_key,p_active,p_basic_minutes,p_expected_revision);
 update public.pharmflow_duty_employees_v1 set schedule_display_name=trim(p_schedule_display_name) where pharmacy_id=p_pharmacy_id and code=p_code returning to_jsonb(pharmflow_duty_employees_v1.*) into result;
 insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,'employee-display',p_code,auth.uid(),before_row,result);
 return result;
end $$;

create function public.manage_pharmflow_duty_directory_v2(p_pharmacy_id uuid,p_kind text,p_action text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r jsonb;oldrow jsonb;newrow jsonb;used boolean;label text;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501';end if;
 if p_kind is null or p_kind not in ('employee','position') or p_action is null or p_action not in ('reorder','archive','restore','delete') or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid Duty directory operation';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 if p_action='reorder' then return public.manage_pharmflow_duty_directory_v1(p_pharmacy_id,p_kind,p_action,p_rows);end if;
 if jsonb_array_length(p_rows)<>1 then raise exception 'Select one Duty directory record';end if;
 r=p_rows->0;
 if p_kind='employee' then select to_jsonb(e) into oldrow from public.pharmflow_duty_employees_v1 e where pharmacy_id=p_pharmacy_id and code=r->>'key' for update;
 else select to_jsonb(e) into oldrow from public.pharmflow_duty_positions_v1 e where pharmacy_id=p_pharmacy_id and key=r->>'key' for update;end if;
 if r->>'expected_revision' is null or (r->>'expected_revision')::bigint<>coalesce((oldrow->>'revision')::bigint,0) then raise exception 'DUTY_CONFLICT';end if;
 if oldrow is null then
  label=case r->>'key' when 'pharmacist' then 'Pharmacist' when 'labor' then 'Labor' when 'beauty-advisor' then 'Beauty Advisor' end;
  if p_kind<>'position' or label is null then raise exception 'Unknown Duty directory record';end if;
  perform public.save_pharmflow_duty_position_v1(p_pharmacy_id,r->>'key',label,true,0);
  select to_jsonb(e) into oldrow from public.pharmflow_duty_positions_v1 e where pharmacy_id=p_pharmacy_id and key=r->>'key';
  -- The virtual default was materialized under the same pharmacy lock.
  r=jsonb_set(r,'{expected_revision}',oldrow->'revision');
 end if;
 if p_action='delete' then
  if p_kind='employee' then
   used=exists(select 1 from public.pharmflow_duty_entries_v1 where pharmacy_id=p_pharmacy_id and code=r->>'key')
    or exists(select 1 from public.pharmflow_duty_settings_v1 s cross join lateral jsonb_array_elements(s.hour_rules) v where s.pharmacy_id=p_pharmacy_id and (v->'codes') ? (r->>'key'));
  else
   used=(r->>'key') in ('pharmacist','labor','beauty-advisor')
    or exists(select 1 from public.pharmflow_duty_employees_v1 where pharmacy_id=p_pharmacy_id and position_key=r->>'key')
    or exists(select 1 from public.pharmflow_duty_entries_v1 where pharmacy_id=p_pharmacy_id and identity->>'position_key'=r->>'key');
  end if;
  if used then raise exception 'Historical dependencies exist. Use Archive instead.';end if;
  return public.manage_pharmflow_duty_directory_v1(p_pharmacy_id,p_kind,'delete',jsonb_build_array(r));
 end if;
 if p_kind='employee' then update public.pharmflow_duty_employees_v1 set archived=p_action='archive',active=false,revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and code=r->>'key' returning to_jsonb(pharmflow_duty_employees_v1.*) into newrow;
 else update public.pharmflow_duty_positions_v1 set archived=p_action='archive',active=false,revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and key=r->>'key' returning to_jsonb(pharmflow_duty_positions_v1.*) into newrow;end if;
 insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,p_kind||'-'||p_action,r->>'key',auth.uid(),oldrow,newrow);
 return newrow;
end $$;
-- Keep old clients from invoking the superseded delete/archive semantics directly.
revoke execute on function public.manage_pharmflow_duty_directory_v1(uuid,text,text,jsonb) from authenticated;
revoke all on function public.save_pharmflow_duty_employee_v3(uuid,text,text,text,text,boolean,integer,bigint,text),public.manage_pharmflow_duty_directory_v2(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_pharmflow_duty_employee_v3(uuid,text,text,text,text,boolean,integer,bigint,text),public.manage_pharmflow_duty_directory_v2(uuid,text,text,jsonb) to authenticated;

create or replace function public.get_pharmflow_duty_foundation_v1(p_pharmacy_id uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id) then raise exception 'Duty pharmacy access required' using errcode='42501'; end if;
 if p_month is null or extract(day from p_month)<>1 then raise exception 'Duty month must start on day 1'; end if;
 with defaults(key,label,active,revision,sort_order,archived) as (values('pharmacist','Pharmacist',true,0::bigint,1000,false),('labor','Labor',true,0::bigint,1000,false),('beauty-advisor','Beauty Advisor',true,0::bigint,1000,false)),
 positions as (
 select key,label,active,revision,sort_order,archived from public.pharmflow_duty_positions_v1 where pharmacy_id=p_pharmacy_id
 union all select * from defaults d where not exists(select 1 from public.pharmflow_duty_positions_v1 p where p.pharmacy_id=p_pharmacy_id and p.key=d.key)
 )
 select jsonb_build_object('pharmacy_id',p_pharmacy_id,'can_write',pharmflow_duty_private.allowed(p_pharmacy_id,true),
 'positions',coalesce((select jsonb_agg(to_jsonb(p) order by case key when 'pharmacist' then 1 when 'labor' then 2 when 'beauty-advisor' then 3 else 4 end,label) from positions p),'[]'::jsonb),
 'employees',coalesce((select jsonb_agg(to_jsonb(e) order by name,code) from public.pharmflow_duty_employees_v1 e where pharmacy_id=p_pharmacy_id),'[]'::jsonb),
 'month',(select to_jsonb(m) from public.pharmflow_duty_months_v1 m where pharmacy_id=p_pharmacy_id and month=p_month)) into result;
 return result;
end $$;


