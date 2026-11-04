-- Proposed for Duty Staging only. Apply after Product Owner approval.
-- No table, data, ACL, auth or audit changes. Legacy payloads remain valid.
begin;
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
 if jsonb_array_length(p->'periods')>2 or (status='WORK' and jsonb_array_length(p->'periods')=0 and manual='{}'::jsonb) or (status<>'WORK' and jsonb_array_length(p->'periods')<>0) then raise exception 'Invalid working periods for Duty status';end if;
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
declare total int; breakdown jsonb;lim int=(p->>'basic_limit')::int;friday boolean=extract(isodow from d)=5;
begin
 select coalesce(sum((v->>'end')::int-(v->>'start')::int),0)::int into total from jsonb_array_elements(p->'periods') v;
 breakdown:=jsonb_build_object('basic',case when not friday and not holiday then least(total,lim) else 0 end,'normal_ot',case when not friday and not holiday then greatest(total-lim,0) else 0 end,'friday_ot',case when friday then total else 0 end,'holiday_ot',case when not friday and holiday then total else 0 end)||coalesce(p->'manual_minutes','{}'::jsonb);
 select sum(v::int) into total from jsonb_each_text(breakdown) as m(k,v);
 return breakdown||jsonb_build_object('total',total);
end $$;

create or replace function public.get_pharmflow_duty_schedule_v1(p_pharmacy_id uuid,p_month date) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;finish date=(p_month+interval '1 month')::date;
begin
 result=public.get_pharmflow_duty_foundation_v1(p_pharmacy_id,p_month);
 return result||jsonb_build_object('manual_hours',true,'entries',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('minutes',pharmflow_duty_private.minutes(e.date,e.payload,coalesce(h.active,false))) order by e.date,e.code) from public.pharmflow_duty_entries_v1 e left join public.pharmflow_duty_holidays_v1 h on h.pharmacy_id=e.pharmacy_id and h.date=e.date where e.pharmacy_id=p_pharmacy_id and e.date>=p_month and e.date<finish),'[]'::jsonb),
 'holidays',coalesce((select jsonb_agg(to_jsonb(h) order by h.date) from public.pharmflow_duty_holidays_v1 h where h.pharmacy_id=p_pharmacy_id and h.date>=p_month and h.date<finish),'[]'::jsonb));
end $$;

commit;
