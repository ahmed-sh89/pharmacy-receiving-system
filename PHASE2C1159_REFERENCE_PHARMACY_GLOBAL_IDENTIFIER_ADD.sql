-- PHASE 2C.11.5.9 — HHP084 is the approved reference pharmacy for Global V2 identifier enrichment.
create or replace function public.pharmflow_is_reference_master_admin_v1()
returns boolean language sql stable security definer set search_path='public','pg_temp' as $$
 select auth.uid() is not null and (
   public.is_system_owner()
   or public.is_pharmacy_admin('13cfb12b-d380-4462-8609-948be70c55ee'::uuid)
 )
$$;

create or replace function public.add_pharmflow_global_identifier_v2(p_operation_id uuid,p_identifier_display text,p_item_code text,p_reason text)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_display text:=btrim(coalesce(p_identifier_display,''));v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);v_item_code text:=btrim(coalesce(p_item_code,''));v_reason text:=btrim(coalesce(p_reason,''));v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
begin
 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Reference pharmacy Admin or System Owner permission required'; end if;
 if p_operation_id is null or v_key='' or v_item_code='' or v_reason='' then raise exception 'Operation, identifier, item and reason are required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where identifier_key=v_key for update;
 if v_mapping.id is not null and v_mapping.item_code<>v_item_code then raise exception 'Identifier is already mapped to another Item Code'; end if;
 if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_item_code) then raise exception 'Global Item Code does not exist'; end if;
 if v_mapping.id is null then insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by) values(v_item_code,v_display,v_key,auth.uid(),auth.uid()) returning * into v_mapping; end if;
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by) values(p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_mapping.item_code,v_reason,auth.uid()) on conflict(operation_id) do nothing;
 return jsonb_build_object('success',true,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'itemCode',v_mapping.item_code);
end $$;