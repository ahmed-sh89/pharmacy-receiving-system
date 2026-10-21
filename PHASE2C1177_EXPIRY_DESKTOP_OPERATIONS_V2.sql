create or replace function public.save_pharmacy_expiry_verified_state_v2(
p_pharmacy_id uuid,p_item_code text,p_item_name text,p_identifier_display text,p_category text,
p_quantity integer,p_expiry_month integer,p_expiry_year integer,p_worker_id uuid default null,
p_batch_no text default null,p_sample_serial text default null,p_device_id text default null,
p_source text default 'HANDHELD',p_event_type text default 'CAPTURE')
returns table(state_id uuid,event_id uuid,last_verified_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_user uuid:=auth.uid(); v_worker_name text; v_identifier_display text:=btrim(coalesce(p_identifier_display,''));
 v_identifier_key text; v_item_code text:=btrim(coalesce(p_item_code,'')); v_item_name text:=btrim(coalesce(p_item_name,''));
 v_batch_no text:=nullif(btrim(coalesce(p_batch_no,'')),''); v_batch_key text:=coalesce(nullif(upper(btrim(coalesce(p_batch_no,''))),''),'');
 v_source text:=upper(btrim(coalesce(p_source,'HANDHELD'))); v_event_type text:=upper(btrim(coalesce(p_event_type,'CAPTURE')));
 v_state_id uuid; v_event_id uuid; v_previous_quantity integer; v_new_quantity integer; v_now timestamptz:=now();
begin
 if v_user is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 if v_item_code='' or v_item_name='' or v_identifier_display='' then raise exception 'Item Code, Item Name and Identifier are required'; end if;
 v_identifier_key:=public.pharmflow_identifier_key_v2(v_identifier_display);
 if nullif(v_identifier_key,'') is null then raise exception 'Identifier is invalid'; end if;
 if p_quantity is null or p_quantity<0 then raise exception 'Quantity cannot be negative'; end if;
 if p_expiry_month not between 1 and 12 or p_expiry_year not between 2020 and 2200 then raise exception 'Expiry date is invalid'; end if;
 if v_source not in ('HANDHELD','PC') then raise exception 'Invalid expiry source'; end if;
 if v_event_type not in ('CAPTURE','RECOUNT','CLEARED') then raise exception 'Invalid expiry event type'; end if;
 if (v_event_type='CLEARED' and p_quantity<>0) or (v_event_type<>'CLEARED' and p_quantity=0) then raise exception 'Invalid zero quantity event'; end if;
 if p_worker_id is not null then
   select w.worker_name into v_worker_name from public.pharmflow_expiry_workers_v1 w
   where w.id=p_worker_id and w.pharmacy_id=p_pharmacy_id and w.active=true;
   if v_worker_name is null then raise exception 'Selected operator is not active'; end if;
 elsif v_source='HANDHELD' then raise exception 'Select an active worker before saving';
 else v_worker_name:='Account user';
 end if;
 select s.id,s.verified_quantity into v_state_id,v_previous_quantity from public.pharmflow_expiry_current_state_v1 s
 where s.pharmacy_id=p_pharmacy_id and s.item_code=v_item_code and s.batch_key=v_batch_key
 and s.expiry_year=p_expiry_year and s.expiry_month=p_expiry_month for update;
 if v_event_type='CAPTURE' then v_new_quantity:=coalesce(v_previous_quantity,0)+p_quantity;
 elsif v_event_type='RECOUNT' then v_new_quantity:=p_quantity; else v_new_quantity:=0; end if;
 if v_state_id is null then
  insert into public.pharmflow_expiry_current_state_v1(pharmacy_id,item_code,item_name,identifier_display,identifier_key,category,batch_no,batch_key,sample_serial,expiry_month,expiry_year,verified_quantity,worker_id,verified_by_name,verified_by_user_id,last_verified_at,device_id,source,status)
  values(p_pharmacy_id,v_item_code,v_item_name,v_identifier_display,v_identifier_key,nullif(btrim(coalesce(p_category,'')),''),v_batch_no,v_batch_key,nullif(btrim(coalesce(p_sample_serial,'')),''),p_expiry_month,p_expiry_year,v_new_quantity,p_worker_id,v_worker_name,v_user,v_now,nullif(btrim(coalesce(p_device_id,'')),''),v_source,case when v_new_quantity=0 then 'CLEARED' else 'ACTIVE' end)
  returning id into v_state_id;
 else
  update public.pharmflow_expiry_current_state_v1 set item_name=v_item_name,identifier_display=v_identifier_display,identifier_key=v_identifier_key,
  category=nullif(btrim(coalesce(p_category,'')),''),batch_no=v_batch_no,sample_serial=nullif(btrim(coalesce(p_sample_serial,'')),''),
  verified_quantity=v_new_quantity,worker_id=p_worker_id,verified_by_name=v_worker_name,verified_by_user_id=v_user,last_verified_at=v_now,
  device_id=nullif(btrim(coalesce(p_device_id,'')),''),source=v_source,status=case when v_new_quantity=0 then 'CLEARED' else 'ACTIVE' end,updated_at=v_now where id=v_state_id;
 end if;
 insert into public.pharmflow_expiry_events_v1(state_id,pharmacy_id,event_type,item_code,item_name,identifier_display,identifier_key,category,batch_no,sample_serial,expiry_month,expiry_year,previous_quantity,verified_quantity,worker_id,verified_by_name,verified_by_user_id,device_id,source,occurred_at)
 values(v_state_id,p_pharmacy_id,v_event_type,v_item_code,v_item_name,v_identifier_display,v_identifier_key,nullif(btrim(coalesce(p_category,'')),''),v_batch_no,nullif(btrim(coalesce(p_sample_serial,'')),''),p_expiry_month,p_expiry_year,v_previous_quantity,v_new_quantity,p_worker_id,v_worker_name,v_user,nullif(btrim(coalesce(p_device_id,'')),''),v_source,v_now) returning id into v_event_id;
 return query select v_state_id,v_event_id,v_now;
end $$;
revoke all on function public.save_pharmacy_expiry_verified_state_v2(uuid,text,text,text,text,integer,integer,integer,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.save_pharmacy_expiry_verified_state_v2(uuid,text,text,text,text,integer,integer,integer,uuid,text,text,text,text,text) to authenticated;