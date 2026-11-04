-- PHASE 2C.11.5.8 — Needs Review resolves against the authoritative Active Order Manifest.
-- The original order remains immutable; current PC scope is visibility only.
create or replace function public.request_pharmflow_needs_review_resolution_v4(
 p_operation_id uuid,p_pharmacy_id uuid,p_review_id uuid,p_item_code text,p_item_name text,p_resolution_transaction_id text
) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
 v_review public.pharmflow_needs_review_v2%rowtype;
 v_existing public.pharmflow_needs_review_resolution_intents_v1%rowtype;
 v_item_code text:=btrim(coalesce(p_item_code,''));
 v_transaction_id text:=btrim(coalesce(p_resolution_transaction_id,''));
 v_item_name text:=btrim(coalesce(p_item_name,''));
 v_manifest jsonb;
 v_order_active boolean:=false;
 v_item_in_order boolean:=false;
begin
 if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 if p_operation_id is null or p_review_id is null or v_item_code='' or v_transaction_id='' then raise exception 'Operation, review, Item Code and Receiving transaction are required'; end if;
 select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where operation_id=p_operation_id;
 if v_existing.id is not null then
   if v_existing.pharmacy_id=p_pharmacy_id and v_existing.review_id=p_review_id and v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name then return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id); end if;
   raise exception 'Operation ID was already used for different resolution input';
 end if;
 select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id for update;
 if v_review.id is null then raise exception 'Needs Review case is unavailable'; end if;
 if v_review.status<>'PENDING' then return jsonb_build_object('success',v_review.status='RESOLVED','status',v_review.status,'reviewId',v_review.id); end if;
 if nullif(btrim(coalesce(v_review.order_number,'')),'') is null then return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE'); end if;
 select m.manifest into v_manifest from public.pharmflow_active_order_manifest_v1 m where m.pharmacy_id=p_pharmacy_id;
 if v_manifest is not null and coalesce((v_manifest->>'active')::boolean,false) then
   select exists(select 1 from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb)) x where coalesce(x->'orderNumbers','[]'::jsonb) ? v_review.order_number) into v_order_active;
   select exists(select 1 from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb)) x where coalesce(x->'orderNumbers','[]'::jsonb) ? v_review.order_number and btrim(coalesce(x->>'itemCode',''))=v_item_code) into v_item_in_order;
 end if;
 if not v_order_active then
   select exists(select 1 from public.pharmflow_orders o where o.pharmacy_id=p_pharmacy_id and o.order_number=v_review.order_number and o.status in ('uploaded','receiving'))
      or exists(select 1 from public.pharmflow_order_source_items s where s.pharmacy_id=p_pharmacy_id and s.order_number=v_review.order_number) into v_order_active;
 end if;
 if not v_item_in_order then select exists(select 1 from public.pharmflow_order_source_items s where s.pharmacy_id=p_pharmacy_id and s.order_number=v_review.order_number and s.item_code=v_item_code) into v_item_in_order; end if;
 if not v_order_active then return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE'); end if;
 if not v_item_in_order then return jsonb_build_object('success',false,'status','BLOCKED','code','ITEM_NOT_IN_ORIGINAL_ORDER'); end if;
 select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where pharmacy_id=p_pharmacy_id and review_id=p_review_id for update;
 if v_existing.id is not null then
   if v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name then return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id); end if;
   raise exception 'A different resolution intent already exists for this Needs Review case';
 end if;
 insert into public.pharmflow_needs_review_resolution_intents_v1(operation_id,pharmacy_id,review_id,transaction_id,item_code,item_name,requested_by)
 values(p_operation_id,p_pharmacy_id,p_review_id,v_transaction_id,v_item_code,v_item_name,auth.uid()) returning * into v_existing;
 return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id);
end $$;