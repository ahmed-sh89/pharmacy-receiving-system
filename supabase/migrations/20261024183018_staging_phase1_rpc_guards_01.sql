CREATE OR REPLACE FUNCTION public.set_pharmflow_needs_review_photo_v2(p_pharmacy_id uuid, p_review_id uuid, p_photo_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'set_pharmflow_needs_review_photo_v2',NULL);

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
  perform 1 from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;


    update public.pharmflow_needs_review_v2
       set photo_path = nullif(trim(coalesce(p_photo_path,'')),''),
           updated_at = now()
     where id = p_review_id
       and pharmacy_id = p_pharmacy_id
       and status = 'PENDING';

    return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_pharmacy_expiry_verified_state_v1(p_pharmacy_id uuid, p_item_code text, p_item_name text, p_identifier_display text, p_category text, p_quantity integer, p_expiry_month integer, p_expiry_year integer, p_worker_id uuid, p_batch_no text DEFAULT NULL::text, p_sample_serial text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_event_type text DEFAULT 'CAPTURE'::text)
 RETURNS TABLE(state_id uuid, event_id uuid, last_verified_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_user uuid := auth.uid();
    v_worker_name text;
    v_identifier_display text := btrim(coalesce(p_identifier_display,''));
    v_identifier_key text;
    v_item_code text := btrim(coalesce(p_item_code,''));
    v_item_name text := btrim(coalesce(p_item_name,''));
    v_batch_no text := nullif(btrim(coalesce(p_batch_no,'')),'');
    v_batch_key text := coalesce(nullif(upper(btrim(coalesce(p_batch_no,''))),''),'');
    v_source text := upper(btrim(coalesce(p_source,'HANDHELD')));
    v_event_type text := upper(btrim(coalesce(p_event_type,'CAPTURE')));
    v_state_id uuid;
    v_event_id uuid;
    v_previous_quantity integer;
    v_now timestamptz := now();
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmacy_expiry_verified_state_v1',NULL);

 if upper(btrim(coalesce(p_event_type,'CAPTURE')))='CAPTURE' then raise exception 'Expiry capture requires operation-aware V3';end if;
    if v_user is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if v_item_code='' or v_item_name='' or v_identifier_display='' then
        raise exception 'Item Code, Item Name and Identifier are required';
    end if;

    v_identifier_key := public.pharmflow_identifier_key_v2(v_identifier_display);
    if nullif(v_identifier_key,'') is null then
        raise exception 'Identifier is invalid';
    end if;

    if p_quantity is null or p_quantity < 0 then
        raise exception 'Quantity cannot be negative';
    end if;
    if p_expiry_month not between 1 and 12 or p_expiry_year not between 2020 and 2200 then
        raise exception 'Expiry date is invalid';
    end if;
    if v_source not in ('HANDHELD','PC') then
        raise exception 'Invalid expiry source';
    end if;
    if v_event_type not in ('CAPTURE','RECOUNT','CLEARED') then
        raise exception 'Invalid expiry event type';
    end if;
    if (v_event_type='CLEARED' and p_quantity<>0) or (v_event_type<>'CLEARED' and p_quantity=0) then
        raise exception 'Zero quantity must use CLEARED and CLEARED must use zero quantity';
    end if;

    select w.worker_name
      into v_worker_name
      from public.pharmflow_expiry_workers_v1 w
     where w.id=p_worker_id and w.pharmacy_id=p_pharmacy_id and w.active=true;

    if v_worker_name is null then
        raise exception 'Select an active worker before saving';
    end if;

    select s.id,s.verified_quantity
      into v_state_id,v_previous_quantity
      from public.pharmflow_expiry_current_state_v1 s
     where s.pharmacy_id=p_pharmacy_id
       and s.item_code=v_item_code
       and s.batch_key=v_batch_key
       and s.expiry_year=p_expiry_year
       and s.expiry_month=p_expiry_month
     for update;

    if v_state_id is null then
        insert into public.pharmflow_expiry_current_state_v1(
            pharmacy_id,item_code,item_name,identifier_display,identifier_key,category,
            batch_no,batch_key,sample_serial,expiry_month,expiry_year,verified_quantity,
            worker_id,verified_by_name,verified_by_user_id,last_verified_at,device_id,
            source,status
        ) values (
            p_pharmacy_id,v_item_code,v_item_name,v_identifier_display,v_identifier_key,
            nullif(btrim(coalesce(p_category,'')),''),v_batch_no,v_batch_key,
            nullif(btrim(coalesce(p_sample_serial,'')),''),p_expiry_month,p_expiry_year,
            p_quantity,p_worker_id,v_worker_name,v_user,v_now,
            nullif(btrim(coalesce(p_device_id,'')),''),v_source,
            case when p_quantity=0 then 'CLEARED' else 'ACTIVE' end
        )
        returning id into v_state_id;
    else
        update public.pharmflow_expiry_current_state_v1
           set item_name=v_item_name,
               identifier_display=v_identifier_display,
               identifier_key=v_identifier_key,
               category=nullif(btrim(coalesce(p_category,'')),''),
               batch_no=v_batch_no,
               sample_serial=nullif(btrim(coalesce(p_sample_serial,'')),''),
               verified_quantity=p_quantity,
               worker_id=p_worker_id,
               verified_by_name=v_worker_name,
               verified_by_user_id=v_user,
               last_verified_at=v_now,
               device_id=nullif(btrim(coalesce(p_device_id,'')),''),
               source=v_source,
               status=case when p_quantity=0 then 'CLEARED' else 'ACTIVE' end,
               updated_at=v_now
         where id=v_state_id;
    end if;

    insert into public.pharmflow_expiry_events_v1(
        state_id,pharmacy_id,event_type,item_code,item_name,identifier_display,
        identifier_key,category,batch_no,sample_serial,expiry_month,expiry_year,
        previous_quantity,verified_quantity,worker_id,verified_by_name,
        verified_by_user_id,device_id,source,occurred_at
    ) values (
        v_state_id,p_pharmacy_id,v_event_type,v_item_code,v_item_name,
        v_identifier_display,v_identifier_key,nullif(btrim(coalesce(p_category,'')),''),
        v_batch_no,nullif(btrim(coalesce(p_sample_serial,'')),''),p_expiry_month,p_expiry_year,
        v_previous_quantity,p_quantity,p_worker_id,v_worker_name,v_user,
        nullif(btrim(coalesce(p_device_id,'')),''),v_source,v_now
    ) returning id into v_event_id;

    return query select v_state_id,v_event_id,v_now;
end
$function$;

CREATE OR REPLACE FUNCTION public.save_pharmacy_expiry_verified_state_v2(p_pharmacy_id uuid, p_item_code text, p_item_name text, p_identifier_display text, p_category text, p_quantity integer, p_expiry_month integer, p_expiry_year integer, p_worker_id uuid DEFAULT NULL::uuid, p_batch_no text DEFAULT NULL::text, p_sample_serial text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_event_type text DEFAULT 'CAPTURE'::text)
 RETURNS TABLE(state_id uuid, event_id uuid, last_verified_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_user uuid:=auth.uid(); v_worker_name text; v_identifier_display text:=btrim(coalesce(p_identifier_display,''));
 v_identifier_key text; v_item_code text:=btrim(coalesce(p_item_code,'')); v_item_name text:=btrim(coalesce(p_item_name,''));
 v_batch_no text:=nullif(btrim(coalesce(p_batch_no,'')),''); v_batch_key text:=coalesce(nullif(upper(btrim(coalesce(p_batch_no,''))),''),'');
 v_source text:=upper(btrim(coalesce(p_source,'HANDHELD'))); v_event_type text:=upper(btrim(coalesce(p_event_type,'CAPTURE')));
 v_state_id uuid; v_event_id uuid; v_previous_quantity integer; v_new_quantity integer; v_now timestamptz:=now();
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmacy_expiry_verified_state_v2',NULL);

 if upper(btrim(coalesce(p_event_type,'CAPTURE')))='CAPTURE' then raise exception 'Expiry capture requires operation-aware V3';end if;
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
 else v_worker_name:='Desktop';
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
end $function$;

CREATE OR REPLACE FUNCTION public.create_pharmflow_needs_review_v3(p_pharmacy_id uuid, p_workflow text, p_identifier_display text, p_raw_barcode text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_review_reason text DEFAULT 'UNKNOWN_GTIN'::text, p_master_item_code_hint text DEFAULT NULL::text, p_master_item_name_hint text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_device_id text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_display text:=btrim(coalesce(p_identifier_display,''));v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);v_id uuid;v_time timestamptz;begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),true,'create_pharmflow_needs_review_v3',NULL);
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;if v_key='' then raise exception 'Identifier is required';end if;if upper(trim(coalesce(p_workflow,'RECEIVING'))) <> 'RECEIVING' then raise exception 'Invalid workflow';end if;if upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))) not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason';end if;if upper(btrim(coalesce(p_source,'HANDHELD'))) not in ('HANDHELD','PC') then raise exception 'Invalid source';end if;insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,session_id,order_number,order_name,gtin,raw_barcode,identifier_display,identifier_key,pending_quantity,review_reason,master_item_code_hint,master_item_name_hint,source,device_id,created_by) values(p_pharmacy_id,'RECEIVING',nullif(btrim(coalesce(p_session_id,'')),''),nullif(btrim(coalesce(p_order_number,'')),''),nullif(btrim(coalesce(p_order_name,'')),''),v_display,nullif(p_raw_barcode,''),v_display,v_key,1,upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),nullif(btrim(coalesce(p_master_item_code_hint,'')),''),nullif(btrim(coalesce(p_master_item_name_hint,'')),''),upper(btrim(coalesce(p_source,'HANDHELD'))),nullif(btrim(coalesce(p_device_id,'')),''),auth.uid()) returning id,pharmflow_needs_review_v2.created_at into v_id,v_time;return query select v_id,1,v_time;end $function$;

CREATE OR REPLACE FUNCTION public.save_pharmacy_expiry_capture_smart(p_pharmacy_id uuid, p_item_code text, p_item_name text, p_gtin text, p_category text, p_quantity integer, p_expiry_month integer, p_expiry_year integer, p_worker_id uuid, p_batch_no text DEFAULT NULL::text, p_sample_serial text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text)
 RETURNS TABLE(capture_id uuid, captured_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_worker_name text; v_capture uuid; v_time timestamptz; v_gtin text:=regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g'); v_source text:=upper(trim(coalesce(p_source,'HANDHELD')));
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmacy_expiry_capture_smart',NULL);

 raise exception 'Expiry capture requires operation-aware V3';
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
end $function$;

CREATE OR REPLACE FUNCTION public.save_pharmacy_needs_review(p_pharmacy_id uuid, p_workflow text, p_gtin text, p_raw_barcode text DEFAULT NULL::text, p_order_id text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_pending_quantity integer DEFAULT 1, p_expiry_month integer DEFAULT NULL::integer, p_expiry_year integer DEFAULT NULL::integer, p_worker_id uuid DEFAULT NULL::uuid, p_device_id text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text)
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_w text:=upper(trim(coalesce(p_workflow,''))); v_s text:=upper(trim(coalesce(p_source,'HANDHELD')));
 v_g text:=regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g'); v_q integer:=greatest(coalesce(p_pending_quantity,1),1);
 v_worker text; v_id uuid; v_time timestamptz;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),true,'save_pharmacy_needs_review',NULL);

 if upper(btrim(coalesce(p_workflow,'')))='EXPIRY' then raise exception 'Expiry capture requires operation-aware V3';end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.save_pharmacy_expiry_capture(p_pharmacy_id uuid, p_item_code text, p_item_name text, p_gtin text, p_category text, p_quantity integer, p_expiry_month integer, p_expiry_year integer, p_worker_id uuid, p_device_id text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text)
 RETURNS TABLE(capture_id uuid, captured_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_worker_name text;
    v_capture uuid;
    v_time timestamptz;
    v_gtin text := regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g');
    v_source text := upper(trim(coalesce(p_source,'HANDHELD')));
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmacy_expiry_capture',NULL);

 raise exception 'Expiry capture requires operation-aware V3';
    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if nullif(trim(coalesce(p_item_code,'')),'') is null
       or nullif(trim(coalesce(p_item_name,'')),'') is null
       or v_gtin = '' then
        raise exception 'Item Code, Item Name and GTIN are required';
    end if;

    if coalesce(p_quantity,0) <= 0 then
        raise exception 'Quantity must be greater than zero';
    end if;

    if p_expiry_month not between 1 and 12 then
        raise exception 'Expiry month must be between 1 and 12';
    end if;

    if p_expiry_year not between 2020 and 2200 then
        raise exception 'Expiry year is invalid';
    end if;

    if v_source not in ('HANDHELD','PC') then
        raise exception 'Invalid expiry capture source';
    end if;

    select w.worker_name
    into v_worker_name
    from public.pharmflow_expiry_workers_v1 w
    where w.id = p_worker_id
      and w.pharmacy_id = p_pharmacy_id
      and w.active = true;

    if v_worker_name is null then
        raise exception 'Select an active worker before saving';
    end if;

    insert into public.pharmflow_expiry_captures_v1(
        pharmacy_id,
        item_code,
        item_name,
        gtin,
        category,
        quantity,
        expiry_month,
        expiry_year,
        worker_id,
        captured_by_name,
        captured_by_user_id,
        device_id,
        source
    )
    values (
        p_pharmacy_id,
        trim(p_item_code),
        trim(p_item_name),
        v_gtin,
        nullif(trim(coalesce(p_category,'')),''),
        p_quantity,
        p_expiry_month,
        p_expiry_year,
        p_worker_id,
        v_worker_name,
        auth.uid(),
        nullif(trim(coalesce(p_device_id,'')),''),
        v_source
    )
    returning id, pharmflow_expiry_captures_v1.captured_at
    into v_capture, v_time;

    return query select v_capture, v_time;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_pharmacy_needs_review(p_pharmacy_id uuid, p_workflow text, p_gtin text, p_raw_barcode text DEFAULT NULL::text, p_order_id text DEFAULT NULL::text, p_order_name text DEFAULT NULL::text, p_pending_quantity integer DEFAULT 1, p_expiry_month integer DEFAULT NULL::integer, p_expiry_year integer DEFAULT NULL::integer, p_worker_id uuid DEFAULT NULL::uuid, p_device_id text DEFAULT NULL::text, p_source text DEFAULT 'HANDHELD'::text, p_review_reason text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, pending_quantity integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_w text:=upper(trim(coalesce(p_workflow,'')));
 v_s text:=upper(trim(coalesce(p_source,'HANDHELD')));
 v_g text:=regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g');
 v_q integer:=greatest(coalesce(p_pending_quantity,1),1);
 v_reason text:=upper(trim(coalesce(p_review_reason,'UNKNOWN_GTIN')));
 v_worker text; v_id uuid; v_time timestamptz;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,upper(coalesce(p_workflow,'RECEIVING')),true,'save_pharmacy_needs_review',NULL);

 if upper(btrim(coalesce(p_workflow,'')))='EXPIRY' then raise exception 'Expiry capture requires operation-aware V3';end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.save_pharmflow_expiry_capture_v3(p_pharmacy_id uuid, p_operation_id uuid, p_capture jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
 v_op pharmflow_expiry_private.operations%rowtype;v_kind text;v_identifier text;v_facts jsonb;v_month integer;v_year integer;v_qty integer;v_worker uuid;v_worker_name text;
 v_product text;v_expiry text;v_ack record;v_review uuid;v_result jsonb;v_date date;v_key text;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmflow_expiry_capture_v3',p_operation_id::text);

 perform pharmflow_expiry_private.valid_auth_session();
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_operation_id is null or jsonb_typeof(p_capture) is distinct from 'object' then raise exception 'Operation and capture required';end if;
 perform public.reserve_pharmflow_expiry_capture_v1(p_pharmacy_id,p_operation_id);
 select * into v_op from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id for update;
 if v_op.status='COMMITTED' then
  if v_op.payload is distinct from p_capture then raise exception 'Operation payload conflict';end if;return v_op.result;
 end if;
 if nullif(p_capture->>'worker_id','') is null then raise exception 'Select an active Operator before saving';end if;
 if not (p_capture ?& array['kind','identifier_display','raw_scan','scan_format','quantity','expiry_month','expiry_year','worker_id','device_id','source','batch_no','sample_serial']) then raise exception 'Complete capture fields required';end if;
 if jsonb_typeof(p_capture->'raw_scan') is distinct from 'string' or jsonb_typeof(p_capture->'identifier_display') is distinct from 'string' or jsonb_typeof(p_capture->'device_id') is distinct from 'string' or btrim(p_capture->>'device_id')='' then raise exception 'Exact scan, identifier and device required';end if;
 v_facts:=pharmflow_expiry_private.scan_facts(p_capture->>'raw_scan',p_capture->>'scan_format');v_identifier:=p_capture->>'identifier_display';
 if v_identifier='' or v_identifier is distinct from v_facts->>'identifier' then raise exception 'Identifier does not match raw scan';end if;
 if jsonb_typeof(p_capture->'quantity') is distinct from 'number' or (p_capture->>'quantity') !~ '^[1-9][0-9]*$' or jsonb_typeof(p_capture->'expiry_month') is distinct from 'number' or jsonb_typeof(p_capture->'expiry_year') is distinct from 'number' then raise exception 'Integer quantity and expiry required';end if;
 v_qty:=(p_capture->>'quantity')::integer;v_month:=(p_capture->>'expiry_month')::integer;v_year:=(p_capture->>'expiry_year')::integer;
 if v_month not between 1 and 12 or v_year not between 2020 and 2200 then raise exception 'Invalid expiry';end if;
 if jsonb_typeof(p_capture->'batch_no') not in ('string','null') or jsonb_typeof(p_capture->'sample_serial') not in ('string','null') then raise exception 'Invalid optional batch or serial';end if;
 if not (v_facts ? '10') and pharmflow_expiry_private.batch_is_scanner_payload(p_capture->>'batch_no') then raise exception 'Use Scan Barcode, not Batch';end if;
 if v_facts ? '10' and coalesce(p_capture->>'batch_no','')<>v_facts->>'10' then raise exception 'GS1 batch mismatch';end if;
 if v_facts ? '21' and coalesce(p_capture->>'sample_serial','')<>v_facts->>'21' then raise exception 'GS1 serial mismatch';end if;
 if v_facts ? '17' then
  if (substr(v_facts->>'17',3,2))::integer<>v_month or 2000+(left(v_facts->>'17',2))::integer<>v_year then raise exception 'GS1 expiry mismatch';end if;
  if right(v_facts->>'17',2)<>'00' then v_date:=make_date(v_year,v_month,(right(v_facts->>'17',2))::integer);end if;
 end if;
 if p_capture ? 'identification_note' and (jsonb_typeof(p_capture->'identification_note') not in ('string','null') or length(p_capture->>'identification_note')>250) then raise exception 'Invalid identification note';end if;
 v_kind:=p_capture->>'kind';if v_kind is null or v_kind not in ('KNOWN','UNKNOWN') or p_capture->>'source' is null or p_capture->>'source' not in ('HANDHELD','PC') then raise exception 'Invalid capture kind or source';end if;
 v_worker:=(p_capture->>'worker_id')::uuid;
 if v_worker is not null then
  select worker_name into v_worker_name from public.pharmflow_expiry_workers_v1 where pharmacy_id=p_pharmacy_id and id=v_worker and active=true;
  if v_worker_name is null then raise exception 'Active pharmacy worker required';end if;
 elsif p_capture->>'source'='HANDHELD' or v_kind='UNKNOWN' then raise exception 'Worker required';else v_worker_name:='Desktop';end if;
 update pharmflow_expiry_private.operations set status='COMMITTING',payload=p_capture where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if v_kind='KNOWN' then
  if exists(select 1 from pharmflow_expiry_private.photos where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and deleted_at is null) then raise exception 'Known captures cannot orphan review photos';end if;
  if jsonb_typeof(p_capture->'item_code') is distinct from 'string' or jsonb_typeof(p_capture->'item_name') is distinct from 'string' or btrim(p_capture->>'item_code')='' or btrim(p_capture->>'item_name')='' then raise exception 'Known item fields required';end if;
  v_key:=p_pharmacy_id::text||'/item/'||btrim(p_capture->>'item_code')||'/'||upper(btrim(coalesce(p_capture->>'batch_no','')))||'/'||v_year::text||'/'||v_month::text;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_ack from pharmflow_expiry_private.save_known_core(p_pharmacy_id,p_capture->>'item_code',p_capture->>'item_name',v_identifier,p_capture->>'category',v_qty,v_month,v_year,v_worker,p_capture->>'batch_no',p_capture->>'sample_serial',p_capture->>'device_id',p_capture->>'source','CAPTURE');
  if v_ack.state_id is null or v_ack.event_id is null then raise exception 'Save acknowledgement required';end if;
  v_result:=jsonb_build_object('operation_id',p_operation_id,'state_id',v_ack.state_id,'event_id',v_ack.event_id);
 else
  v_product:=coalesce(p_capture->>'product_photo_path',p_capture->>'evidence_photo_path');v_expiry:=p_capture->>'expiry_photo_path';
  if (v_product is null and v_expiry is not null) or (v_expiry is not null and v_product=v_expiry) then raise exception 'One evidence photo is required; legacy two-photo submissions remain supported';end if;
  -- The upload path remains in the existing private immutable Storage namespace.
  -- New submissions use the approved product-role slot for their single evidence image.
  if (v_product is not null and not exists(select 1 from pharmflow_expiry_private.photos p join storage.objects o on o.name=p.path and o.bucket_id='pharmflow-needs-review' where p.path=v_product and p.pharmacy_id=p_pharmacy_id and p.operation_id=p_operation_id and p.role='product' and p.created_by=auth.uid() and p.deleted_at is null))
   or (v_expiry is not null and not exists(select 1 from pharmflow_expiry_private.photos p join storage.objects o on o.name=p.path and o.bucket_id='pharmflow-needs-review' where p.path=v_expiry and p.pharmacy_id=p_pharmacy_id and p.operation_id=p_operation_id and p.role='expiry' and p.created_by=auth.uid() and p.deleted_at is null)) then raise exception 'Uploaded role-correct evidence photo required';end if;
  insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,gtin,identifier_display,identifier_key,raw_barcode,pending_quantity,review_reason,source,device_id,created_by,operation_id)
  values(p_pharmacy_id,'EXPIRY',v_identifier,v_identifier,public.pharmflow_identifier_key_v2(v_identifier),p_capture->>'raw_scan',v_qty,'UNKNOWN_GTIN',p_capture->>'source',p_capture->>'device_id',auth.uid(),p_operation_id::text) returning id into v_review;
  insert into pharmflow_expiry_private.review_details(review_id,pharmacy_id,operation_id,worker_name,product_photo_path,expiry_photo_path)
  values(v_review,p_pharmacy_id,p_operation_id,v_worker_name,v_product,v_expiry);
  v_result:=jsonb_build_object('operation_id',p_operation_id,'review_id',v_review,'quantity',v_qty,'product_photo_path',v_product,'expiry_photo_path',v_expiry,'evidence_photo_path',v_product);
 end if;
 update pharmflow_expiry_private.operations set status='COMMITTED',result=v_result where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.can_delete_pharmflow_expiry_staged_photo_v1(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_access(split_part(p_name,'/',1)::uuid,'EXPIRY',true,'can_delete_pharmflow_expiry_staged_photo_v1',NULL);
 RETURN (select auth.uid() is not null and exists(select 1 from pharmflow_expiry_private.photos p join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id) where p.path=p_name and p.created_by=auth.uid() and o.created_by=auth.uid() and o.status='RESERVED' and public.is_pharmacy_member(p.pharmacy_id) is true));
END;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_pharmflow_expiry_capture_v1(p_pharmacy_id uuid, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_row pharmflow_expiry_private.operations%rowtype;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'reserve_pharmflow_expiry_capture_v1',p_operation_id::text);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_operation_id is null then raise exception 'Operation required';end if;
 insert into pharmflow_expiry_private.operations(pharmacy_id,operation_id,created_by) values(p_pharmacy_id,p_operation_id,auth.uid()) on conflict do nothing;
 select * into v_row from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id for update;
 if v_row.created_by<>auth.uid() then raise exception 'Operation owner conflict';end if;
 return jsonb_build_object('operation_id',p_operation_id,'status',v_row.status,'result',v_row.result);
end $function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_expiry_capture_operation_v1(p_pharmacy_id uuid, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'get_pharmflow_expiry_capture_operation_v1',p_operation_id::text);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select result into v_result from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and created_by=auth.uid();return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.authorize_pharmflow_expiry_photo_cleanup_v1(p_pharmacy_id uuid, p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare d pharmflow_expiry_private.review_details%rowtype;v_paths jsonb;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'authorize_pharmflow_expiry_photo_cleanup_v1',NULL);

 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_admin(p_pharmacy_id) is not true then raise exception 'Pharmacy admin required';end if;
 select x.* into d from pharmflow_expiry_private.review_details x join public.pharmflow_needs_review_v2 r on r.id=x.review_id and r.pharmacy_id=x.pharmacy_id where x.review_id=p_review_id and x.pharmacy_id=p_pharmacy_id and r.workflow='EXPIRY' and r.status='RESOLVED';
 if not found then raise exception 'Successfully resolved Expiry review required';end if;
 perform 1 from pharmflow_expiry_private.operations where pharmacy_id=d.pharmacy_id and operation_id=d.operation_id for update;
 update pharmflow_expiry_private.photos set cleanup_by=auth.uid(),cleanup_until=now()+interval '10 minutes' where pharmacy_id=d.pharmacy_id and operation_id=d.operation_id and deleted_at is null;
 select coalesce(jsonb_agg(path),'[]'::jsonb) into v_paths from pharmflow_expiry_private.photos where pharmacy_id=d.pharmacy_id and operation_id=d.operation_id and deleted_at is null;
 return jsonb_build_object('bucket','pharmflow-needs-review','paths',v_paths,'expires_at',now()+interval '10 minutes');
end $function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_workspace_generation(p_pharmacy_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_generation bigint;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_workspace_generation',NULL);

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    insert into public.pharmflow_workspace_generation_v1(pharmacy_id, generation)
    values (p_pharmacy_id, 0) on conflict (pharmacy_id) do nothing;
    select generation into v_generation
    from public.pharmflow_workspace_generation_v1 where pharmacy_id = p_pharmacy_id;
    return coalesce(v_generation, 0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_pharmflow_needs_review_v2(p_pharmacy_id uuid, p_review_id uuid, p_item_code text, p_item_name text, p_resolution_type text, p_resolution_transaction_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_type text := upper(trim(coalesce(p_resolution_type,'')));
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'resolve_pharmflow_needs_review_v2',NULL);

    if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
        raise exception 'Pharmacy admin permission required';
    end if;
  perform 1 from public.pharmflow_needs_review_v2
   where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow<>'RECEIVING' for update;
  if found then raise exception 'Receiving Needs Review case required'; end if;


    if v_type not in ('LINK_ORDER_ITEM','ADD_UNORDERED') then
        raise exception 'Invalid resolution type';
    end if;

    update public.pharmflow_needs_review_v2
       set status = 'RESOLVED',
           resolved_item_code = trim(coalesce(p_item_code,'')),
           resolved_item_name = trim(coalesce(p_item_name,'')),
           resolution_type = v_type,
           resolution_transaction_id = nullif(trim(coalesce(p_resolution_transaction_id,'')),''),
           resolved_by = auth.uid(),
           resolved_at = now(),
           updated_at = now()
     where id = p_review_id
       and pharmacy_id = p_pharmacy_id
       and status = 'PENDING';

    return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_active_order_manifest_v3(p_pharmacy_id uuid)
 RETURNS TABLE(manifest jsonb, revision bigint, updated_at timestamp with time zone, order_files integer, order_items integer, workspace_generation bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_active_order_manifest_v3',NULL);

    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    return query
    select m.manifest, m.revision, m.updated_at,
           jsonb_array_length(coalesce(m.manifest->'orderFiles', '[]'::jsonb)),
           jsonb_array_length(coalesce(m.manifest->'orderData', '[]'::jsonb)),
           m.workspace_generation
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id = p_pharmacy_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_active_order_manifest_meta_v1(p_pharmacy_id uuid)
 RETURNS TABLE(manifest_present boolean, revision bigint, updated_at timestamp with time zone, order_files integer, order_items integer, workspace_generation bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_active_order_manifest_meta_v1',NULL);

    if not public.pharmflow_receiving_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    return query
    select true, m.revision, m.updated_at,
           jsonb_array_length(coalesce(m.manifest->'orderFiles', '[]'::jsonb)),
           jsonb_array_length(coalesce(m.manifest->'orderData', '[]'::jsonb)),
           m.workspace_generation
    from public.pharmflow_active_order_manifest_v1 m
    where m.pharmacy_id = p_pharmacy_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_pharmflow_cloud_workspace(p_pharmacy_id uuid)
 RETURNS TABLE(workspace jsonb, updated_at timestamp with time zone, device_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_cloud_workspace',NULL);

    if not public.pharmflow_can_access_pharmacy(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;
    return query
    select w.workspace, w.updated_at, w.device_id
    from public.pharmflow_cloud_workspaces w
    where w.pharmacy_id = p_pharmacy_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_pharmflow_expiry_session_capture_v1(p_pharmacy_id uuid, p_session_id uuid, p_operation_id uuid, p_capture jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare s pharmflow_expiry_private.active_sessions_v1%rowtype;r jsonb;c pharmflow_expiry_private.session_captures_v1%rowtype;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',true,'save_pharmflow_expiry_session_capture_v1',p_operation_id::text);

 if auth.uid() is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select * into s from pharmflow_expiry_private.active_sessions_v1 where id=p_session_id for update;
 if not found or s.pharmacy_id<>p_pharmacy_id or s.created_by<>auth.uid() or s.device_id is distinct from p_capture->>'device_id' then raise exception 'Session scope mismatch';end if;
 select * into c from pharmflow_expiry_private.session_captures_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if found then
  if c.session_id<>p_session_id then raise exception 'Operation belongs to another session';end if;
  -- Read-only acknowledgement retry remains possible after closure.
  return public.save_pharmflow_expiry_capture_v3(p_pharmacy_id,p_operation_id,p_capture);
 end if;
 if s.closed_at is not null then raise exception 'Session closed';end if;
 if p_capture->>'source' is distinct from 'HANDHELD' then raise exception 'Handheld capture required';end if;
 perform public.reserve_pharmflow_expiry_capture_v1(p_pharmacy_id,p_operation_id);
 perform 1 from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and status='COMMITTED';
 if found then raise exception 'Historical operation cannot join a session';end if;
 r:=public.save_pharmflow_expiry_capture_v3(p_pharmacy_id,p_operation_id,p_capture);
 insert into pharmflow_expiry_private.session_captures_v1(pharmacy_id,operation_id,session_id,quantity)
 values(p_pharmacy_id,p_operation_id,p_session_id,(p_capture->>'quantity')::integer);
 return r;
end $function$;

CREATE OR REPLACE FUNCTION public.list_pharmacy_expiry_captures(p_pharmacy_id uuid, p_expiry_year integer DEFAULT NULL::integer, p_expiry_months integer[] DEFAULT NULL::integer[], p_categories text[] DEFAULT NULL::text[], p_worker_ids uuid[] DEFAULT NULL::uuid[], p_search text DEFAULT NULL::text)
 RETURNS TABLE(capture_id uuid, item_code text, item_name text, gtin text, category text, quantity integer, expiry_month integer, expiry_year integer, worker_id uuid, captured_by_name text, captured_at timestamp with time zone, device_id text, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmacy_expiry_captures',NULL);

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select
        c.id,
        c.item_code,
        c.item_name,
        c.gtin,
        coalesce(c.category,''),
        c.quantity,
        c.expiry_month,
        c.expiry_year,
        c.worker_id,
        c.captured_by_name,
        c.captured_at,
        coalesce(c.device_id,''),
        c.source
    from public.pharmflow_expiry_captures_v1 c
    where c.pharmacy_id = p_pharmacy_id
      and (p_expiry_year is null or c.expiry_year = p_expiry_year)
      and (p_expiry_months is null or c.expiry_month = any(p_expiry_months))
      and (p_categories is null or coalesce(c.category,'') = any(p_categories))
      and (p_worker_ids is null or c.worker_id = any(p_worker_ids))
      and (
          nullif(trim(coalesce(p_search,'')),'') is null
          or lower(c.item_name) like '%' || lower(trim(p_search)) || '%'
          or lower(c.item_code) like '%' || lower(trim(p_search)) || '%'
          or lower(c.gtin) like '%' || lower(trim(p_search)) || '%'
      )
    order by c.expiry_year, c.expiry_month, lower(c.item_name), c.captured_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_pharmacy_expiry_current_state_v1(p_pharmacy_id uuid, p_include_cleared boolean DEFAULT false, p_search text DEFAULT NULL::text)
 RETURNS TABLE(state_id uuid, item_code text, item_name text, identifier_display text, category text, batch_no text, sample_serial text, expiry_month integer, expiry_year integer, verified_quantity integer, worker_id uuid, verified_by_name text, last_verified_at timestamp with time zone, source text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'EXPIRY',false,'list_pharmacy_expiry_current_state_v1',NULL);

    if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    return query
    select s.id,s.item_code,s.item_name,s.identifier_display,coalesce(s.category,''),
           s.batch_no,s.sample_serial,s.expiry_month,s.expiry_year,s.verified_quantity,
           s.worker_id,s.verified_by_name,s.last_verified_at,s.source,s.status
      from public.pharmflow_expiry_current_state_v1 s
     where s.pharmacy_id=p_pharmacy_id
       and (p_include_cleared or s.status='ACTIVE')
       and (
           nullif(btrim(coalesce(p_search,'')),'') is null
           or lower(s.item_name) like '%'||lower(btrim(p_search))||'%'
           or lower(s.item_code) like '%'||lower(btrim(p_search))||'%'
           or lower(s.identifier_display) like '%'||lower(btrim(p_search))||'%'
           or lower(coalesce(s.batch_no,'')) like '%'||lower(btrim(p_search))||'%'
       )
     order by s.expiry_year,s.expiry_month,lower(s.item_name),s.last_verified_at desc;
end
$function$;

CREATE OR REPLACE FUNCTION public.list_pharmflow_global_item_identifiers_v2(p_item_code text)
 RETURNS TABLE(identifier_id uuid, identifier_display text, identifier_key text, mapping_revision bigint, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 PERFORM pharmflow_auth_private.require_access(pharmflow_auth_private.current_pharmacy(),'DATA',false,'list_pharmflow_global_item_identifiers_v2',NULL);

 if auth.uid() is null then raise exception 'Authentication required'; end if;
 return query select i.id,i.identifier_display,i.identifier_key,i.mapping_revision,i.created_at,i.updated_at from public.pharmflow_global_item_identifiers_v2 i where i.item_code = btrim(coalesce(p_item_code,'')) order by i.created_at asc,i.identifier_key asc;
end $function$;

CREATE OR REPLACE FUNCTION public.list_pharmflow_orders(p_pharmacy_id uuid)
 RETURNS SETOF pharmflow_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'list_pharmflow_orders',NULL);
 RETURN QUERY select * from public.pharmflow_orders
    where pharmacy_id=p_pharmacy_id
      and auth.uid() is not null
      and public.is_pharmacy_admin(p_pharmacy_id)
    order by uploaded_at desc;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_pharmflow_identifier_v2(p_pharmacy_id uuid, p_identifier_display text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_key text := public.pharmflow_identifier_key_v2(p_identifier_display);
  v_pharmacy_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_global_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_item public.pharmflow_global_items_v2%rowtype;
begin
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',false,'resolve_pharmflow_identifier_v2',NULL);

  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
    raise exception 'Pharmacy access required';
  end if;
  if v_key = '' then
    raise exception 'Identifier is required';
  end if;

  select * into v_pharmacy_mapping
    from public.pharmflow_pharmacy_gtin_v1
   where pharmacy_id = p_pharmacy_id
     and identifier_key = v_key;
  if v_pharmacy_mapping.id is not null then
    select * into v_item from public.pharmflow_global_items_v2
     where item_code = v_pharmacy_mapping.item_code;
    return jsonb_build_object(
      'found', true, 'source', 'PHARMACY_V2', 'mappingScope', 'PHARMACY',
      'identifierId', v_pharmacy_mapping.id,
      'mappingRevision', v_pharmacy_mapping.mapping_revision,
      'identifierDisplay', v_pharmacy_mapping.identifier_display,
      'identifierKey', v_pharmacy_mapping.identifier_key,
      'itemCode', v_pharmacy_mapping.item_code,
      'itemName', v_pharmacy_mapping.item_name,
      'groupName', v_item.group_name
    );
  end if;

  select * into v_global_mapping
    from public.pharmflow_global_item_identifiers_v2
   where identifier_key = v_key;
  if v_global_mapping.id is null then
    return jsonb_build_object('found', false, 'identifierDisplay', btrim(p_identifier_display), 'identifierKey', v_key);
  end if;
  select * into v_item from public.pharmflow_global_items_v2 where item_code = v_global_mapping.item_code;
  return jsonb_build_object(
    'found', true, 'source', 'GLOBAL_V2', 'mappingScope', 'GLOBAL',
    'identifierId', v_global_mapping.id, 'mappingRevision', v_global_mapping.mapping_revision,
    'identifierDisplay', v_global_mapping.identifier_display, 'identifierKey', v_global_mapping.identifier_key,
    'itemCode', v_item.item_code, 'itemName', v_item.item_name,
    'groupName', v_item.group_name, 'category', v_item.category, 'subCategory', v_item.sub_category
  );
end;
$function$;

