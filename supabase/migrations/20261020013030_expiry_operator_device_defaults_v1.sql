-- Staging-only, additive. No historical operations, attribution, or inventory rows are changed.
alter table public.pharmflow_expiry_workers_v1 add column system_key text;
alter table public.pharmflow_expiry_workers_v1 add constraint expiry_worker_system_key_check check(system_key is null or system_key in ('DESKTOP','HANDHELD'));
create unique index expiry_worker_system_key_v1 on public.pharmflow_expiry_workers_v1(pharmacy_id,system_key) where system_key is not null;

create or replace function pharmflow_expiry_private.protect_system_operator_v1() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if TG_OP='DELETE' then
  if old.system_key is not null then raise exception 'Built-in Operators cannot be removed';end if;
  return old;
 end if;
 if TG_OP='UPDATE' and old.system_key is not null and
   (new.worker_name is distinct from old.worker_name or new.active is distinct from old.active or new.pharmacy_id is distinct from old.pharmacy_id or new.system_key is distinct from old.system_key) then
   raise exception 'Built-in Operators cannot be changed';
 end if;
 if new.system_key is null and lower(btrim(new.worker_name)) in ('desktop','handheld') then raise exception 'This name is reserved for a built-in Operator';end if;
 if new.system_key is not null and (new.worker_name<>case new.system_key when 'DESKTOP' then 'Desktop' else 'Handheld' end or new.active is not true) then raise exception 'Invalid built-in Operator';end if;
 return new;
end $$;
revoke all on function pharmflow_expiry_private.protect_system_operator_v1() from public,anon,authenticated;
create trigger expiry_system_operator_guard_v1 before insert or update or delete on public.pharmflow_expiry_workers_v1 for each row execute function pharmflow_expiry_private.protect_system_operator_v1();

create or replace function public.list_pharmacy_expiry_workers(p_pharmacy_id uuid)
returns table(worker_id uuid,worker_name text,active boolean)
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 -- Same lock used by existing management RPCs. Stable rows, not a client-only attribution.
 perform pg_advisory_xact_lock(hashtextextended('expiry-operators/'||p_pharmacy_id::text,0));
 with added as (
  insert into public.pharmflow_expiry_workers_v1 as inserted(pharmacy_id,worker_name,active,created_by,system_key)
  select p_pharmacy_id,v.name,true,auth.uid(),v.key from (values('Desktop','DESKTOP'),('Handheld','HANDHELD')) v(name,key)
  where not exists(select 1 from public.pharmflow_expiry_workers_v1 w where w.pharmacy_id=p_pharmacy_id and w.system_key=v.key)
  returning inserted.id,inserted.pharmacy_id,inserted.worker_name
 ) insert into pharmflow_expiry_private.operator_audit_v1(pharmacy_id,worker_id,actor,action,name)
 select a.pharmacy_id,a.id,auth.uid(),'ADD',a.worker_name from added a;
 return query select w.id,w.worker_name,w.active from public.pharmflow_expiry_workers_v1 w where w.pharmacy_id=p_pharmacy_id and w.active=true order by (w.system_key is null),lower(w.worker_name);
end $$;
revoke all on function public.list_pharmacy_expiry_workers(uuid) from public,anon;
grant execute on function public.list_pharmacy_expiry_workers(uuid) to authenticated;
