-- PHARMFLOW — PHASE 2C.9.7 — SMART NEAR EXPIRY GS1
-- Safe additive migration: keeps the existing capture RPC and adds batch/sample serial support.
alter table public.pharmflow_expiry_captures_v1 add column if not exists batch_no text;
alter table public.pharmflow_expiry_captures_v1 add column if not exists sample_serial text;

create or replace function public.save_pharmacy_expiry_capture_smart(
 p_pharmacy_id uuid,p_item_code text,p_item_name text,p_gtin text,p_category text,p_quantity integer,
 p_expiry_month integer,p_expiry_year integer,p_worker_id uuid,p_batch_no text default null,
 p_sample_serial text default null,p_device_id text default null,p_source text default 'HANDHELD')
returns table(capture_id uuid,captured_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_worker_name text; v_capture uuid; v_time timestamptz; v_gtin text:=regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g'); v_source text:=upper(trim(coalesce(p_source,'HANDHELD')));
begin
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 if nullif(trim(coalesce(p_item_code,'')),'') is null or nullif(trim(coalesce(p_item_name,'')),'') is null or v_gtin='' then raise exception 'Item Code, Item Name and GTIN are required'; end if;
 if coalesce(p_quantity,0)<=0 then raise exception 'Quantity must be greater than zero'; end if;
 if p_expiry_month not between 1 and 12 or p_expiry_year not between 2020 and 2200 then raise exception 'Expiry date is invalid'; end if;
 if v_source not in ('HANDHELD','PC') then raise exception 'Invalid expiry capture source'; end if;
 select w.worker_name into v_worker_name from public.pharmflow_expiry_workers_v1 w where w.id=p_worker_id and w.pharmacy_id=p_pharmacy_id and w.active=true;
 if v_worker_name is null then raise exception 'Select an active worker before saving'; end if;
 insert into public.pharmflow_expiry_captures_v1(pharmacy_id,item_code,item_name,gtin,category,quantity,expiry_month,expiry_year,worker_id,captured_by_name,captured_by_user_id,device_id,source,batch_no,sample_serial)
 values(p_pharmacy_id,trim(p_item_code),trim(p_item_name),v_gtin,nullif(trim(coalesce(p_category,'')),''),p_quantity,p_expiry_month,p_expiry_year,p_worker_id,v_worker_name,auth.uid(),nullif(trim(coalesce(p_device_id,'')),''),v_source,nullif(trim(coalesce(p_batch_no,'')),''),nullif(trim(coalesce(p_sample_serial,'')),''))
 returning id,pharmflow_expiry_captures_v1.captured_at into v_capture,v_time;
 return query select v_capture,v_time;
end $$;
revoke all on function public.save_pharmacy_expiry_capture_smart(uuid,text,text,text,text,integer,integer,integer,uuid,text,text,text,text) from public,anon;
grant execute on function public.save_pharmacy_expiry_capture_smart(uuid,text,text,text,text,integer,integer,integer,uuid,text,text,text,text) to authenticated;
select pg_notify('pgrst','reload schema');
