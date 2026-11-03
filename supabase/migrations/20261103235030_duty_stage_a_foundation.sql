-- Duty Stage A only. Apply exclusively to tovkcakucyagvbzvlnks.
-- No existing application table, permission, operational record or function is modified.
create schema if not exists pharmflow_duty_private;
revoke all on schema pharmflow_duty_private from public,anon,authenticated;

create table public.pharmflow_duty_positions_v1 (
 pharmacy_id uuid not null references public.pharmacies(id),
 key text not null check(length(key) between 1 and 60),
 label text not null check(length(trim(label)) between 1 and 60),
 active boolean not null default true,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 primary key(pharmacy_id,key)
);
create unique index duty_position_label_v1 on public.pharmflow_duty_positions_v1(pharmacy_id,lower(trim(label)));
create table public.pharmflow_duty_employees_v1 (
 pharmacy_id uuid not null references public.pharmacies(id),
 code text not null check(code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
 name text not null check(length(trim(name)) between 1 and 120),
 position_key text not null,
 active boolean not null default true,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 primary key(pharmacy_id,code),
 foreign key(pharmacy_id,position_key) references public.pharmflow_duty_positions_v1(pharmacy_id,key)
);
create unique index duty_employee_code_v1 on public.pharmflow_duty_employees_v1(pharmacy_id,lower(code));
create table public.pharmflow_duty_months_v1 (
 pharmacy_id uuid not null references public.pharmacies(id),
 month date not null check(extract(day from month)=1),
 status text not null default 'Draft' check(status in ('Draft','Active','Completed')),
 revision bigint not null default 1,
 primary key(pharmacy_id,month)
);
-- No month write API in Stage A. Navigation is read only and never creates/copies a month.
create table public.pharmflow_duty_audit_v1 (
 id bigint generated always as identity primary key,
 pharmacy_id uuid not null references public.pharmacies(id),
 entity text not null,
 entity_key text not null,
 actor_id uuid not null,
 changed_at timestamptz not null default now(),
 before_record jsonb,
 after_record jsonb not null
);
create index duty_audit_pharmacy_v1 on public.pharmflow_duty_audit_v1(pharmacy_id,changed_at desc);

alter table public.pharmflow_duty_positions_v1 enable row level security;
alter table public.pharmflow_duty_employees_v1 enable row level security;
alter table public.pharmflow_duty_months_v1 enable row level security;
alter table public.pharmflow_duty_audit_v1 enable row level security;
revoke all on public.pharmflow_duty_positions_v1,public.pharmflow_duty_employees_v1,public.pharmflow_duty_months_v1,public.pharmflow_duty_audit_v1 from public,anon,authenticated;
revoke all on sequence public.pharmflow_duty_audit_v1_id_seq from public,anon,authenticated;
-- RPC-only access; no client role receives table/sequence grants. RLS default deny is deliberate.

create function pharmflow_duty_private.allowed(pid uuid,writing boolean default false)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select auth.uid() is not null and pharmflow_auth_private.password_change_complete()
 and exists(select 1 from public.pharmacies p where p.id=pid and p.active and p.status='active')
 and (public.is_system_owner() or exists(select 1 from public.pharmacy_members m
 where m.pharmacy_id=pid and m.user_id=auth.uid() and m.active and (not writing or m.role='admin')));
$$;
revoke all on function pharmflow_duty_private.allowed(uuid,boolean) from public,anon,authenticated;

create function public.get_pharmflow_duty_foundation_v1(p_pharmacy_id uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id) then raise exception 'Duty pharmacy access required' using errcode='42501'; end if;
 if p_month is null or extract(day from p_month)<>1 then raise exception 'Duty month must start on day 1'; end if;
 with defaults(key,label,active,revision) as (values('pharmacist','Pharmacist',true,0::bigint),('labor','Labor',true,0::bigint),('beauty-advisor','Beauty Advisor',true,0::bigint)),
 positions as (
 select key,label,active,revision from public.pharmflow_duty_positions_v1 where pharmacy_id=p_pharmacy_id
 union all select * from defaults d where not exists(select 1 from public.pharmflow_duty_positions_v1 p where p.pharmacy_id=p_pharmacy_id and p.key=d.key)
 )
 select jsonb_build_object('pharmacy_id',p_pharmacy_id,'can_write',pharmflow_duty_private.allowed(p_pharmacy_id,true),
 'positions',coalesce((select jsonb_agg(to_jsonb(p) order by case key when 'pharmacist' then 1 when 'labor' then 2 when 'beauty-advisor' then 3 else 4 end,label) from positions p),'[]'::jsonb),
 'employees',coalesce((select jsonb_agg(to_jsonb(e) order by name,code) from public.pharmflow_duty_employees_v1 e where pharmacy_id=p_pharmacy_id),'[]'::jsonb),
 'month',(select to_jsonb(m) from public.pharmflow_duty_months_v1 m where pharmacy_id=p_pharmacy_id and month=p_month)) into result;
 return result;
end $$;

create function public.save_pharmflow_duty_position_v1(p_pharmacy_id uuid,p_key text,p_label text,p_active boolean,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare oldrow public.pharmflow_duty_positions_v1;newrow public.pharmflow_duty_positions_v1;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 select * into oldrow from public.pharmflow_duty_positions_v1 where pharmacy_id=p_pharmacy_id and key=p_key for update;
 if p_expected_revision is null or p_expected_revision<>coalesce(oldrow.revision,0) then raise exception 'DUTY_CONFLICT'; end if;
 if oldrow.key is null then
  insert into public.pharmflow_duty_positions_v1(pharmacy_id,key,label,active) values(p_pharmacy_id,p_key,trim(p_label),p_active) returning * into newrow;
 else
  update public.pharmflow_duty_positions_v1 set label=trim(p_label),active=p_active,revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and key=p_key returning * into newrow;
 end if;
 insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,'position',p_key,auth.uid(),case when oldrow.key is null then null else to_jsonb(oldrow) end,to_jsonb(newrow));
 return to_jsonb(newrow);
end $$;

create function public.save_pharmflow_duty_employee_v1(p_pharmacy_id uuid,p_code text,p_name text,p_position_key text,p_active boolean,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare oldrow public.pharmflow_duty_employees_v1;newrow public.pharmflow_duty_employees_v1;position_active boolean;default_label text;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 p_code=trim(p_code);
 select * into oldrow from public.pharmflow_duty_employees_v1 where pharmacy_id=p_pharmacy_id and code=p_code for update;
 if p_expected_revision is null or p_expected_revision<>coalesce(oldrow.revision,0) then raise exception 'DUTY_CONFLICT'; end if;
 default_label=case p_position_key when 'pharmacist' then 'Pharmacist' when 'labor' then 'Labor' when 'beauty-advisor' then 'Beauty Advisor' end;
 if default_label is not null and not exists(select 1 from public.pharmflow_duty_positions_v1 where pharmacy_id=p_pharmacy_id and key=p_position_key) then
  insert into public.pharmflow_duty_positions_v1(pharmacy_id,key,label) values(p_pharmacy_id,p_position_key,default_label);
 end if;
 select active into position_active from public.pharmflow_duty_positions_v1 where pharmacy_id=p_pharmacy_id and key=p_position_key;
 if position_active is null or (not position_active and (oldrow.code is null or oldrow.position_key<>p_position_key)) then raise exception 'Select an active Duty position'; end if;
 if oldrow.code is null then
  insert into public.pharmflow_duty_employees_v1(pharmacy_id,code,name,position_key,active) values(p_pharmacy_id,p_code,trim(p_name),p_position_key,p_active) returning * into newrow;
 else
  update public.pharmflow_duty_employees_v1 set name=trim(p_name),position_key=p_position_key,active=p_active,revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and code=p_code returning * into newrow;
 end if;
 insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,'employee',p_code,auth.uid(),case when oldrow.code is null then null else to_jsonb(oldrow) end,to_jsonb(newrow));
 return to_jsonb(newrow);
end $$;
revoke all on function public.get_pharmflow_duty_foundation_v1(uuid,date),public.save_pharmflow_duty_position_v1(uuid,text,text,boolean,bigint),public.save_pharmflow_duty_employee_v1(uuid,text,text,text,boolean,bigint) from public,anon,authenticated;
grant execute on function public.get_pharmflow_duty_foundation_v1(uuid,date),public.save_pharmflow_duty_position_v1(uuid,text,text,boolean,bigint),public.save_pharmflow_duty_employee_v1(uuid,text,text,text,boolean,bigint) to authenticated;
