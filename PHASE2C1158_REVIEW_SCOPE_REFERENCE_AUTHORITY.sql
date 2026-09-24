-- PharmFlow Phase 2C.11.5.8 — active-manifest review authority and
-- server-selected reference-pharmacy identifier ownership.
-- Additive/versioned: does not mutate existing operational rows.

begin;

create or replace function public.pharmflow_manifest_has_active_order_v1(
  p_pharmacy_id uuid, p_order_number text
) returns boolean
language sql stable security definer set search_path=public,pg_temp
as $$
  select exists (
    select 1
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id
       -- `active` is the workspace lifecycle flag serialized by the same
       -- Active Order Manifest writer that owns orderFiles/orderData. A stale
       -- structural row must never make a finalized workspace resolvable.
       and lower(coalesce(m.manifest->>'active','false'))='true'
       and exists (
         select 1 from jsonb_array_elements(coalesce(m.manifest->'orderFiles','[]'::jsonb)) f
          where upper(regexp_replace(btrim(coalesce(f->>'documentId',f->>'orderNumber','')),'\s','','g'))
              = upper(regexp_replace(btrim(coalesce(p_order_number,'')),'\s','','g'))
       )
  );
$$;
revoke all on function public.pharmflow_manifest_has_active_order_v1(uuid,text) from public,anon,authenticated;

create or replace function public.pharmflow_manifest_has_order_item_v1(
  p_pharmacy_id uuid, p_order_number text, p_item_code text
) returns boolean
language sql stable security definer set search_path=public,pg_temp
as $$
  select public.pharmflow_manifest_has_active_order_v1(p_pharmacy_id,p_order_number)
     and exists (
       select 1
         from public.pharmflow_active_order_manifest_v1 m,
              jsonb_array_elements(coalesce(m.manifest->'orderData','[]'::jsonb)) i
        where m.pharmacy_id=p_pharmacy_id
          and lower(coalesce(m.manifest->>'active','false'))='true'
          and upper(btrim(coalesce(i->>'itemCode','')))=upper(btrim(coalesce(p_item_code,'')))
          and (
            upper(regexp_replace(btrim(coalesce(i->>'orderNumber','')),'\s','','g'))
              = upper(regexp_replace(btrim(coalesce(p_order_number,'')),'\s','','g'))
            or exists (
              select 1 from jsonb_array_elements_text(coalesce(i->'orderNumbers','[]'::jsonb)) n
               where upper(regexp_replace(btrim(n),'\s','','g'))
                  = upper(regexp_replace(btrim(coalesce(p_order_number,'')),'\s','','g'))
            )
          )
     );
$$;
revoke all on function public.pharmflow_manifest_has_order_item_v1(uuid,text,text) from public,anon,authenticated;

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

  if exists(select 1 from public.pharmflow_active_order_manifest_v1 where pharmacy_id=v_intent.pharmacy_id) then
    if not public.pharmflow_manifest_has_active_order_v1(v_intent.pharmacy_id,v_review.order_number) then
      update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='ORIGINAL_ORDER_UNAVAILABLE',blocked_detail='Original order is finalized, inactive, or unavailable.',updated_at=now() where id=v_intent.id;
      update public.pharmflow_needs_review_v2 set resolution_block_code='ORIGINAL_ORDER_UNAVAILABLE',resolution_block_detail='The original order is finalized, inactive, or unavailable.',updated_at=now() where id=v_review.id;
      return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE');
    end if;
  else
    select status into v_order_status from public.pharmflow_orders where pharmacy_id=v_intent.pharmacy_id and order_number=v_review.order_number;
    if v_order_status is distinct from 'uploaded' then
      update public.pharmflow_needs_review_resolution_intents_v1 set status='BLOCKED',blocked_code='ORIGINAL_ORDER_UNAVAILABLE',blocked_detail='Original order is finalized, inactive, or unavailable.',updated_at=now() where id=v_intent.id;
      update public.pharmflow_needs_review_v2 set resolution_block_code='ORIGINAL_ORDER_UNAVAILABLE',resolution_block_detail='The original order is finalized, inactive, or unavailable.',updated_at=now() where id=v_review.id;
      return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE');
    end if;
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

revoke all on function public.try_finalize_pharmflow_needs_review_resolution_intent_v1(uuid) from public,anon,authenticated;

create or replace function public.request_pharmflow_needs_review_resolution_v4(
  p_operation_id uuid,p_pharmacy_id uuid,p_review_id uuid,p_item_code text,p_item_name text,p_resolution_transaction_id text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_review public.pharmflow_needs_review_v2%rowtype;
  v_existing public.pharmflow_needs_review_resolution_intents_v1%rowtype;
  v_item_code text:=btrim(coalesce(p_item_code,'')); v_transaction_id text:=btrim(coalesce(p_resolution_transaction_id,'')); v_item_name text:=btrim(coalesce(p_item_name,''));
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
  if exists(select 1 from public.pharmflow_active_order_manifest_v1 where pharmacy_id=p_pharmacy_id) then
    if not public.pharmflow_manifest_has_active_order_v1(p_pharmacy_id,v_review.order_number) then return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE'); end if;
    if not public.pharmflow_manifest_has_order_item_v1(p_pharmacy_id,v_review.order_number,v_item_code) then return jsonb_build_object('success',false,'status','BLOCKED','code','ITEM_NOT_IN_ORIGINAL_ORDER'); end if;
  else
    -- Compatibility fallback is used only when this pharmacy has no manifest
    -- authority row. Once a manifest exists, legacy rows cannot resurrect an
    -- Order removed or finalized by the authoritative lifecycle.
    if not exists(select 1 from public.pharmflow_orders where pharmacy_id=p_pharmacy_id and order_number=v_review.order_number and status='uploaded') then return jsonb_build_object('success',false,'status','BLOCKED','code','ORIGINAL_ORDER_UNAVAILABLE'); end if;
    if not exists(select 1 from public.pharmflow_order_source_items where pharmacy_id=p_pharmacy_id and order_number=v_review.order_number and item_code=v_item_code) then return jsonb_build_object('success',false,'status','BLOCKED','code','ITEM_NOT_IN_ORIGINAL_ORDER'); end if;
  end if;
  select * into v_existing from public.pharmflow_needs_review_resolution_intents_v1 where pharmacy_id=p_pharmacy_id and review_id=p_review_id for update;
  if v_existing.id is not null then
    if v_existing.transaction_id=v_transaction_id and v_existing.item_code=v_item_code and v_existing.item_name=v_item_name then return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id); end if;
    raise exception 'A different resolution intent already exists for this Needs Review case';
  end if;
  insert into public.pharmflow_needs_review_resolution_intents_v1(operation_id,pharmacy_id,review_id,transaction_id,item_code,item_name,requested_by)
  values(p_operation_id,p_pharmacy_id,p_review_id,v_transaction_id,v_item_code,v_item_name,auth.uid()) returning * into v_existing;
  return public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_existing.id);
end $$;
revoke all on function public.request_pharmflow_needs_review_resolution_v4(uuid,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.request_pharmflow_needs_review_resolution_v4(uuid,uuid,uuid,text,text,text) to authenticated;

create or replace function public.pharmflow_reference_identifier_admin_v1(p_pharmacy_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id)
   and exists(select 1 from public.pharmacies p where p.id=p_pharmacy_id and upper(coalesce(to_jsonb(p)->>'code',to_jsonb(p)->>'pharmacy_code',''))='HHP084');
$$;
revoke all on function public.pharmflow_reference_identifier_admin_v1(uuid) from public,anon;
grant execute on function public.pharmflow_reference_identifier_admin_v1(uuid) to authenticated;

alter table public.pharmflow_identifier_mapping_audit_v1
  add column if not exists result jsonb;

create or replace function public.add_pharmflow_managed_identifier_v1(
 p_operation_id uuid,p_pharmacy_id uuid,p_identifier_display text,p_item_code text,p_item_name text,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_display text:=btrim(coalesce(p_identifier_display,'')); v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
 v_code text:=btrim(coalesce(p_item_code,'')); v_name text:=btrim(coalesce(p_item_name,'')); v_reason text:=btrim(coalesce(p_reason,''));
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype; v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype; v_result jsonb;
begin
 if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 if not public.pharmflow_reference_identifier_admin_v1(p_pharmacy_id) then return public.add_pharmflow_pharmacy_identifier_v2(p_operation_id,p_pharmacy_id,v_display,v_code,v_name,v_reason); end if;
 if p_operation_id is null or v_key='' or v_code='' or v_name='' or v_reason='' then raise exception 'Operation, identifier, Item Code, Item Name and reason are required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,1158));
 select * into v_audit from public.pharmflow_identifier_mapping_audit_v1 where operation_id=p_operation_id;
 if v_audit.id is not null then
   if v_audit.action<>'ADD' or v_audit.identifier_display<>v_display or v_audit.identifier_key<>v_key or coalesce(v_audit.new_item_code,'')<>v_code or v_audit.reason<>v_reason or coalesce(v_audit.result->>'requestedItemName','')<>v_name then raise exception 'Operation ID was already used with different Global mapping input'; end if;
   return v_audit.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_key,1158));
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where identifier_key=v_key for update;
 if v_mapping.id is not null and v_mapping.item_code<>v_code then raise exception 'Identifier is already mapped to another Item Code'; end if;
 if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_code) then raise exception 'Global Item Code does not exist'; end if;
 if v_mapping.id is null then insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by) values(v_code,v_display,v_key,auth.uid(),auth.uid()) returning * into v_mapping; end if;
 v_result:=jsonb_build_object('success',true,'scope','GLOBAL','action','ADD','identifierId',v_mapping.id,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'mappingRevision',v_mapping.mapping_revision,'itemCode',v_mapping.item_code,'requestedItemName',v_name);
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by,result) values(p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_mapping.item_code,v_reason,auth.uid(),v_result);
 return v_result;
end $$;

revoke all on function public.add_pharmflow_managed_identifier_v1(uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.add_pharmflow_managed_identifier_v1(uuid,uuid,text,text,text,text) to authenticated;

create or replace function public.correct_pharmflow_managed_identifier_v1(
 p_operation_id uuid,p_pharmacy_id uuid,p_identifier_id uuid,p_expected_mapping_revision bigint,p_new_item_code text,p_new_item_name text,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype; v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype; v_old text;
 v_code text:=btrim(coalesce(p_new_item_code,'')); v_name text:=btrim(coalesce(p_new_item_name,'')); v_reason text:=btrim(coalesce(p_reason,'')); v_result jsonb;
begin
 if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 if not public.pharmflow_reference_identifier_admin_v1(p_pharmacy_id) then return public.correct_pharmflow_pharmacy_identifier_v2(p_operation_id,p_pharmacy_id,p_identifier_id,p_expected_mapping_revision,v_code,v_name,v_reason); end if;
 if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_code='' or v_name='' or v_reason='' then raise exception 'Operation, identifier, revision, Item Code, Item Name and reason are required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,1158));
 select * into v_audit from public.pharmflow_identifier_mapping_audit_v1 where operation_id=p_operation_id;
 if v_audit.id is not null then
   if v_audit.action<>'CORRECT' or coalesce(v_audit.result->>'requestedIdentifierId','')<>p_identifier_id::text or coalesce(v_audit.result->>'expectedMappingRevision','')<>p_expected_mapping_revision::text or coalesce(v_audit.new_item_code,'')<>v_code or coalesce(v_audit.result->>'requestedItemName','')<>v_name or v_audit.reason<>v_reason then raise exception 'Operation ID was already used with different Global mapping input'; end if;
   return v_audit.result;
 end if;
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id for update;
 if v_mapping.id is null then raise exception 'Global identifier mapping is missing'; end if;
 if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Identifier mapping changed; refresh before correcting'; end if;
 if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_code) then raise exception 'Global Item Code does not exist'; end if;
 v_old:=v_mapping.item_code;
 update public.pharmflow_global_item_identifiers_v2 set item_code=v_code,mapping_revision=mapping_revision+1,updated_at=now(),updated_by=auth.uid() where id=v_mapping.id returning * into v_mapping;
 v_result:=jsonb_build_object('success',true,'scope','GLOBAL','action','CORRECT','identifierId',v_mapping.id,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'mappingRevision',v_mapping.mapping_revision,'itemCode',v_mapping.item_code,'requestedIdentifierId',p_identifier_id,'expectedMappingRevision',p_expected_mapping_revision,'requestedItemName',v_name);
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by,result) values(p_operation_id,'CORRECT',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,v_old,v_mapping.item_code,v_reason,auth.uid(),v_result);
 return v_result;
end $$;

create or replace function public.remove_pharmflow_managed_identifier_v1(
 p_operation_id uuid,p_pharmacy_id uuid,p_identifier_id uuid,p_expected_mapping_revision bigint,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype; v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;
 v_reason text:=btrim(coalesce(p_reason,'')); v_result jsonb;
begin
 if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then raise exception 'Pharmacy admin permission required'; end if;
 if not public.pharmflow_reference_identifier_admin_v1(p_pharmacy_id) then return public.remove_pharmflow_pharmacy_identifier_v2(p_operation_id,p_pharmacy_id,p_identifier_id,p_expected_mapping_revision,v_reason); end if;
 if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_reason='' then raise exception 'Operation, identifier, revision and reason are required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,1158));
 select * into v_audit from public.pharmflow_identifier_mapping_audit_v1 where operation_id=p_operation_id;
 if v_audit.id is not null then
   if v_audit.action<>'REMOVE' or coalesce(v_audit.result->>'requestedIdentifierId','')<>p_identifier_id::text or coalesce(v_audit.result->>'expectedMappingRevision','')<>p_expected_mapping_revision::text or v_audit.reason<>v_reason then raise exception 'Operation ID was already used with different Global mapping input'; end if;
   return v_audit.result;
 end if;
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id for update;
 if v_mapping.id is null then raise exception 'Global identifier mapping is missing'; end if;
 if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Identifier mapping changed; refresh before removing'; end if;
 v_result:=jsonb_build_object('success',true,'scope','GLOBAL','action','REMOVE','removedIdentifierId',v_mapping.id,'identifierDisplay',v_mapping.identifier_display,'identifierKey',v_mapping.identifier_key,'itemCode',v_mapping.item_code,'requestedIdentifierId',p_identifier_id,'expectedMappingRevision',p_expected_mapping_revision);
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by,result) values(p_operation_id,'REMOVE',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,v_mapping.item_code,null,v_reason,auth.uid(),v_result);
 delete from public.pharmflow_global_item_identifiers_v2 where id=v_mapping.id;
 return v_result;
end $$;

revoke all on function public.correct_pharmflow_managed_identifier_v1(uuid,uuid,uuid,bigint,text,text,text) from public,anon;
revoke all on function public.remove_pharmflow_managed_identifier_v1(uuid,uuid,uuid,bigint,text) from public,anon;
grant execute on function public.correct_pharmflow_managed_identifier_v1(uuid,uuid,uuid,bigint,text,text,text) to authenticated;
grant execute on function public.remove_pharmflow_managed_identifier_v1(uuid,uuid,uuid,bigint,text) to authenticated;

-- Keep the older Global V2 entry points deliberately narrower than the
-- pharmacy-aware managed API. They remain a separately approved System Owner
-- capability; Pharmacy Admins (including HHP084) must use the managed RPCs,
-- which require an explicit pharmacy and enforce the reference boundary.
-- Reasserting these ACLs prevents direct table access and anonymous execution;
-- each function also retains its server-side is_system_owner() check.
revoke all on function public.add_pharmflow_global_identifier_v2(uuid,text,text,text) from public,anon;
revoke all on function public.correct_pharmflow_global_identifier_v2(uuid,uuid,bigint,text,text) from public,anon;
revoke all on function public.remove_pharmflow_global_identifier_v2(uuid,uuid,bigint,text) from public,anon;
grant execute on function public.add_pharmflow_global_identifier_v2(uuid,text,text,text) to authenticated;
grant execute on function public.correct_pharmflow_global_identifier_v2(uuid,uuid,bigint,text,text) to authenticated;
grant execute on function public.remove_pharmflow_global_identifier_v2(uuid,uuid,bigint,text) to authenticated;

commit;
