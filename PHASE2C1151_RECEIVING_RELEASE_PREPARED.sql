-- PharmFlow Receiving Release — PREPARED ONLY.
-- Additive/backward-compatible migration. Do not apply to production until approved.
alter table public.pharmflow_global_gtin_v1 add column if not exists group_name text not null default '';
alter table public.pharmflow_global_gtin_v1 add column if not exists sub_category text not null default '';
alter table public.pharmflow_global_gtin_import_rows_v1 add column if not exists group_name text not null default '';
alter table public.pharmflow_global_gtin_import_rows_v1 add column if not exists sub_category text not null default '';
alter table public.pharmflow_order_source_items add column if not exists group_name text not null default '';
alter table public.pharmflow_order_source_items add column if not exists sub_category text not null default '';

create or replace function public.append_pharmflow_receiving_action_v4(
 p_pharmacy_id uuid,p_transaction_id text,p_order_number text,p_item_code text,p_item_name text,
 p_gtin text,p_quantity integer,p_source text,p_device_id text,p_occurred_at timestamptz,p_payload jsonb
) returns table(acknowledged boolean,inserted boolean,authoritative_received bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_existing public.pharmflow_receiving_transactions_v1%rowtype; v_inserted boolean:=false;
begin
 if auth.uid() is null or not public.pharmflow_receiving_member_v2(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 if nullif(trim(coalesce(p_transaction_id,'')),'') is null then raise exception 'Transaction ID required'; end if;
 if nullif(trim(coalesce(p_item_code,'')),'') is null then raise exception 'Item Code required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||coalesce(trim(p_order_number),'')||'|'||trim(p_item_code),0));
 select * into v_existing from public.pharmflow_receiving_transactions_v1
  where pharmacy_id=p_pharmacy_id and transaction_id=trim(p_transaction_id);
 if found then
   if coalesce(v_existing.order_number,'')<>coalesce(nullif(trim(coalesce(p_order_number,'')),''),'')
      or v_existing.item_code<>trim(p_item_code) or v_existing.quantity<>coalesce(p_quantity,0)
      or coalesce(v_existing.gtin,'')<>coalesce(p_gtin,'') then
      raise exception 'Transaction ID content mismatch';
   end if;
 else
   insert into public.pharmflow_receiving_transactions_v1(
    pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload,created_by
   ) values(
    p_pharmacy_id,trim(p_transaction_id),nullif(trim(coalesce(p_order_number,'')),''),
    trim(p_item_code),coalesce(p_item_name,''),coalesce(p_gtin,''),coalesce(p_quantity,0),
    coalesce(p_source,'RECEIVING'),coalesce(p_device_id,''),coalesce(p_occurred_at,now()),coalesce(p_payload,'{}'::jsonb),auth.uid()
   );
   v_inserted:=true;
 end if;
 return query select true,v_inserted,coalesce(sum(t.quantity),0)::bigint
 from public.pharmflow_receiving_transactions_v1 t
 where t.pharmacy_id=p_pharmacy_id and t.item_code=trim(p_item_code)
   and coalesce(t.order_number,'')=coalesce(nullif(trim(coalesce(p_order_number,'')),''),'');
end $$;
revoke all on function public.append_pharmflow_receiving_action_v4(uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb) from public,anon;
grant execute on function public.append_pharmflow_receiving_action_v4(uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb) to authenticated;

create or replace function public.list_pharmflow_needs_review_history_v3(p_pharmacy_id uuid,p_workflow text default 'RECEIVING',p_order_number text default null)
returns table(review_id uuid,workflow text,session_id text,order_number text,order_name text,gtin text,raw_barcode text,pending_quantity integer,review_reason text,master_item_code_hint text,master_item_name_hint text,photo_path text,source text,device_id text,status text,resolved_item_code text,resolved_item_name text,resolution_type text,resolution_transaction_id text,created_at timestamptz,updated_at timestamptz,resolved_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 return query select r.id,r.workflow,coalesce(r.session_id,''),coalesce(r.order_number,''),coalesce(r.order_name,''),r.gtin,coalesce(r.raw_barcode,''),r.pending_quantity,r.review_reason,coalesce(r.master_item_code_hint,''),coalesce(r.master_item_name_hint,''),coalesce(r.photo_path,''),r.source,coalesce(r.device_id,''),r.status,coalesce(r.resolved_item_code,''),coalesce(r.resolved_item_name,''),coalesce(r.resolution_type,''),coalesce(r.resolution_transaction_id,''),r.created_at,r.updated_at,r.resolved_at
 from public.pharmflow_needs_review_v2 r where r.pharmacy_id=p_pharmacy_id and r.workflow=upper(trim(coalesce(p_workflow,'RECEIVING')))
 and (nullif(trim(coalesce(p_order_number,'')),'') is null or coalesce(r.order_number,'')=trim(p_order_number))
 order by r.updated_at desc,r.created_at desc;
end $$;
revoke all on function public.list_pharmflow_needs_review_history_v3(uuid,text,text) from public,anon;
grant execute on function public.list_pharmflow_needs_review_history_v3(uuid,text,text) to authenticated;

create or replace function public.append_global_master_gtin_import_v2(p_import_id uuid,p_records jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer:=0;
begin
 if auth.uid() is null or not public.is_system_owner() then raise exception 'System Owner permission required'; end if;
 if not exists(select 1 from public.pharmflow_global_gtin_imports_v1 i where i.id=p_import_id and i.created_by=auth.uid()) then raise exception 'Global GTIN import not found'; end if;
 insert into public.pharmflow_global_gtin_import_rows_v1(import_id,item_code,gtin,item_name,group_name,category,sub_category)
 select p_import_id,trim(coalesce(r->>'itemCode',r->>'item_code','')),regexp_replace(coalesce(r->>'gtin',''),'[^0-9]','','g'),
 coalesce(r->>'itemName',r->>'item_name',''),coalesce(r->>'group_name',r->>'groupName',''),coalesce(r->>'category',''),coalesce(r->>'sub_category',r->>'subCategory','')
 from jsonb_array_elements(coalesce(p_records,'[]'::jsonb)) r
 where nullif(trim(coalesce(r->>'itemCode',r->>'item_code','')),'') is not null and nullif(regexp_replace(coalesce(r->>'gtin',''),'[^0-9]','','g'),'') is not null;
 get diagnostics v_count=row_count; return v_count;
end $$;
revoke all on function public.append_global_master_gtin_import_v2(uuid,jsonb) from public,anon;
grant execute on function public.append_global_master_gtin_import_v2(uuid,jsonb) to authenticated;

create or replace function public.commit_global_master_gtin_import_v2(p_import_id uuid)
returns table(version text,item_count integer) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_source text;v_version text:=gen_random_uuid()::text;v_count integer;
begin
 if auth.uid() is null or not public.is_system_owner() then raise exception 'System Owner permission required'; end if;
 select source_file into v_source from public.pharmflow_global_gtin_imports_v1 where id=p_import_id and created_by=auth.uid();
 if not found then raise exception 'Global GTIN import not found'; end if;
 insert into public.pharmflow_global_gtin_conflicts_v1(import_id,gtin,existing_item_code,incoming_item_code,incoming_item_name,reason,created_by)
 select p_import_id,r.gtin,null,r.item_code,max(r.item_name),'SAME FILE: GTIN linked to multiple Item Codes',auth.uid()
 from public.pharmflow_global_gtin_import_rows_v1 r where r.import_id=p_import_id and r.gtin in(
  select x.gtin from public.pharmflow_global_gtin_import_rows_v1 x where x.import_id=p_import_id group by x.gtin having count(distinct x.item_code)>1
 ) group by r.gtin,r.item_code;
 insert into public.pharmflow_global_gtin_conflicts_v1(import_id,gtin,existing_item_code,incoming_item_code,incoming_item_name,reason,created_by)
 select distinct p_import_id,r.gtin,g.item_code,r.item_code,r.item_name,'GLOBAL MASTER: GTIN already linked to a different Item Code',auth.uid()
 from public.pharmflow_global_gtin_import_rows_v1 r join public.pharmflow_global_gtin_v1 g on g.gtin=r.gtin and g.item_code<>r.item_code where r.import_id=p_import_id;
 insert into public.pharmflow_global_gtin_v1(item_code,gtin,item_name,group_name,category,sub_category)
 select r.item_code,r.gtin,max(r.item_name),max(r.group_name),max(r.category),max(r.sub_category)
 from public.pharmflow_global_gtin_import_rows_v1 r where r.import_id=p_import_id
 and r.gtin not in(select x.gtin from public.pharmflow_global_gtin_import_rows_v1 x where x.import_id=p_import_id group by x.gtin having count(distinct x.item_code)>1)
 and not exists(select 1 from public.pharmflow_global_gtin_v1 g where g.gtin=r.gtin and g.item_code<>r.item_code)
 group by r.item_code,r.gtin
 on conflict(item_code,gtin) do update set
 item_name=case when excluded.item_name<>'' then excluded.item_name else public.pharmflow_global_gtin_v1.item_name end,
 group_name=case when excluded.group_name<>'' then excluded.group_name else public.pharmflow_global_gtin_v1.group_name end,
 category=case when excluded.category<>'' then excluded.category else public.pharmflow_global_gtin_v1.category end,
 sub_category=case when excluded.sub_category<>'' then excluded.sub_category else public.pharmflow_global_gtin_v1.sub_category end;
 select count(*) into v_count from public.pharmflow_global_gtin_v1;
 update public.pharmflow_global_gtin_meta_v1 set version=v_version,source_file=coalesce(v_source,''),item_count=v_count,updated_at=now(),updated_by=auth.uid() where singleton=true;
 delete from public.pharmflow_global_gtin_imports_v1 where id=p_import_id;
 return query select v_version,v_count;
end $$;
revoke all on function public.commit_global_master_gtin_import_v2(uuid) from public,anon;
grant execute on function public.commit_global_master_gtin_import_v2(uuid) to authenticated;

create or replace function public.get_global_master_gtin_page_v2(p_offset integer default 0,p_limit integer default 1000)
returns table(item_code text,gtin text,item_name text,group_name text,category text,sub_category text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 return query select g.item_code,g.gtin,g.item_name,g.group_name,g.category,g.sub_category from public.pharmflow_global_gtin_v1 g order by g.id
 offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,1000),1),2000);
end $$;
revoke all on function public.get_global_master_gtin_page_v2(integer,integer) from public,anon;
grant execute on function public.get_global_master_gtin_page_v2(integer,integer) to authenticated;

create or replace function public.save_pharmflow_order_source_items_v2(p_pharmacy_id uuid,p_order_number text,p_items jsonb,p_replace boolean default false)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order_id uuid;v_count integer:=0;
begin
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access required'; end if;
 select id into v_order_id from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and upper(regexp_replace(order_number,'\\s','','g'))=upper(regexp_replace(p_order_number,'\\s','','g')) limit 1;
 if v_order_id is null then raise exception 'Order % is not registered',p_order_number; end if;
 if p_replace then
  if exists(select 1 from public.pharmflow_orders where id=v_order_id and status='received') then raise exception 'Received order source data is immutable'; end if;
  delete from public.pharmflow_order_source_items where order_id=v_order_id;
 end if;
 insert into public.pharmflow_order_source_items(pharmacy_id,order_id,order_number,line_no,item_code,item_name,ordered_qty,group_name,category,sub_category,source_sheet,source_row)
 select p_pharmacy_id,v_order_id,upper(regexp_replace(trim(p_order_number),'\\s','','g')),(x->>'line_no')::integer,trim(x->>'item_code'),coalesce(x->>'item_name',''),(x->>'ordered_qty')::numeric,coalesce(x->>'group_name',''),coalesce(x->>'category',''),coalesce(x->>'sub_category',''),coalesce(x->>'source_sheet',''),nullif(x->>'source_row','')::integer
 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where nullif(trim(x->>'item_code'),'') is not null and coalesce((x->>'ordered_qty')::numeric,0)>0
 on conflict(order_id,line_no) do update set item_code=excluded.item_code,item_name=excluded.item_name,ordered_qty=excluded.ordered_qty,group_name=excluded.group_name,category=excluded.category,sub_category=excluded.sub_category,source_sheet=excluded.source_sheet,source_row=excluded.source_row;
 get diagnostics v_count=row_count;return v_count;
end $$;
revoke all on function public.save_pharmflow_order_source_items_v2(uuid,text,jsonb,boolean) from public,anon;
grant execute on function public.save_pharmflow_order_source_items_v2(uuid,text,jsonb,boolean) to authenticated;

create or replace function public.get_pharmflow_order_source_items_v2(p_pharmacy_id uuid,p_order_number text)
returns setof public.pharmflow_order_source_items language sql security definer set search_path=public,pg_temp as $$
 select i.* from public.pharmflow_order_source_items i where i.pharmacy_id=p_pharmacy_id
 and upper(regexp_replace(i.order_number,'\\s','','g'))=upper(regexp_replace(p_order_number,'\\s','','g'))
 and auth.uid() is not null and public.is_pharmacy_admin(p_pharmacy_id) order by i.line_no;
$$;
revoke all on function public.get_pharmflow_order_source_items_v2(uuid,text) from public,anon;
grant execute on function public.get_pharmflow_order_source_items_v2(uuid,text) to authenticated;
