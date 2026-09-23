-- PHASE2C1154 — additive durable Needs Review resolution intents.
-- Receiving remains written exclusively by append_pharmflow_receiving_action_v4.

begin;

create table if not exists public.pharmflow_needs_review_resolution_intents_v1 (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  pharmacy_id uuid not null,
  review_id uuid not null references public.pharmflow_needs_review_v2(id),
  transaction_id text not null,
  item_code text not null,
  item_name text not null default '',
  resolution_type text not null default 'LINK_ORDER_ITEM',
  status text not null default 'PENDING' check (status in ('PENDING','RESOLVED','BLOCKED')),
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  blocked_code text,
  blocked_detail text,
  last_checked_at timestamptz,
  helper_failure_code text,
  helper_failure_detail text,
  helper_failure_at timestamptz,
  helper_failure_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint pharmflow_nr_resolution_intents_one_per_review unique (pharmacy_id,review_id),
  constraint pharmflow_nr_resolution_intents_required_values check (
    btrim(transaction_id) <> '' and btrim(item_code) <> '' and resolution_type='LINK_ORDER_ITEM'
  )
);

create index if not exists pharmflow_nr_resolution_intents_pending_transaction_idx
  on public.pharmflow_needs_review_resolution_intents_v1(pharmacy_id,transaction_id)
  where status='PENDING';

alter table public.pharmflow_needs_review_resolution_intents_v1 enable row level security;
revoke all on public.pharmflow_needs_review_resolution_intents_v1 from public,anon,authenticated;

create or replace function public.try_finalize_pharmflow_needs_review_resolution_intent_v1(
  p_intent_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent public.pharmflow_needs_review_resolution_intents_v1%rowtype;
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_transaction public.pharmflow_receiving_transactions_v1%rowtype;
  v_order_status text;
begin
  select * into v_intent from public.pharmflow_needs_review_resolution_intents_v1 where id=p_intent_id for update;
  if v_intent.id is null then raise exception 'Resolution intent is unavailable'; end if;
  if v_intent.status='RESOLVED' then
    return jsonb_build_object('success',true,'status','RESOLVED','reviewId',v_intent.review_id,'transactionId',v_intent.transaction_id,'idempotent',true);
  end if;
  if v_intent.status='BLOCKED' then
    return jsonb_build_object('success',false,'status','BLOCKED','code',v_intent.blocked_code,'detail',v_intent.blocked_detail);
  end if;

  select * into v_review from public.pharmflow_needs_review_v2 where id=v_intent.review_id and pharmacy_id=v_intent.pharmacy_id for update;
  if v_review.id is null or v_review.status<>'PENDING' then
    update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='REVIEW_NOT_PENDING',blocked_detail='Needs Review case is unavailable or no longer pending.',updated_at=now() where id=v_intent.id;
    return jsonb_build_object('success',false,'status','BLOCKED','code','REVIEW_NOT_PENDING');
  end if;

  select status into v_order_status from public.pharmflow_orders where pharmacy_id=v_intent.pharmacy_id and order_number=v_review.order_number;
  if v_order_status is distinct from 'uploaded' then
    update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='ORIGINAL_ORDER_UNAVAILABLE',blocked_detail='Original order is finalized, inactive, or unavailable.',updated_at=now() where id=v_intent.id;
    update public.pharmflow_needs_review_v2 set resolution_block_code='ORIGINAL_ORDER_UNAVAILABLE',resolution_block_detail='The original order is finalized, inactive, or unavailable.',updated_at=now() where id=v_review.id;
    return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE');
  end if;

  select * into v_transaction from public.pharmflow_receiving_transactions_v1 where pharmacy_id=v_intent.pharmacy_id and transaction_id=v_intent.transaction_id for update;
  if v_transaction.transaction_id is null then
    update public.pharmflow_needs_review_resolution_intents_v1 set last_checked_at=now(),updated_at=now() where id=v_intent.id;
    return jsonb_build_object('success',false,'status','PENDING','code','RECEIVING_TRANSACTION_PENDING','reviewId',v_review.id,'transactionId',v_intent.transaction_id);
  end if;

  if coalesce(v_transaction.order_number,'')<>coalesce(v_review.order_number,'')
     or v_transaction.item_code<>v_intent.item_code
     or v_transaction.quantity<=0
     or public.pharmflow_identifier_key_v2(v_transaction.gtin)<>v_review.identifier_key then
    update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='RECEIVING_TRANSACTION_MISMATCH',blocked_detail='Receiving transaction does not match the review pharmacy, original order, item, or identifier.',updated_at=now() where id=v_intent.id;
    update public.pharmflow_needs_review_v2 set resolution_block_code='RECEIVING_TRANSACTION_MISMATCH',resolution_block_detail='The requested transaction cannot resolve this case.',updated_at=now() where id=v_review.id;
    return jsonb_build_object('success',false,'status','BLOCKED','code','RECEIVING_TRANSACTION_MISMATCH');
  end if;

  update public.pharmflow_needs_review_v2 set status='RESOLVED',resolved_item_code=v_intent.item_code,resolved_item_name=v_intent.item_name,resolution_type=v_intent.resolution_type,resolution_transaction_id=v_intent.transaction_id,resolved_by=v_intent.requested_by,resolved_at=now(),resolution_block_code=null,resolution_block_detail=null,updated_at=now() where id=v_review.id and status='PENDING';
  update public.pharmflow_needs_review_resolution_intents_v1 set status='RESOLVED',resolved_at=now(),last_checked_at=now(),updated_at=now() where id=v_intent.id;
  return jsonb_build_object('success',true,'status','RESOLVED','reviewId',v_review.id,'transactionId',v_intent.transaction_id);
end $$;

create or replace function public.request_pharmflow_needs_review_resolution_v4(
  p_operation_id uuid,p_pharmacy_id uuid,p_review_id uuid,p_item_code text,p_item_name text,p_resolution_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_existing public.pharmflow_needs_review_resolution_intents_v1%rowtype;
  v_item_code text:=btrim(coalesce(p_item_code,''));
  v_transaction_id text:=btrim(coalesce(p_resolution_transaction_id,''));
begin
  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
  if p_operation_id is null or p_review_id is null or v_item_code='' or v_transaction_id='' then raise exception 'Operation, review, Item Code and Receiving transaction are required'; end if;
  select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where operation_id=p_operation_id;
  if v_existing.id is not null then
    if v_existing.pharmacy_id=p_pharmacy_id and v_existing.review_id=p_review_id and v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=btrim(coalesce(p_item_name,'')) then
      return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id);
    end if;
    raise exception 'Operation ID was already used for different resolution input';
  end if;
  select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id for update;
  if v_review.id is null then raise exception 'Needs Review case is unavailable'; end if;
  if v_review.status<>'PENDING' then return jsonb_build_object('success',v_review.status='RESOLVED','status',v_review.status,'reviewId',v_review.id); end if;
  if nullif(btrim(coalesce(v_review.order_number,'')),'') is null then return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE'); end if;
  if not exists(select 1 from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and order_number=v_review.order_number and status='uploaded') then return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE'); end if;
  if not exists(select 1 from public.pharmflow_order_source_items where pharmacy_id=p_pharmacy_id and order_number=v_review.order_number and item_code=v_item_code) then return jsonb_build_object('success',false,'status','BLOCKED','code','ITEM_NOT_IN_ORIGINAL_ORDER'); end if;
  select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where pharmacy_id=p_pharmacy_id and review_id=p_review_id for update;
  if v_existing.id is not null then raise exception 'A resolution intent already exists for this Needs Review case'; end if;
  insert into public.pharmflow_needs_review_resolution_intents_v1(operation_id,pharmacy_id,review_id,transaction_id,item_code,item_name,requested_by)
  values(p_operation_id,p_pharmacy_id,p_review_id,v_transaction_id,v_item_code,btrim(coalesce(p_item_name,'')),auth.uid()) returning * into v_existing;
  return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id);
end $$;

-- Exact existing public signature and Receiving behavior are retained. The
-- guarded post-success hook cannot roll back or duplicate a valid receipt.
create or replace function public.append_pharmflow_receiving_action_v4(
 p_pharmacy_id uuid,p_transaction_id text,p_order_number text,p_item_code text,p_item_name text,
 p_gtin text,p_quantity integer,p_source text,p_device_id text,p_occurred_at timestamptz,p_payload jsonb
) returns table(acknowledged boolean,inserted boolean,authoritative_received bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_existing public.pharmflow_receiving_transactions_v1%rowtype;
  v_inserted boolean:=false;
  v_intent_id uuid;
begin
 if auth.uid() is null or not public.pharmflow_receiving_member_v2(p_pharmacy_id) then raise exception 'Pharmacy access required';end if;
 if nullif(trim(coalesce(p_transaction_id,'')),'') is null then raise exception 'Transaction ID required';end if;
 if nullif(trim(coalesce(p_item_code,'')),'') is null then raise exception 'Item Code required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text||'|'||coalesce(trim(p_order_number),'')||'|'||trim(p_item_code),0));
 select * into v_existing from public.pharmflow_receiving_transactions_v1 where pharmacy_id=p_pharmacy_id and transaction_id=trim(p_transaction_id);
 if found then
  if coalesce(v_existing.order_number,'')<>coalesce(nullif(trim(coalesce(p_order_number,'')),''),'') or v_existing.item_code<>trim(p_item_code) or v_existing.quantity<>coalesce(p_quantity,0) or coalesce(v_existing.gtin,'')<>coalesce(p_gtin,'') then raise exception 'Transaction ID content mismatch';end if;
 else
  insert into public.pharmflow_receiving_transactions_v1(pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,source,device_id,occurred_at,payload,created_by)
  values(p_pharmacy_id,trim(p_transaction_id),nullif(trim(coalesce(p_order_number,'')),''),trim(p_item_code),coalesce(p_item_name,''),coalesce(p_gtin,''),coalesce(p_quantity,0),coalesce(p_source,'RECEIVING'),coalesce(p_device_id,''),coalesce(p_occurred_at,now()),coalesce(p_payload,'{}'::jsonb),auth.uid());
  v_inserted:=true;
 end if;
 for v_intent_id in select id from public.pharmflow_needs_review_resolution_intents_v1 where pharmacy_id=p_pharmacy_id and transaction_id=trim(p_transaction_id) and status='PENDING' loop
   begin
     perform public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_intent_id);
   exception when others then
     begin
       update public.pharmflow_needs_review_resolution_intents_v1 set helper_failure_code=SQLSTATE,helper_failure_detail=SQLERRM,helper_failure_at=now(),helper_failure_count=helper_failure_count+1,updated_at=now() where id=v_intent_id and status='PENDING';
     exception when others then
       raise warning 'Needs Review intent helper failed after Receiving receipt %, and failure state could not be recorded: %',trim(p_transaction_id),SQLERRM;
     end;
     raise warning 'Needs Review intent helper failed after Receiving receipt %: %',trim(p_transaction_id),SQLERRM;
   end;
 end loop;
 return query select true,v_inserted,coalesce(sum(t.quantity),0)::bigint from public.pharmflow_receiving_transactions_v1 t where t.pharmacy_id=p_pharmacy_id and t.item_code=trim(p_item_code) and coalesce(t.order_number,'')=coalesce(nullif(trim(coalesce(p_order_number,'')),''),'');
end $$;

revoke all on function public.try_finalize_pharmflow_needs_review_resolution_intent_v1(uuid) from public,anon,authenticated;
revoke all on function public.request_pharmflow_needs_review_resolution_v4(uuid,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.request_pharmflow_needs_review_resolution_v4(uuid,uuid,uuid,text,text,text) to authenticated;

commit;
