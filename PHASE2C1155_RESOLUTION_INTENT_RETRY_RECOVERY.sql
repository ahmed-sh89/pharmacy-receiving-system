-- PHASE2C1155 — durable retry recovery for an already-created review intent.
-- A fresh browser retry may use a new operation UUID, but cannot change the
-- immutable review/transaction/item resolution tuple.

begin;

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
  v_item_name text:=btrim(coalesce(p_item_name,''));
begin
  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
  if p_operation_id is null or p_review_id is null or v_item_code='' or v_transaction_id='' then raise exception 'Operation, review, Item Code and Receiving transaction are required'; end if;
  select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where operation_id=p_operation_id;
  if v_existing.id is not null then
    if v_existing.pharmacy_id=p_pharmacy_id and v_existing.review_id=p_review_id and v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name then
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
  if v_existing.id is not null then
    if v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name then
      return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id);
    end if;
    raise exception 'A different resolution intent already exists for this Needs Review case';
  end if;
  insert into public.pharmflow_needs_review_resolution_intents_v1(operation_id,pharmacy_id,review_id,transaction_id,item_code,item_name,requested_by)
  values(p_operation_id,p_pharmacy_id,p_review_id,v_transaction_id,v_item_code,v_item_name,auth.uid()) returning * into v_existing;
  return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id);
end $$;

commit;
