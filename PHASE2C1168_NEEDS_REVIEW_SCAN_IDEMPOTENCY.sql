-- PharmFlow Needs Review durable scan idempotency
-- Additive/backward-compatible: existing V4 callers remain unchanged.
alter table public.pharmflow_needs_review_v2 add column if not exists operation_id text;
create unique index if not exists ux_pf_nr_v2_pharmacy_operation on public.pharmflow_needs_review_v2(pharmacy_id,operation_id) where operation_id is not null;

create or replace function public.create_pharmflow_needs_review_v5(
 p_operation_id text,p_pharmacy_id uuid,p_workflow text,p_identifier_display text,p_raw_barcode text default null,p_session_id text default null,p_order_number text default null,p_order_name text default null,p_review_reason text default 'UNKNOWN_GTIN',p_master_item_code_hint text default null,p_master_item_name_hint text default null,p_source text default 'HANDHELD',p_device_id text default null,p_work_scope_order_numbers text[] default null
) returns table(review_id uuid,pending_quantity integer,created_at timestamptz,status text)
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare v_operation text:=nullif(btrim(coalesce(p_operation_id,'')),'');v_display text:=btrim(coalesce(p_identifier_display,''));v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);v_order text:=nullif(btrim(coalesce(p_order_number,'')),'');v_scope text[];v_id uuid;v_time timestamptz;v_qty integer;v_status text;
begin
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
 if v_operation is null then raise exception 'Operation ID is required';end if;
 if v_key='' then raise exception 'Identifier is required';end if;
 if upper(trim(coalesce(p_workflow,'RECEIVING')))<>'RECEIVING' then raise exception 'Invalid workflow';end if;
 if upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))) not in ('UNKNOWN_GTIN','KNOWN_NOT_IN_ORDER','MANUAL_REQUIRED') then raise exception 'Invalid review reason';end if;
 if upper(btrim(coalesce(p_source,'HANDHELD'))) not in ('HANDHELD','PC') then raise exception 'Invalid source';end if;

 select r.id,r.pending_quantity,r.created_at,r.status into v_id,v_qty,v_time,v_status from public.pharmflow_needs_review_v2 r where r.pharmacy_id=p_pharmacy_id and r.operation_id=v_operation limit 1;
 if found then return query select v_id,v_qty,v_time,v_status;return;end if;

 select coalesce(array_agg(distinct btrim(x) order by btrim(x)),array[]::text[]) into v_scope from unnest(coalesce(p_work_scope_order_numbers,array[]::text[])) x where btrim(coalesce(x,''))<>'';
 if v_order is not null and not(v_order=any(v_scope)) then v_scope:=array_append(v_scope,v_order);end if;
 if coalesce(array_length(v_scope,1),0)=0 then raise exception 'Receiving work scope is required';end if;
 if v_order is null and array_length(v_scope,1)=1 then v_order:=v_scope[1];end if;
 if exists(select 1 from unnest(v_scope) s where not exists(select 1 from public.pharmflow_orders o where o.pharmacy_id=p_pharmacy_id and o.order_number=s and o.status='uploaded')) then raise exception 'Receiving work scope contains an unavailable Order';end if;

 begin
  insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,session_id,order_number,order_name,gtin,raw_barcode,identifier_display,identifier_key,pending_quantity,review_reason,master_item_code_hint,master_item_name_hint,source,device_id,created_by,work_scope_order_numbers,operation_id)
  values(p_pharmacy_id,'RECEIVING',nullif(btrim(coalesce(p_session_id,'')),''),v_order,nullif(btrim(coalesce(p_order_name,'')),''),v_display,nullif(p_raw_barcode,''),v_display,v_key,1,upper(btrim(coalesce(p_review_reason,'UNKNOWN_GTIN'))),nullif(btrim(coalesce(p_master_item_code_hint,'')),''),nullif(btrim(coalesce(p_master_item_name_hint,'')),''),upper(btrim(coalesce(p_source,'HANDHELD'))),nullif(btrim(coalesce(p_device_id,'')),''),auth.uid(),v_scope,v_operation)
  returning id,pharmflow_needs_review_v2.pending_quantity,pharmflow_needs_review_v2.created_at,pharmflow_needs_review_v2.status into v_id,v_qty,v_time,v_status;
 exception when unique_violation then
  select r.id,r.pending_quantity,r.created_at,r.status into v_id,v_qty,v_time,v_status from public.pharmflow_needs_review_v2 r where r.pharmacy_id=p_pharmacy_id and r.operation_id=v_operation;
  if not found then raise;end if;
 end;
 return query select v_id,v_qty,v_time,v_status;
end;$$;
revoke all on function public.create_pharmflow_needs_review_v5(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text[]) from public,anon;
grant execute on function public.create_pharmflow_needs_review_v5(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text[]) to authenticated;
select pg_notify('pgrst','reload schema');
