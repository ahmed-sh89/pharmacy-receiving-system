-- ============================================================
-- PharmFlow Phase 2C.10.4.8
-- HANDHELD UNKNOWN GTIN / NEEDS REVIEW HARDENING
-- Additive, tenant-scoped, non-destructive.
-- ============================================================

alter table if exists public.pharmflow_needs_review_v1
  add column if not exists review_reason text;

update public.pharmflow_needs_review_v1
set review_reason='UNKNOWN_GTIN'
where review_reason is null;

alter table public.pharmflow_needs_review_v1
  drop constraint if exists pharmflow_needs_review_reason_check;
alter table public.pharmflow_needs_review_v1
  add constraint pharmflow_needs_review_reason_check
  check (review_reason in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED'));

create or replace function public.save_pharmacy_needs_review(
 p_pharmacy_id uuid,p_workflow text,p_gtin text,p_raw_barcode text default null,
 p_order_id text default null,p_order_name text default null,p_pending_quantity integer default 1,
 p_expiry_month integer default null,p_expiry_year integer default null,p_worker_id uuid default null,
 p_device_id text default null,p_source text default 'HANDHELD',p_review_reason text default null
)
returns table(review_id uuid,pending_quantity integer,created_at timestamptz)
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare
 v_w text:=upper(trim(coalesce(p_workflow,'')));
 v_s text:=upper(trim(coalesce(p_source,'HANDHELD')));
 v_g text:=regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g');
 v_q integer:=greatest(coalesce(p_pending_quantity,1),1);
 v_reason text:=upper(trim(coalesce(p_review_reason,'UNKNOWN_GTIN')));
 v_worker text; v_id uuid; v_time timestamptz;
begin
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 if v_w not in ('RECEIVING','EXPIRY') or v_g='' then raise exception 'Invalid review item'; end if;
 if v_s not in ('HANDHELD','PC') then raise exception 'Invalid source'; end if;
 if v_reason not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason'; end if;
 if v_w='EXPIRY' then
   if p_expiry_month not between 1 and 12 or p_expiry_year not between 2020 and 2200 then raise exception 'Select expiry date'; end if;
   select worker_name into v_worker from public.pharmflow_expiry_workers_v1
   where id=p_worker_id and pharmacy_id=p_pharmacy_id and active=true;
   if v_worker is null then raise exception 'Select an active worker'; end if;
 end if;
 if v_w='RECEIVING' then
   select id into v_id from public.pharmflow_needs_review_v1
   where pharmacy_id=p_pharmacy_id and workflow='RECEIVING' and status='PENDING'
     and gtin=v_g and coalesce(order_id,'')=coalesce(p_order_id,'')
     and coalesce(review_reason,'UNKNOWN_GTIN')=v_reason
   order by created_at desc limit 1 for update;
   if v_id is not null then
     update public.pharmflow_needs_review_v1
       set pending_quantity=pharmflow_needs_review_v1.pending_quantity+v_q,updated_at=now()
     where id=v_id
     returning pharmflow_needs_review_v1.pending_quantity,pharmflow_needs_review_v1.created_at into v_q,v_time;
     return query select v_id,v_q,v_time; return;
   end if;
 end if;
 insert into public.pharmflow_needs_review_v1(
   pharmacy_id,workflow,gtin,raw_barcode,order_id,order_name,pending_quantity,
   expiry_month,expiry_year,worker_id,captured_by_name,device_id,source,created_by,review_reason)
 values(p_pharmacy_id,v_w,v_g,nullif(p_raw_barcode,''),nullif(p_order_id,''),nullif(p_order_name,''),v_q,
   p_expiry_month,p_expiry_year,p_worker_id,v_worker,nullif(p_device_id,''),v_s,auth.uid(),v_reason)
 returning id,pharmflow_needs_review_v1.created_at into v_id,v_time;
 return query select v_id,v_q,v_time;
end $$;

-- Absolute quantity setter used by the Handheld review card after the default
-- quantity=1 draft has ALREADY been safely persisted.
create or replace function public.set_pharmacy_needs_review_quantity(
 p_pharmacy_id uuid,p_review_id uuid,p_pending_quantity integer)
returns table(review_id uuid,pending_quantity integer,updated_at timestamptz)
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare v_q integer:=greatest(coalesce(p_pending_quantity,1),1);
begin
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 return query
 update public.pharmflow_needs_review_v1 r
 set pending_quantity=v_q,updated_at=now()
 where r.id=p_review_id and r.pharmacy_id=p_pharmacy_id and r.status='PENDING' and r.workflow='RECEIVING'
 returning r.id,r.pending_quantity,r.updated_at;
 if not found then raise exception 'Pending review item not found'; end if;
end $$;

revoke all on function public.set_pharmacy_needs_review_quantity(uuid,uuid,integer) from public,anon;
grant execute on function public.set_pharmacy_needs_review_quantity(uuid,uuid,integer) to authenticated;
grant execute on function public.save_pharmacy_needs_review(uuid,text,text,text,text,text,integer,integer,integer,uuid,text,text,text) to authenticated;
select pg_notify('pgrst','reload schema');
