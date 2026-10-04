-- PharmFlow Expiry Stage 1 correction audit foundation
alter table public.pharmflow_expiry_events_v1
  add column if not exists previous_batch_no text,
  add column if not exists previous_expiry_month integer,
  add column if not exists previous_expiry_year integer;

create or replace function public.correct_pharmacy_expiry_current_state_v1(
 p_pharmacy_id uuid,p_state_id uuid,p_quantity integer,p_expiry_month integer,p_expiry_year integer,
 p_batch_no text default null,p_worker_id uuid default null,p_device_id text default null)
returns table(state_id uuid,event_id uuid,last_verified_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_user uuid:=auth.uid(); v_row public.pharmflow_expiry_current_state_v1%rowtype; v_worker_name text;
 v_batch_no text:=nullif(btrim(coalesce(p_batch_no,'')),''); v_batch_key text:=coalesce(nullif(upper(btrim(coalesce(p_batch_no,''))),''),'');
 v_event_id uuid; v_now timestamptz:=now();
begin
 if v_user is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 if p_quantity is null or p_quantity<=0 then raise exception 'Quantity must be greater than zero'; end if;
 if p_expiry_month not between 1 and 12 or p_expiry_year not between 2020 and 2200 then raise exception 'Expiry date is invalid'; end if;
 select * into v_row from public.pharmflow_expiry_current_state_v1 where id=p_state_id and pharmacy_id=p_pharmacy_id for update;
 if v_row.id is null then raise exception 'Expiry state not found'; end if;
 if exists(select 1 from public.pharmflow_expiry_current_state_v1 s where s.pharmacy_id=p_pharmacy_id and s.item_code=v_row.item_code and s.batch_key=v_batch_key and s.expiry_year=p_expiry_year and s.expiry_month=p_expiry_month and s.id<>p_state_id) then
   raise exception 'Another current expiry line already uses this product, batch and expiry';
 end if;
 if p_worker_id is not null then
   select w.worker_name into v_worker_name from public.pharmflow_expiry_workers_v1 w where w.id=p_worker_id and w.pharmacy_id=p_pharmacy_id and w.active=true;
   if v_worker_name is null then raise exception 'Selected operator is not active'; end if;
 else v_worker_name:='Account user'; end if;
 update public.pharmflow_expiry_current_state_v1 set batch_no=v_batch_no,batch_key=v_batch_key,expiry_month=p_expiry_month,expiry_year=p_expiry_year,
 verified_quantity=p_quantity,worker_id=p_worker_id,verified_by_name=v_worker_name,verified_by_user_id=v_user,last_verified_at=v_now,
 device_id=nullif(btrim(coalesce(p_device_id,'')),''),source='PC',status='ACTIVE',updated_at=v_now where id=p_state_id;
 insert into public.pharmflow_expiry_events_v1(state_id,pharmacy_id,event_type,item_code,item_name,identifier_display,identifier_key,category,batch_no,sample_serial,
 expiry_month,expiry_year,previous_quantity,verified_quantity,worker_id,verified_by_name,verified_by_user_id,device_id,source,occurred_at,
 previous_batch_no,previous_expiry_month,previous_expiry_year)
 values(v_row.id,p_pharmacy_id,'RECOUNT',v_row.item_code,v_row.item_name,v_row.identifier_display,v_row.identifier_key,v_row.category,v_batch_no,v_row.sample_serial,
 p_expiry_month,p_expiry_year,v_row.verified_quantity,p_quantity,p_worker_id,v_worker_name,v_user,nullif(btrim(coalesce(p_device_id,'')),''),'PC',v_now,
 v_row.batch_no,v_row.expiry_month,v_row.expiry_year) returning id into v_event_id;
 return query select v_row.id,v_event_id,v_now;
end $$;
revoke all on function public.correct_pharmacy_expiry_current_state_v1(uuid,uuid,integer,integer,integer,text,uuid,text) from public,anon;
grant execute on function public.correct_pharmacy_expiry_current_state_v1(uuid,uuid,integer,integer,integer,text,uuid,text) to authenticated;
