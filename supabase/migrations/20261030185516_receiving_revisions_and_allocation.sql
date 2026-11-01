-- STAGING DEVELOPMENT ONLY. No Production application is authorized.
-- Atomic revisions and compensating allocations; original receiving rows are immutable.
create schema if not exists pharmflow_receiving_private;
revoke all on schema pharmflow_receiving_private from public,anon,authenticated;
create table pharmflow_receiving_private.operations_v1(
 pharmacy_id uuid not null references public.pharmacies(id), operation_id uuid not null,
 kind text not null, request jsonb not null, before_state jsonb not null,
 result jsonb not null, actor uuid not null, created_at timestamptz not null default now(),
 primary key(pharmacy_id,operation_id)
);
alter table pharmflow_receiving_private.operations_v1 enable row level security;
revoke all on pharmflow_receiving_private.operations_v1 from public,anon,authenticated;

create function public.revise_pharmflow_receiving_order_v1(
 p_pharmacy_id uuid,p_operation_id uuid,p_order_number text,p_file jsonb,
 p_expected_generation bigint,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.pharmflow_active_order_manifest_v1%rowtype; prior pharmflow_receiving_private.operations_v1%rowtype;
 req jsonb; before_source jsonb; files jsonb; items jsonb; f jsonb; o text:=upper(trim(p_order_number)); result jsonb;
begin
 perform pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'revise_pharmflow_receiving_order_v1');
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access required'; end if;
 if p_operation_id is null or o is null or o='' then raise exception 'Operation and Order required'; end if;
 req:=jsonb_build_object('order',o,'file',p_file,'generation',p_expected_generation,'revision',p_expected_revision);
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|revision|'||p_operation_id::text,0));
 select * into prior from pharmflow_receiving_private.operations_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if found then if prior.kind<>'REVISION' or prior.request<>req then raise exception 'Operation ID content mismatch';end if;return prior.result;end if;
 perform 1 from public.pharmflow_workspace_generation_v1 where pharmacy_id=p_pharmacy_id and generation=p_expected_generation for update;
 if not found then raise exception 'STALE_WORKSPACE_GENERATION';end if;
 select * into m from public.pharmflow_active_order_manifest_v1 where pharmacy_id=p_pharmacy_id for update;
 if not found or m.revision<>p_expected_revision or m.workspace_generation<>p_expected_generation then raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';end if;
 select value into f from jsonb_array_elements(m.manifest->'orderFiles') where upper(trim(value->>'documentId'))=o;
 if f is null or upper(trim(p_file->>'documentId')) is distinct from o then raise exception 'Order identity mismatch';end if;
 if jsonb_typeof(p_file->'sourceRows') is distinct from 'array' or jsonb_array_length(p_file->'sourceRows') not between 1 and 10000 then raise exception 'Invalid order rows';end if;
 if exists(select 1 from jsonb_array_elements(p_file->'sourceRows') r where nullif(trim(r->>'itemCode'),'') is null or nullif(trim(r->>'itemName'),'') is null or coalesce((r->>'orderedQty')::numeric,0)<=0 or (r->>'orderedQty')::numeric<>trunc((r->>'orderedQty')::numeric)) then raise exception 'Invalid item or ordered quantity';end if;
 if (select count(*) from jsonb_array_elements(m.manifest->'orderFiles') where upper(trim(value->>'documentId'))=o)<>1 then raise exception 'Duplicate active Order';end if;
 if not exists(select 1 from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and order_number=o and status='uploaded') then raise exception 'Active uploaded Order required';end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by line_no),'[]') into before_source from public.pharmflow_order_source_items s where pharmacy_id=p_pharmacy_id and order_number=o;
 -- Stable source-line comparison: a renamed identical workbook is not a revision.
 if (select jsonb_agg(jsonb_build_array(r->>'itemCode',r->>'itemName',(r->>'orderedQty')::numeric) order by n) from jsonb_array_elements(f->'sourceRows') with ordinality a(r,n))
 = (select jsonb_agg(jsonb_build_array(r->>'itemCode',r->>'itemName',(r->>'orderedQty')::numeric) order by n) from jsonb_array_elements(p_file->'sourceRows') with ordinality a(r,n)) then raise exception 'ORDER_REVISION_NO_CHANGES';end if;
 select jsonb_agg(case when upper(trim(x->>'documentId'))=o then f||p_file||jsonb_build_object('rows',jsonb_array_length(p_file->'sourceRows'),'revisionOperation',p_operation_id,'importedAt',now()) else x end order by n)
 into files from jsonb_array_elements(m.manifest->'orderFiles') with ordinality a(x,n);
 -- Rebuild ordered totals from current source files, never from receiving totals.
 with source as(select r,upper(trim(x->>'documentId')) ord from jsonb_array_elements(files) x cross join lateral jsonb_array_elements(x->'sourceRows') r),
 grouped as(select trim(r->>'itemCode') code,max(r->>'itemName') name,sum((r->>'orderedQty')::numeric) qty,jsonb_agg(distinct ord) orders from source group by trim(r->>'itemCode')),
 rebuilt as(select coalesce((select old from jsonb_array_elements(m.manifest->'orderData') old where trim(old->>'itemCode')=g.code limit 1),'{}')||jsonb_build_object('itemCode',g.code,'itemName',g.name,'orderedQty',g.qty,'receivedQty',0,'remainingQty',g.qty,'manual',false,'orderNumbers',g.orders) value from grouped g
 union all select old||jsonb_build_object('orderedQty',0,'remainingQty',0,'manual',true) from jsonb_array_elements(m.manifest->'orderData') old where not exists(select 1 from grouped g where g.code=trim(old->>'itemCode')))
 select jsonb_agg(value order by value->>'itemCode') into items from rebuilt;
 perform public.save_pharmflow_order_source_items_v2(p_pharmacy_id,o,
 (select jsonb_agg(jsonb_build_object('line_no',n,'item_code',trim(r->>'itemCode'),'item_name',r->>'itemName','ordered_qty',(r->>'orderedQty')::numeric,'group_name',coalesce(r->>'group_name',''),'category',coalesce(r->>'category',''),'sub_category',coalesce(r->>'sub_category',''),'source_sheet',coalesce(r->>'sourceSheet',''),'source_row',coalesce((r->>'sourceRow')::integer,0))) from jsonb_array_elements(p_file->'sourceRows') with ordinality a(r,n)),true);
 update public.pharmflow_orders set source_file=p_file->>'name',item_count=jsonb_array_length(p_file->'sourceRows') where pharmacy_id=p_pharmacy_id and order_number=o;
 update public.pharmflow_active_order_manifest_v1 set manifest=jsonb_set(jsonb_set(manifest,'{orderFiles}',files),'{orderData}',items),revision=revision+1,updated_at=now(),updated_by=auth.uid() where pharmacy_id=p_pharmacy_id returning * into m;
 update public.pharmflow_cloud_workspaces set workspace=workspace||m.manifest,updated_at=now(),updated_by=auth.uid() where pharmacy_id=p_pharmacy_id;
 result:=jsonb_build_object('operationId',p_operation_id,'revision',m.revision,'rows',jsonb_array_length(p_file->'sourceRows'));
 insert into pharmflow_receiving_private.operations_v1 values(p_pharmacy_id,p_operation_id,'REVISION',req,jsonb_build_object('file',f,'source',before_source),result,auth.uid(),now());
 return result;
end $$;

create function public.allocate_pharmflow_receiving_v1(
 p_pharmacy_id uuid,p_operation_id uuid,p_transaction_id text,p_allocations jsonb,
 p_expected_revision bigint,p_expected_balance bigint,p_reason text,p_device_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.pharmflow_receiving_transactions_v1%rowtype; m public.pharmflow_active_order_manifest_v1%rowtype;
 prior pharmflow_receiving_private.operations_v1%rowtype; a jsonb; req jsonb; result jsonb; balance bigint; moved bigint; qty bigint; total bigint; ord text; k text; idx int:=0; txid text;
begin
 perform pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',true,'allocate_pharmflow_receiving_v1');
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access required';end if;
 if p_operation_id is null or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Operation and correction reason required';end if;
 if jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) not between 1 and 20 then raise exception 'Invalid allocation';end if;
 req:=jsonb_build_object('transaction',p_transaction_id,'allocations',p_allocations,'revision',p_expected_revision,'balance',p_expected_balance,'reason',p_reason,'device',p_device_id);
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|allocation|'||p_operation_id::text,0));
 select * into prior from pharmflow_receiving_private.operations_v1 where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if found then if prior.kind<>'ALLOCATION' or prior.request<>req then raise exception 'Operation ID content mismatch';end if;return prior.result;end if;
 select * into m from public.pharmflow_active_order_manifest_v1 where pharmacy_id=p_pharmacy_id for share;
 if not found or m.revision<>p_expected_revision then raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';end if;
 select * into t from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and transaction_id=p_transaction_id;
 if not found or t.quantity<=0 then raise exception 'Positive source receipt required';end if;
 -- Same locks as the existing append action. Stable ordering prevents opposing
 -- A->B/B->A corrections from deadlocking and protects balance checks from scans.
 for k in select distinct coalesce(q.ord,'') from (select t.order_number ord union all select upper(trim(x->>'orderNumber')) from jsonb_array_elements(p_allocations) x) q order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||k||'|'||t.item_code,0));
 end loop;
 select coalesce(sum(quantity),0) into balance from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and item_code=t.item_code and coalesce(order_number,'')=coalesce(t.order_number,'');
 if balance is distinct from p_expected_balance then raise exception 'STALE_RECEIVING_BALANCE';end if;
 select coalesce(sum((audit.result->>'moved')::bigint),0) into moved from pharmflow_receiving_private.operations_v1 audit where audit.pharmacy_id=p_pharmacy_id and audit.kind='ALLOCATION' and audit.request->>'transaction'=p_transaction_id;
 total:=0;
 for a in select value from jsonb_array_elements(p_allocations) loop
  ord:=upper(trim(coalesce(a->>'orderNumber','')));
  if coalesce(a->>'quantity','') !~ '^[0-9]+$' then raise exception 'Positive whole quantity required';end if;qty:=(a->>'quantity')::bigint;
  if qty is null or qty<=0 or (a->>'quantity')::numeric<>qty or qty>2147483647 then raise exception 'Positive whole quantity required';end if;
  if ord='' or ord=coalesce(t.order_number,'') or not exists(select 1 from jsonb_array_elements(m.manifest->'orderFiles') f where upper(trim(f->>'documentId'))=ord) then raise exception 'Active distinct target Order required';end if;
  total:=total+qty;
 end loop;
 if total>t.quantity-moved or total>balance then raise exception 'Allocation exceeds available receipt quantity';end if;
 -- Append a compensating source entry and target entries in ONE transaction.
 -- Original item/user/time/provenance remains on the original immutable row.
 for a in select jsonb_build_object('orderNumber',coalesce(t.order_number,''),'quantity',-total) union all select value from jsonb_array_elements(p_allocations) loop
  idx:=idx+1;ord:=upper(trim(a->>'orderNumber'));qty:=(a->>'quantity')::bigint;txid:='ALLOC-'||p_operation_id::text||'-'||idx;
  insert into public.pharmflow_receiving_transactions_v1(pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload,created_by)
  values(p_pharmacy_id,txid,nullif(ord,''),t.item_code,t.item_name,t.gtin,qty::integer,'ORDER_ALLOCATION',p_device_id,now(),
   t.payload||jsonb_build_object('transactionId',txid,'orderId',ord,'selectedOrderNumber',ord,'quantity',qty,'dateTime',now(),'deviceId',p_device_id,'source','ORDER_ALLOCATION','unassigned',ord='','allocationOperation',p_operation_id,'correctsTransactionId',t.transaction_id,'correctionReason',p_reason,'originalOccurredAt',t.occurred_at,'originalCreatedBy',t.created_by),auth.uid());
 end loop;
 result:=jsonb_build_object('operationId',p_operation_id,'moved',total,'netQuantityChange',0);
 insert into pharmflow_receiving_private.operations_v1 values(p_pharmacy_id,p_operation_id,'ALLOCATION',req,to_jsonb(t),result,auth.uid(),now());return result;
end $$;
revoke all on function public.revise_pharmflow_receiving_order_v1(uuid,uuid,text,jsonb,bigint,bigint) from public,anon;
revoke all on function public.allocate_pharmflow_receiving_v1(uuid,uuid,text,jsonb,bigint,bigint,text,text) from public,anon;
grant execute on function public.revise_pharmflow_receiving_order_v1(uuid,uuid,text,jsonb,bigint,bigint) to authenticated;
grant execute on function public.allocate_pharmflow_receiving_v1(uuid,uuid,text,jsonb,bigint,bigint,text,text) to authenticated;
