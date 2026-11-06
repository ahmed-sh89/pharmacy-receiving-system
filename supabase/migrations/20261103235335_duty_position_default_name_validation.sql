-- Staging-only follow-up: keep persisted and virtual default position names unique.
create or replace function public.save_pharmflow_duty_position_v1(p_pharmacy_id uuid,p_key text,p_label text,p_active boolean,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare oldrow public.pharmflow_duty_positions_v1;newrow public.pharmflow_duty_positions_v1;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 select * into oldrow from public.pharmflow_duty_positions_v1 where pharmacy_id=p_pharmacy_id and key=p_key for update;
 if p_expected_revision is null or p_expected_revision<>coalesce(oldrow.revision,0) then raise exception 'DUTY_CONFLICT'; end if;
 if exists(select 1 from (values ('pharmacist','Pharmacist'),('labor','Labor'),('beauty-advisor','Beauty Advisor')) d(key,label)
 where d.key<>p_key and lower(trim(d.label))=lower(trim(p_label))
 and not exists(select 1 from public.pharmflow_duty_positions_v1 p where p.pharmacy_id=p_pharmacy_id and p.key=d.key)) then
  raise exception 'This position name already exists.' using errcode='23505';
 end if;
 if oldrow.key is null then
  insert into public.pharmflow_duty_positions_v1(pharmacy_id,key,label,active) values(p_pharmacy_id,p_key,trim(p_label),p_active) returning * into newrow;
 else
  update public.pharmflow_duty_positions_v1 set label=trim(p_label),active=p_active,revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and key=p_key returning * into newrow;
 end if;
 insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,'position',p_key,auth.uid(),case when oldrow.key is null then null else to_jsonb(oldrow) end,to_jsonb(newrow));
 return to_jsonb(newrow);
end $$;
revoke all on function public.save_pharmflow_duty_position_v1(uuid,text,text,boolean,bigint) from public,anon;
grant execute on function public.save_pharmflow_duty_position_v1(uuid,text,text,boolean,bigint) to authenticated;
