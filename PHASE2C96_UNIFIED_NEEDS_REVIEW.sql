-- PharmFlow Phase 2C.9.6 — Unified Needs Review
create table if not exists public.pharmflow_needs_review_v1 (
 id uuid primary key default gen_random_uuid(),
 pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
 workflow text not null check(workflow in ('RECEIVING','EXPIRY')),
 status text not null default 'PENDING' check(status in ('PENDING','RESOLVED','DELETED')),
 gtin text not null, raw_barcode text, order_id text, order_name text,
 pending_quantity integer not null default 1 check(pending_quantity>0),
 expiry_month integer, expiry_year integer,
 worker_id uuid references public.pharmflow_expiry_workers_v1(id),
 captured_by_name text, device_id text,
 source text not null default 'HANDHELD' check(source in ('HANDHELD','PC')),
 created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 resolved_item_code text, resolved_item_name text,
 resolved_by uuid references auth.users(id), resolved_at timestamptz
);
create index if not exists idx_pf_review_pending_v1 on public.pharmflow_needs_review_v1(pharmacy_id,workflow,status,created_at desc);
alter table public.pharmflow_needs_review_v1 enable row level security;
revoke all on public.pharmflow_needs_review_v1 from anon,authenticated;

create or replace function public.save_pharmacy_needs_review(
 p_pharmacy_id uuid,p_workflow text,p_gtin text,p_raw_barcode text default null,
 p_order_id text default null,p_order_name text default null,p_pending_quantity integer default 1,
 p_expiry_month integer default null,p_expiry_year integer default null,p_worker_id uuid default null,
 p_device_id text default null,p_source text default 'HANDHELD')
returns table(review_id uuid,pending_quantity integer,created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_w text:=upper(trim(coalesce(p_workflow,''))); v_s text:=upper(trim(coalesce(p_source,'HANDHELD')));
 v_g text:=regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g'); v_q integer:=greatest(coalesce(p_pending_quantity,1),1);
 v_worker text; v_id uuid; v_time timestamptz;
begin
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 if v_w not in ('RECEIVING','EXPIRY') or v_g='' then raise exception 'Invalid review item'; end if;
 if v_s not in ('HANDHELD','PC') then raise exception 'Invalid source'; end if;
 if v_w='EXPIRY' then
   if p_expiry_month not between 1 and 12 or p_expiry_year not between 2020 and 2200 then raise exception 'Select expiry date'; end if;
   select worker_name into v_worker from public.pharmflow_expiry_workers_v1 where id=p_worker_id and pharmacy_id=p_pharmacy_id and active=true;
   if v_worker is null then raise exception 'Select an active worker'; end if;
 end if;
 if v_w='RECEIVING' then
   select id into v_id from public.pharmflow_needs_review_v1
    where pharmacy_id=p_pharmacy_id and workflow='RECEIVING' and status='PENDING' and gtin=v_g
      and coalesce(order_id,'')=coalesce(p_order_id,'') limit 1 for update;
   if v_id is not null then
     update public.pharmflow_needs_review_v1 set pending_quantity=pharmflow_needs_review_v1.pending_quantity+v_q,updated_at=now()
      where id=v_id returning pharmflow_needs_review_v1.pending_quantity,pharmflow_needs_review_v1.created_at into v_q,v_time;
     return query select v_id,v_q,v_time; return;
   end if;
 end if;
 insert into public.pharmflow_needs_review_v1(pharmacy_id,workflow,gtin,raw_barcode,order_id,order_name,pending_quantity,expiry_month,expiry_year,worker_id,captured_by_name,device_id,source,created_by)
 values(p_pharmacy_id,v_w,v_g,nullif(p_raw_barcode,''),nullif(p_order_id,''),nullif(p_order_name,''),v_q,p_expiry_month,p_expiry_year,p_worker_id,v_worker,nullif(p_device_id,''),v_s,auth.uid())
 returning id,pharmflow_needs_review_v1.created_at into v_id,v_time;
 return query select v_id,v_q,v_time;
end $$;

create or replace function public.list_pharmacy_needs_review(p_pharmacy_id uuid,p_workflow text default null,p_order_id text default null)
returns table(review_id uuid,workflow text,gtin text,raw_barcode text,order_id text,order_name text,pending_quantity integer,expiry_month integer,expiry_year integer,worker_id uuid,captured_by_name text,device_id text,source text,created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 return query select r.id,r.workflow,r.gtin,coalesce(r.raw_barcode,''),coalesce(r.order_id,''),coalesce(r.order_name,''),r.pending_quantity,r.expiry_month,r.expiry_year,r.worker_id,coalesce(r.captured_by_name,''),coalesce(r.device_id,''),r.source,r.created_at
 from public.pharmflow_needs_review_v1 r where r.pharmacy_id=p_pharmacy_id and r.status='PENDING'
 and (nullif(upper(trim(coalesce(p_workflow,''))),'') is null or r.workflow=upper(trim(p_workflow)))
 and (nullif(trim(coalesce(p_order_id,'')),'') is null or coalesce(r.order_id,'')=trim(p_order_id))
 order by r.created_at desc;
end $$;

create or replace function public.resolve_pharmacy_needs_review(p_pharmacy_id uuid,p_review_id uuid,p_item_code text,p_item_name text)
returns table(review_id uuid,workflow text,gtin text,pending_quantity integer,expiry_month integer,expiry_year integer,worker_id uuid,captured_by_name text,device_id text,source text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.pharmflow_needs_review_v1%rowtype;
begin
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 select * into r from public.pharmflow_needs_review_v1 where id=p_review_id and pharmacy_id=p_pharmacy_id and status='PENDING' for update;
 if not found then raise exception 'Review item not found'; end if;
 update public.pharmflow_needs_review_v1 set status='RESOLVED',resolved_item_code=trim(p_item_code),resolved_item_name=trim(p_item_name),resolved_by=auth.uid(),resolved_at=now(),updated_at=now() where id=p_review_id;
 return query select r.id,r.workflow,r.gtin,r.pending_quantity,r.expiry_month,r.expiry_year,r.worker_id,coalesce(r.captured_by_name,''),coalesce(r.device_id,''),r.source;
end $$;

create or replace function public.delete_pharmacy_needs_review(p_pharmacy_id uuid,p_review_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 update public.pharmflow_needs_review_v1 set status='DELETED',updated_at=now() where id=p_review_id and pharmacy_id=p_pharmacy_id and status='PENDING';
 return found;
end $$;

grant execute on function public.save_pharmacy_needs_review(uuid,text,text,text,text,text,integer,integer,integer,uuid,text,text) to authenticated;
grant execute on function public.list_pharmacy_needs_review(uuid,text,text) to authenticated;
grant execute on function public.resolve_pharmacy_needs_review(uuid,uuid,text,text) to authenticated;
grant execute on function public.delete_pharmacy_needs_review(uuid,uuid) to authenticated;
select pg_notify('pgrst','reload schema');
