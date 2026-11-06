-- Staging-only additive Duty ordering and safe directory management.
alter table public.pharmflow_duty_employees_v1 add column sort_order integer not null default 1000;
alter table public.pharmflow_duty_positions_v1 add column sort_order integer not null default 1000;

-- Same audited writer and CAS contract, one network round-trip for write + authoritative read.
create function public.save_pharmflow_duty_schedule_v2(p_pharmacy_id uuid,p_month date,p_changes jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.save_pharmflow_duty_entries_v1(p_pharmacy_id,p_changes,p_reason);
 return public.get_pharmflow_duty_schedule_v1(p_pharmacy_id,p_month);
end $$;

create function public.manage_pharmflow_duty_directory_v1(p_pharmacy_id uuid,p_kind text,p_action text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r jsonb;oldrow jsonb;newrow jsonb;n integer=0;used boolean;defaults text;result text='reordered';
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501';end if;
 if p_kind is null or p_kind not in ('employee','position') or p_action is null or p_action not in ('reorder','delete') or jsonb_typeof(p_rows) is distinct from 'array'
  or jsonb_array_length(p_rows) not between 1 and 1000 or (p_action='delete' and jsonb_array_length(p_rows)<>1) then raise exception 'Invalid Duty directory operation';end if;
 if (select count(distinct v->>'key') from jsonb_array_elements(p_rows) v)<>jsonb_array_length(p_rows) then raise exception 'Duplicate Duty directory record';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 if p_action='reorder' then
  if p_kind='employee' and (select count(*) from public.pharmflow_duty_employees_v1 where pharmacy_id=p_pharmacy_id)<>jsonb_array_length(p_rows) then raise exception 'Duty roster changed; refresh';end if;
  if p_kind='position' and jsonb_array_length(p_rows)<>(select count(*) from public.pharmflow_duty_positions_v1 where pharmacy_id=p_pharmacy_id)+(select count(*) from (values('pharmacist'),('labor'),('beauty-advisor')) d(k) where not exists(select 1 from public.pharmflow_duty_positions_v1 p where p.pharmacy_id=p_pharmacy_id and p.key=d.k)) then raise exception 'Duty positions changed; refresh';end if;
 end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if p_kind='employee' then select to_jsonb(e) into oldrow from public.pharmflow_duty_employees_v1 e where pharmacy_id=p_pharmacy_id and code=r->>'key' for update;
  else select to_jsonb(e) into oldrow from public.pharmflow_duty_positions_v1 e where pharmacy_id=p_pharmacy_id and key=r->>'key' for update;end if;
  if r->>'expected_revision' is null or (r->>'expected_revision')::bigint<>coalesce((oldrow->>'revision')::bigint,0) then raise exception 'DUTY_CONFLICT';end if;
  if oldrow is null then
   defaults=case r->>'key' when 'pharmacist' then 'Pharmacist' when 'labor' then 'Labor' when 'beauty-advisor' then 'Beauty Advisor' end;
   if p_kind<>'position' or defaults is null then raise exception 'Unknown Duty directory record';end if;
   perform public.save_pharmflow_duty_position_v1(p_pharmacy_id,r->>'key',defaults,true,0);
   select to_jsonb(e) into oldrow from public.pharmflow_duty_positions_v1 e where pharmacy_id=p_pharmacy_id and key=r->>'key';
  end if;
  if p_action='reorder' then
   if p_kind='employee' then update public.pharmflow_duty_employees_v1 set sort_order=n,revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and code=r->>'key' returning to_jsonb(pharmflow_duty_employees_v1.*) into newrow;
   else update public.pharmflow_duty_positions_v1 set sort_order=n,revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and key=r->>'key' returning to_jsonb(pharmflow_duty_positions_v1.*) into newrow;end if;
  else
   if p_kind='employee' then
    used=exists(select 1 from public.pharmflow_duty_entries_v1 where pharmacy_id=p_pharmacy_id and code=r->>'key')
     or exists(select 1 from public.pharmflow_duty_settings_v1 s cross join lateral jsonb_array_elements(s.hour_rules) v where s.pharmacy_id=p_pharmacy_id and (v->'codes') ? (r->>'key'));
    if used then update public.pharmflow_duty_employees_v1 set active=false,revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and code=r->>'key' returning to_jsonb(pharmflow_duty_employees_v1.*) into newrow;
    else delete from public.pharmflow_duty_employees_v1 where pharmacy_id=p_pharmacy_id and code=r->>'key';end if;
   else
    used=(r->>'key') in ('pharmacist','labor','beauty-advisor') or exists(select 1 from public.pharmflow_duty_employees_v1 where pharmacy_id=p_pharmacy_id and position_key=r->>'key');
    if used then update public.pharmflow_duty_positions_v1 set active=false,revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and key=r->>'key' returning to_jsonb(pharmflow_duty_positions_v1.*) into newrow;
    else delete from public.pharmflow_duty_positions_v1 where pharmacy_id=p_pharmacy_id and key=r->>'key';end if;
   end if;
   result=case when used then 'archived' else 'deleted' end;
   if not used then newrow=jsonb_build_object('deleted',true,'key',r->>'key');end if;
  end if;
  insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record)
  values(p_pharmacy_id,p_kind||'-'||p_action,r->>'key',auth.uid(),oldrow,newrow);
  n=n+1;
 end loop;
 return jsonb_build_object('result',result,'count',n);
end $$;
revoke all on function public.save_pharmflow_duty_schedule_v2(uuid,date,jsonb,text),public.manage_pharmflow_duty_directory_v1(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_pharmflow_duty_schedule_v2(uuid,date,jsonb,text),public.manage_pharmflow_duty_directory_v1(uuid,text,text,jsonb) to authenticated;

create or replace function public.get_pharmflow_duty_foundation_v1(p_pharmacy_id uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id) then raise exception 'Duty pharmacy access required' using errcode='42501'; end if;
 if p_month is null or extract(day from p_month)<>1 then raise exception 'Duty month must start on day 1'; end if;
 with defaults(key,label,active,revision,sort_order) as (values('pharmacist','Pharmacist',true,0::bigint,1000),('labor','Labor',true,0::bigint,1000),('beauty-advisor','Beauty Advisor',true,0::bigint,1000)),
 positions as (
 select key,label,active,revision,sort_order from public.pharmflow_duty_positions_v1 where pharmacy_id=p_pharmacy_id
 union all select * from defaults d where not exists(select 1 from public.pharmflow_duty_positions_v1 p where p.pharmacy_id=p_pharmacy_id and p.key=d.key)
 )
 select jsonb_build_object('pharmacy_id',p_pharmacy_id,'can_write',pharmflow_duty_private.allowed(p_pharmacy_id,true),
 'positions',coalesce((select jsonb_agg(to_jsonb(p) order by case key when 'pharmacist' then 1 when 'labor' then 2 when 'beauty-advisor' then 3 else 4 end,label) from positions p),'[]'::jsonb),
 'employees',coalesce((select jsonb_agg(to_jsonb(e) order by name,code) from public.pharmflow_duty_employees_v1 e where pharmacy_id=p_pharmacy_id),'[]'::jsonb),
 'month',(select to_jsonb(m) from public.pharmflow_duty_months_v1 m where pharmacy_id=p_pharmacy_id and month=p_month)) into result;
 return result;
end $$;


