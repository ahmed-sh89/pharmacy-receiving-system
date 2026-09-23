-- PharmFlow Phase 2C.11.5.7 — finalize durable Needs Review intents after an
-- accepted pharmacy-learned receipt. The receiving signature, validation,
-- mapping revision guard and transaction idempotency stay unchanged.

begin;

create or replace function public.append_pharmflow_learned_transaction_v3(
  p_pharmacy_id uuid, p_transaction_id text, p_order_number text, p_item_code text,
  p_item_name text, p_gtin text, p_quantity integer, p_source text, p_device_id text,
  p_occurred_at timestamptz, p_payload jsonb, p_mapping_id uuid, p_mapping_revision bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identifier_display text := btrim(coalesce(p_gtin,''));
  v_identifier_key text := public.pharmflow_identifier_key_v2(p_gtin);
  v_item_code text := trim(coalesce(p_item_code,''));
  v_transaction_id text := trim(coalesce(p_transaction_id,''));
  v_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_existing public.pharmflow_receiving_transactions_v1%rowtype;
  v_intent_id uuid;
begin
  if not public.pharmflow_gtin_lifecycle_member_v3(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
  if v_transaction_id='' or v_identifier_key='' or v_item_code='' or p_mapping_id is null or coalesce(p_mapping_revision,0)<=0 or coalesce(p_quantity,0)<=0 then raise exception 'Valid transaction, learned mapping, item, identifier and positive quantity are required'; end if;

  lock table public.pharmflow_pharmacy_gtin_v1 in share mode;
  select * into v_mapping
    from public.pharmflow_pharmacy_gtin_v1 g
   where g.pharmacy_id=p_pharmacy_id
     and g.id=p_mapping_id
     and g.mapping_revision=p_mapping_revision
     and g.identifier_key=v_identifier_key
     and upper(trim(g.item_code))=upper(v_item_code)
   for share;
  if v_mapping.id is null then raise exception 'Learned mapping changed; resolve the identifier again'; end if;

  if coalesce(p_payload #>> '{gtinResolution,kind}','')<>'PHARMACY_LEARNED'
     or coalesce(p_payload #>> '{gtinResolution,mappingId}','')<>p_mapping_id::text
     or coalesce(p_payload #>> '{gtinResolution,mappingRevision}','')<>p_mapping_revision::text
     or public.pharmflow_identifier_key_v2(coalesce(p_payload #>> '{gtinResolution,identifierKey}',p_payload #>> '{gtinResolution,normalizedGtin}',''))<>v_identifier_key
     or upper(trim(coalesce(p_payload #>> '{gtinResolution,resolvedItemCode}','')))<>upper(v_item_code) then
    raise exception 'Learned transaction provenance does not match the authoritative mapping';
  end if;

  insert into public.pharmflow_receiving_transactions_v1(
    pharmacy_id,transaction_id,order_number,item_code,item_name,gtin,quantity,
    source,device_id,occurred_at,payload,created_by
  )
  values(
    p_pharmacy_id,v_transaction_id,nullif(trim(coalesce(p_order_number,'')),''),
    v_item_code,coalesce(p_item_name,''),v_identifier_display,p_quantity,
    coalesce(p_source,'SCANNER'),coalesce(p_device_id,''),coalesce(p_occurred_at,now()),
    coalesce(p_payload,'{}'::jsonb),auth.uid()
  ) on conflict(pharmacy_id,transaction_id) do nothing;

  if not found then
    select * into v_existing
      from public.pharmflow_receiving_transactions_v1 t
     where t.pharmacy_id=p_pharmacy_id and t.transaction_id=v_transaction_id;
    if v_existing.transaction_id is null
       or coalesce(v_existing.order_number,'')<>coalesce(nullif(trim(p_order_number),''),'')
       or upper(trim(v_existing.item_code))<>upper(v_item_code)
       or public.pharmflow_identifier_key_v2(v_existing.gtin)<>v_identifier_key
       or v_existing.quantity<>p_quantity
       or coalesce(v_existing.payload #>> '{gtinResolution,mappingId}','')<>p_mapping_id::text
       or coalesce(v_existing.payload #>> '{gtinResolution,mappingRevision}','')<>p_mapping_revision::text then
      raise exception 'Transaction ID already exists with different learned-scan data';
    end if;
  end if;

  /* Keep finalizer failure isolated from the committed, idempotent receipt.
     A later idempotent queue delivery re-enters this same block safely. */
  for v_intent_id in
    select id
      from public.pharmflow_needs_review_resolution_intents_v1
     where pharmacy_id=p_pharmacy_id
       and transaction_id=v_transaction_id
       and status='PENDING'
  loop
    begin
      perform public.try_finalize_pharmflow_needs_review_resolution_intent_v1(v_intent_id);
    exception when others then
      begin
        update public.pharmflow_needs_review_resolution_intents_v1
           set helper_failure_code=SQLSTATE,
               helper_failure_detail=SQLERRM,
               helper_failure_at=now(),
               helper_failure_count=helper_failure_count+1,
               updated_at=now()
         where id=v_intent_id and status='PENDING';
      exception when others then
        raise warning 'Needs Review intent helper failed after learned receipt %, and failure state could not be recorded: %',v_transaction_id,SQLERRM;
      end;
      raise warning 'Needs Review intent helper failed after learned receipt %: %',v_transaction_id,SQLERRM;
    end;
  end loop;

  return true;
end;
$$;

commit;
