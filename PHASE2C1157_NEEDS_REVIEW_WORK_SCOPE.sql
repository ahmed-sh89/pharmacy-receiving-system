-- PHASE2C1157 — additive multi-order Needs Review work-scope snapshot.
-- Backward compatible: existing order_number remains authoritative when present.
alter table public.pharmflow_needs_review_v2
  add column if not exists work_scope_order_numbers text[];

create or replace function public.create_pharmflow_needs_review_v4(
  p_pharmacy_id uuid,p_workflow text,p_identifier_display text,p_raw_barcode text default null,
  p_session_id text default null,p_order_number text default null,p_order_name text default null,
  p_review_reason text default 'UNKNOWN_GTIN',p_master_item_code_hint text default null,
  p_master_item_name_hint text default null,p_source text default 'HANDHELD',p_device_id text default null,
  p_work_scope_order_numbers text[] default null
) returns table(review_id uuid,pending_quantity integer,created_at timestamptz)
language plpgsql security definer set search_path='public','pg_temp' as $$
declare
  v_display text:=btrim(coalesce(p_identifier_display,''));
  v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
  v_order text:=nullif(btrim(coalesce(p_order_number,'')),'');
  v_scope text[];
  v_id uuid; v_time timestamptz;
begin
  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  if v_key='' then raise exception 'Identifier is required'; end if;
  if upper(trim(coalesce(p_workflow,'RECEIVING'))) <> 'RECEIVING' then raise exception 'Invalid workflow'; end if;
  if upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))) not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason'; end if;
  if upper(btrim(coalesce(p_source,'HANDHELD'))) not in ('HANDHELD','PC') then raise exception 'Invalid source'; end if;

  select coalesce(array_agg(distinct btrim(x) order by btrim(x)),array[]::text[])
    into v_scope from unnest(coalesce(p_work_scope_order_numbers,array[]::text[])) x
    where btrim(coalesce(x,''))<>'';

  if v_order is not null and not (v_order=any(v_scope)) then v_scope:=array_append(v_scope,v_order); end if;
  if coalesce(array_length(v_scope,1),0)=0 then raise exception 'Receiving work scope is required'; end if;
  if v_order is null and array_length(v_scope,1)=1 then v_order:=v_scope[1]; end if;

  if exists(
    select 1 from unnest(v_scope) s
    where not exists(select 1 from public.pharmflow_orders o where o.pharmacy_id=p_pharmacy_id and o.order_number=s and o.status='uploaded')
  ) then raise exception 'Receiving work scope contains an unavailable Order'; end if;

  insert into public.pharmflow_needs_review_v2(
    pharmacy_id,workflow,session_id,order_number,order_name,gtin,raw_barcode,identifier_display,identifier_key,
    pending_quantity,review_reason,master_item_code_hint,master_item_name_hint,source,device_id,created_by,work_scope_order_numbers
  ) values(
    p_pharmacy_id,'RECEIVING',nullif(btrim(coalesce(p_session_id,'')),''),v_order,nullif(btrim(coalesce(p_order_name,'')),''),
    v_display,nullif(p_raw_barcode,''),v_display,v_key,1,upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),
    nullif(btrim(coalesce(p_master_item_code_hint,'')),''),nullif(btrim(coalesce(p_master_item_name_hint,'')),''),
    upper(btrim(coalesce(p_source,'HANDHELD'))),nullif(btrim(coalesce(p_device_id,'')),''),auth.uid(),v_scope
  ) returning id,pharmflow_needs_review_v2.created_at into v_id,v_time;
  return query select v_id,1,v_time;
end $$;

create or replace function public.list_pharmflow_needs_review_v4(
 p_pharmacy_id uuid,p_workflow text default 'RECEIVING',p_order_number text default null
) returns table(
 review_id uuid,workflow text,session_id text,order_number text,order_name text,gtin text,raw_barcode text,
 pending_quantity integer,review_reason text,master_item_code_hint text,master_item_name_hint text,photo_path text,
 source text,device_id text,created_at timestamptz,identifier_display text,work_scope_order_numbers text[]
) language plpgsql stable security definer set search_path='public','pg_temp' as $$
begin
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
 return query select r.id,r.workflow,coalesce(r.session_id,''),coalesce(r.order_number,''),coalesce(r.order_name,''),
  r.gtin,coalesce(r.raw_barcode,''),r.pending_quantity,r.review_reason,coalesce(r.master_item_code_hint,''),
  coalesce(r.master_item_name_hint,''),coalesce(r.photo_path,''),r.source,coalesce(r.device_id,''),r.created_at,
  coalesce(r.identifier_display,r.gtin),coalesce(r.work_scope_order_numbers,
    case when nullif(btrim(coalesce(r.order_number,'')),'') is null then array[]::text[] else array[r.order_number] end)
 from public.pharmflow_needs_review_v2 r
 where r.pharmacy_id=p_pharmacy_id and r.status='PENDING'
 and r.workflow=upper(trim(coalesce(p_workflow,'RECEIVING')))
 and (nullif(trim(coalesce(p_order_number,'')),'') is null or r.order_number=trim(p_order_number)
      or trim(p_order_number)=any(coalesce(r.work_scope_order_numbers,array[]::text[])))
 order by r.created_at desc;
end $$;

create or replace function public.assign_pharmflow_needs_review_order_v1(
 p_pharmacy_id uuid,p_review_id uuid,p_order_number text
) returns table(success boolean,order_number text)
language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_review public.pharmflow_needs_review_v2%rowtype; v_order text:=btrim(coalesce(p_order_number,''));
begin
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin access required';end if;
 select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id for update;
 if v_review.id is null or v_review.status<>'PENDING' then raise exception 'Needs Review case is unavailable';end if;
 if nullif(v_order,'') is null or not (v_order=any(coalesce(v_review.work_scope_order_numbers,array[]::text[]))) then raise exception 'Order is outside the captured Receiving work scope';end if;
 if not exists(select 1 from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and order_number=v_order and status='uploaded') then raise exception 'Selected Order is unavailable';end if;
 update public.pharmflow_needs_review_v2 set order_number=v_order,order_name=v_order,updated_at=now(),
   resolution_block_code=null,resolution_block_detail=null where id=v_review.id;
 return query select true,v_order;
end $$;

revoke all on function public.create_pharmflow_needs_review_v4(uuid,text,text,text,text,text,text,text,text,text,text,text,text[]) from public,anon;
revoke all on function public.list_pharmflow_needs_review_v4(uuid,text,text) from public,anon;
revoke all on function public.assign_pharmflow_needs_review_order_v1(uuid,uuid,text) from public,anon;
grant execute on function public.create_pharmflow_needs_review_v4(uuid,text,text,text,text,text,text,text,text,text,text,text,text[]) to authenticated;
grant execute on function public.list_pharmflow_needs_review_v4(uuid,text,text) to authenticated;
grant execute on function public.assign_pharmflow_needs_review_order_v1(uuid,uuid,text) to authenticated;
