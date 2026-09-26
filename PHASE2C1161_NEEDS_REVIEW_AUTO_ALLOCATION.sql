-- PHASE2C1161 — Needs Review automatic order allocation
-- Additive/backward-compatible: v4 remains available for existing queued intents.

alter table public.pharmflow_needs_review_resolution_intents_v1
  add column if not exists allocations jsonb;

create or replace function public.try_finalize_pharmflow_needs_review_resolution_intent_v2(p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_intent public.pharmflow_needs_review_resolution_intents_v1%rowtype;
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_alloc jsonb; v_tx public.pharmflow_receiving_transactions_v1%rowtype;
  v_expected_total integer:=0; v_found_total integer:=0;
begin
  select * into v_intent from public.pharmflow_needs_review_resolution_intents_v1 where id=p_intent_id for update;
  if v_intent.id is null then raise exception 'Resolution intent is unavailable'; end if;
  if v_intent.status='RESOLVED' then return jsonb_build_object('success',true,'status','RESOLVED','reviewId',v_intent.review_id,'transactionId',v_intent.transaction_id,'idempotent',true); end if;
  if v_intent.status='BLOCKED' then return jsonb_build_object('success',false,'status','BLOCKED','code',v_intent.blocked_code,'detail',v_intent.blocked_detail); end if;
  select * into v_review from public.pharmflow_needs_review_v2 where id=v_intent.review_id and pharmacy_id=v_intent.pharmacy_id for update;
  if v_review.id is null or v_review.status<>'PENDING' then
    update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='REVIEW_NOT_PENDING',blocked_detail='Needs Review case is unavailable or no longer pending.',updated_at=now() where id=v_intent.id;
    return jsonb_build_object('success',false,'status','BLOCKED','code','REVIEW_NOT_PENDING');
  end if;
  if jsonb_typeof(v_intent.allocations)<>'array' or jsonb_array_length(v_intent.allocations)=0 then return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(p_intent_id); end if;
  for v_alloc in select value from jsonb_array_elements(v_intent.allocations) loop
    if btrim(coalesce(v_alloc->>'transactionId',''))='' or btrim(coalesce(v_alloc->>'orderNumber',''))='' or coalesce((v_alloc->>'quantity')::integer,0)<=0 then raise exception 'Invalid Needs Review allocation'; end if;
    v_expected_total:=v_expected_total+(v_alloc->>'quantity')::integer;
    select * into v_tx from public.pharmflow_receiving_transactions_v1 where pharmacy_id=v_intent.pharmacy_id and transaction_id=v_alloc->>'transactionId' for update;
    if v_tx.transaction_id is null then
      update public.pharmflow_needs_review_resolution_intents_v1 set last_checked_at=now(),updated_at=now() where id=v_intent.id;
      return jsonb_build_object('success',false,'status','PENDING','code','RECEIVING_TRANSACTION_PENDING','reviewId',v_review.id,'transactionId',v_intent.transaction_id);
    end if;
    if coalesce(v_tx.order_number,'')<>coalesce(v_alloc->>'orderNumber','') or v_tx.item_code<>v_intent.item_code or v_tx.quantity<>(v_alloc->>'quantity')::integer or public.pharmflow_identifier_key_v2(v_tx.gtin)<>v_review.identifier_key then
      update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='RECEIVING_TRANSACTION_MISMATCH',blocked_detail='An allocated Receiving transaction does not match the review item, identifier, order, or quantity.',updated_at=now() where id=v_intent.id;
      update public.pharmflow_needs_review_v2 set resolution_block_code='RECEIVING_TRANSACTION_MISMATCH',resolution_block_detail='The allocated Receiving transactions cannot resolve this case.',updated_at=now() where id=v_review.id;
      return jsonb_build_object('success',false,'status','BLOCKED','code','RECEIVING_TRANSACTION_MISMATCH');
    end if;
    v_found_total:=v_found_total+v_tx.quantity;
  end loop;
  if v_expected_total<>v_review.pending_quantity or v_found_total<>v_review.pending_quantity then
    update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='ALLOCATION_QUANTITY_MISMATCH',blocked_detail='Allocated quantity does not equal the pending review quantity.',updated_at=now() where id=v_intent.id;
    return jsonb_build_object('success',false,'status','BLOCKED','code','ALLOCATION_QUANTITY_MISMATCH');
  end if;
  update public.pharmflow_needs_review_v2 set status='RESOLVED',resolved_item_code=v_intent.item_code,resolved_item_name=v_intent.item_name,resolution_type='AUTO_ALLOCATED',resolution_transaction_id=v_intent.transaction_id,resolved_by=v_intent.requested_by,resolved_at=now(),resolution_block_code=null,resolution_block_detail=null,updated_at=now() where id=v_review.id and status='PENDING';
  update public.pharmflow_needs_review_resolution_intents_v1 set status='RESOLVED',resolution_type='AUTO_ALLOCATED',resolved_at=now(),last_checked_at=now(),updated_at=now() where id=v_intent.id;
  return jsonb_build_object('success',true,'status','RESOLVED','reviewId',v_review.id,'transactionId',v_intent.transaction_id,'allocations',v_intent.allocations);
end $function$;

create or replace function public.request_pharmflow_needs_review_resolution_v5(p_operation_id uuid,p_pharmacy_id uuid,p_review_id uuid,p_item_code text,p_item_name text,p_resolution_transaction_id text,p_allocations jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
 v_review public.pharmflow_needs_review_v2%rowtype; v_existing public.pharmflow_needs_review_resolution_intents_v1%rowtype;
 v_item_code text:=btrim(coalesce(p_item_code,'')); v_transaction_id text:=btrim(coalesce(p_resolution_transaction_id,'')); v_item_name text:=btrim(coalesce(p_item_name,''));
 v_alloc jsonb; v_manifest jsonb; v_order text; v_qty integer; v_total integer:=0; v_item_in_order boolean;
begin
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 if p_operation_id is null or p_review_id is null or v_item_code='' or v_transaction_id='' then raise exception 'Operation, review, Item Code and Receiving transaction are required'; end if;
 if jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations)=0 then raise exception 'At least one Receiving allocation is required'; end if;
 select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where operation_id=p_operation_id;
 if v_existing.id is not null then
   if v_existing.pharmacy_id=p_pharmacy_id and v_existing.review_id=p_review_id and v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name and v_existing.allocations=p_allocations then return public.try_finalize_pharmflow_needs_review_resolution_intent_v2(v_existing.id); end if;
   raise exception 'Operation ID was already used for different resolution input';
 end if;
 select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id for update;
 if v_review.id is null then raise exception 'Needs Review case is unavailable'; end if;
 if v_review.status<>'PENDING' then return jsonb_build_object('success',v_review.status='RESOLVED','status',v_review.status,'reviewId',v_review.id); end if;
 select m.manifest into v_manifest from public.pharmflow_active_order_manifest_v1 m where m.pharmacy_id=p_pharmacy_id;
 if v_manifest is null or not coalesce((v_manifest->>'active')::boolean,false) then return jsonb_build_object('success',false,'status','BLOCKED','code','ACTIVE_ORDER_MANIFEST_UNAVAILABLE'); end if;
 for v_alloc in select value from jsonb_array_elements(p_allocations) loop
   v_order:=btrim(coalesce(v_alloc->>'orderNumber','')); v_qty:=coalesce((v_alloc->>'quantity')::integer,0);
   if btrim(coalesce(v_alloc->>'transactionId',''))='' or v_order='' or v_qty<=0 then raise exception 'Invalid Needs Review allocation'; end if;
   if not (coalesce(v_review.work_scope_order_numbers,'{}'::text[]) @> array[v_order]) then return jsonb_build_object('success',false,'status','BLOCKED','code','ORDER_OUTSIDE_CAPTURED_WORK_SCOPE'); end if;
   select exists(select 1 from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb)) x where coalesce(x->'orderNumbers','[]'::jsonb) ? v_order and btrim(coalesce(x->>'itemCode',''))=v_item_code) into v_item_in_order;
   if not v_item_in_order then return jsonb_build_object('success',false,'status','BLOCKED','code','ITEM_NOT_IN_ACTIVE_ORDER'); end if;
   v_total:=v_total+v_qty;
 end loop;
 if v_total<>v_review.pending_quantity then return jsonb_build_object('success',false,'status','BLOCKED','code','ALLOCATION_QUANTITY_MISMATCH'); end if;
 select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where pharmacy_id=p_pharmacy_id and review_id=p_review_id for update;
 if v_existing.id is not null then
   if v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name and v_existing.allocations=p_allocations then return public.try_finalize_pharmflow_needs_review_resolution_intent_v2(v_existing.id); end if;
   raise exception 'A different resolution intent already exists for this Needs Review case';
 end if;
 insert into public.pharmflow_needs_review_resolution_intents_v1(operation_id,pharmacy_id,review_id,transaction_id,item_code,item_name,resolution_type,requested_by,allocations)
 values(p_operation_id,p_pharmacy_id,p_review_id,v_transaction_id,v_item_code,v_item_name,'AUTO_ALLOCATED',auth.uid(),p_allocations) returning * into v_existing;
 return public.try_finalize_pharmflow_needs_review_resolution_intent_v2(v_existing.id);
end $function$;

revoke all on function public.request_pharmflow_needs_review_resolution_v5(uuid,uuid,uuid,text,text,text,jsonb) from public, anon;
grant execute on function public.request_pharmflow_needs_review_resolution_v5(uuid,uuid,uuid,text,text,text,jsonb) to authenticated;
revoke all on function public.try_finalize_pharmflow_needs_review_resolution_intent_v2(uuid) from public, anon;
grant execute on function public.try_finalize_pharmflow_needs_review_resolution_intent_v2(uuid) to authenticated;
