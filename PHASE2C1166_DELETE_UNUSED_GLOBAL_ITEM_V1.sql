-- Safe deletion for newly-created, unused Global V2 items.
create or replace function public.delete_unused_pharmflow_global_item_v1(
 p_operation_id uuid,p_item_code text,p_reason text
) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_code text:=btrim(coalesce(p_item_code,'')); v_reason text:=btrim(coalesce(p_reason,'')); v_ids int; v_pharmacy int;
begin
 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required'; end if;
 if p_operation_id is null or v_code='' or v_reason='' then raise exception 'Operation ID, Item Code and reason are required'; end if;
 if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_code) then raise exception 'Global Item does not exist'; end if;
 -- Never delete an item that has entered operational/history domains.
 if exists(select 1 from public.pharmflow_order_source_items where item_code=v_code)
 or exists(select 1 from public.pharmflow_receiving_transactions_v1 where item_code=v_code)
 or exists(select 1 from public.pharmflow_needs_review_resolution_intents_v1 where item_code=v_code)
 or exists(select 1 from public.pharmflow_expiry_captures_v1 where item_code=v_code)
 or exists(select 1 from public.transactions where item_code=v_code)
 or exists(select 1 from public.session_items where item_code=v_code)
 or exists(select 1 from public.pharmflow_cloud_transactions where item_code=v_code)
 then raise exception 'Global Item is in operational/history data and cannot be deleted'; end if;
 select count(*) into v_ids from public.pharmflow_global_item_identifiers_v2 where item_code=v_code;
 select count(*) into v_pharmacy from public.pharmflow_pharmacy_gtin_v1 where item_code=v_code;
 delete from public.pharmflow_pharmacy_gtin_v1 where item_code=v_code;
 delete from public.pharmflow_global_item_identifiers_v2 where item_code=v_code;
 delete from public.pharmflow_global_items_v2 where item_code=v_code;
 return jsonb_build_object('success',true,'itemCode',v_code,'deletedIdentifiers',v_ids,'deletedPharmacyMappings',v_pharmacy);
end $function$;
revoke all on function public.delete_unused_pharmflow_global_item_v1(uuid,text,text) from public;
grant execute on function public.delete_unused_pharmflow_global_item_v1(uuid,text,text) to authenticated;