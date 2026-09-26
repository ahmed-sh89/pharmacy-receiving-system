-- PHASE2C1159 — authoritative Global Identifier write authorization.
-- Prepared for Test branch only. Do not apply to the shared Production database
-- until the release gate explicitly authorizes the database migration.
--
-- Global writes remain available to the System Owner. The only pharmacy-level
-- exception is an active ADMIN membership in the active reference pharmacy
-- whose authoritative pharmacy code is HHP084. No browser/client claim can
-- grant this permission.

begin;

create or replace function public.pharmflow_is_reference_master_admin_v1()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and (
       public.is_system_owner()
       or exists (
         select 1
           from public.pharmacy_members pm
           join public.pharmacies p on p.id = pm.pharmacy_id
          where pm.user_id = auth.uid()
            and pm.active is true
            and lower(coalesce(pm.role,'')) = 'admin'
            and p.active is true
            and p.status = 'active'
            and upper(btrim(coalesce(p.code,''))) = 'HHP084'
       )
     )
$$;

create or replace function public.add_pharmflow_global_identifier_v2(
  p_operation_id uuid, p_identifier_display text, p_item_code text, p_reason text
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_display text:=btrim(coalesce(p_identifier_display,''));
 v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
 v_item_code text:=btrim(coalesce(p_item_code,''));
 v_reason text:=btrim(coalesce(p_reason,''));
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
begin
 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required'; end if;
 if p_operation_id is null or v_key='' or v_item_code='' or v_reason='' then raise exception 'Operation, identifier, item and reason are required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where identifier_key=v_key for update;
 if v_mapping.id is not null and v_mapping.item_code<>v_item_code then raise exception 'Identifier is already mapped to another Item Code'; end if;
 if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_item_code) then raise exception 'Global Item Code does not exist'; end if;
 if v_mapping.id is null then
   insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by)
   values(v_item_code,v_display,v_key,auth.uid(),auth.uid()) returning * into v_mapping;
 end if;
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
 values(p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_mapping.item_code,v_reason,auth.uid())
 on conflict(operation_id) do nothing;
 return jsonb_build_object('success',true,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'itemCode',v_mapping.item_code);
end $$;

create or replace function public.correct_pharmflow_global_identifier_v2(
 p_operation_id uuid,p_identifier_id uuid,p_expected_mapping_revision bigint,p_new_item_code text,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
 v_old_item_code text; v_new_item_code text:=btrim(coalesce(p_new_item_code,''));
 v_reason text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required';end if;
 if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_new_item_code='' or v_reason='' then raise exception 'Operation, identifier, revision, item and reason are required';end if;
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id for update;
 if v_mapping.id is null then raise exception 'Identifier mapping is missing';end if;
 if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Identifier mapping changed; refresh before correcting';end if;
 if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_new_item_code) then raise exception 'Global Item Code does not exist';end if;
 v_old_item_code:=v_mapping.item_code;
 update public.pharmflow_global_item_identifiers_v2 set item_code=v_new_item_code,mapping_revision=mapping_revision+1,updated_at=now(),updated_by=auth.uid() where id=v_mapping.id returning * into v_mapping;
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
 values(p_operation_id,'CORRECT',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,v_old_item_code,v_mapping.item_code,v_reason,auth.uid());
 return jsonb_build_object('success',true,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'itemCode',v_mapping.item_code);
end $$;

create or replace function public.remove_pharmflow_global_identifier_v2(
 p_operation_id uuid,p_identifier_id uuid,p_expected_mapping_revision bigint,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
 v_reason text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required';end if;
 if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_reason='' then raise exception 'Operation, identifier, revision and reason are required';end if;
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id for update;
 if v_mapping.id is null then raise exception 'Identifier mapping is missing';end if;
 if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Identifier mapping changed; refresh before removing';end if;
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
 values(p_operation_id,'REMOVE',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,v_mapping.item_code,null,v_reason,auth.uid());
 delete from public.pharmflow_global_item_identifiers_v2 where id=v_mapping.id;
 return jsonb_build_object('success',true,'removedIdentifierId',v_mapping.id,'itemCode',v_mapping.item_code);
end $$;

create or replace function public.create_pharmflow_global_item_v2(
 p_operation_id uuid,p_item_code text,p_item_name text,p_group_name text default null,p_category text default null,
 p_sub_category text default null,p_identifier_display text default null,p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_item_code text:=btrim(coalesce(p_item_code,'')); v_item_name text:=btrim(coalesce(p_item_name,''));
 v_identifier_display text:=nullif(btrim(coalesce(p_identifier_display,'')),''); v_identifier_key text;
 v_reason text:=btrim(coalesce(p_reason,'')); v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
 v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;
begin
 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required';end if;
 if p_operation_id is null or v_item_code='' or v_item_name='' or v_identifier_display is null or v_reason='' then raise exception 'Operation ID, Item Code, Item Name, identifier and reason are required';end if;
 v_identifier_key:=public.pharmflow_identifier_key_v2(v_identifier_display);
 perform pg_advisory_xact_lock(hashtextextended(v_identifier_key,1153));
 select * into v_audit from public.pharmflow_identifier_mapping_audit_v1 where operation_id=p_operation_id;
 if v_audit.id is not null then
   if v_audit.action='ADD' and v_audit.new_item_code=v_item_code and v_audit.identifier_key=v_identifier_key and exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_item_code) then
     select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where identifier_key=v_identifier_key;
     if v_mapping.id is not null and v_mapping.item_code=v_item_code then
       return jsonb_build_object('success',true,'idempotent',true,'itemCode',v_item_code,'itemName',v_item_name,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision);
     end if;
   end if;
   raise exception 'Operation ID was already used for a different mapping operation';
 end if;
 if exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_item_code) then raise exception 'Global Item Code already exists';end if;
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where identifier_key=v_identifier_key for update;
 if v_mapping.id is not null then raise exception 'Identifier is already mapped to another Item Code';end if;
 insert into public.pharmflow_global_items_v2(item_code,item_name,group_name,category,sub_category,created_by,updated_by)
 values(v_item_code,v_item_name,nullif(btrim(coalesce(p_group_name,'')),''),nullif(btrim(coalesce(p_category,'')),''),nullif(btrim(coalesce(p_sub_category,'')),''),auth.uid(),auth.uid());
 insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by)
 values(v_item_code,v_identifier_display,v_identifier_key,auth.uid(),auth.uid()) returning * into v_mapping;
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
 values(p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_item_code,v_reason,auth.uid());
 return jsonb_build_object('success',true,'idempotent',false,'itemCode',v_item_code,'itemName',v_item_name,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision);
end $$;

revoke all on function public.pharmflow_is_reference_master_admin_v1() from public,anon;
grant execute on function public.pharmflow_is_reference_master_admin_v1() to authenticated;
revoke all on function public.add_pharmflow_global_identifier_v2(uuid,text,text,text) from public,anon;
revoke all on function public.correct_pharmflow_global_identifier_v2(uuid,uuid,bigint,text,text) from public,anon;
revoke all on function public.remove_pharmflow_global_identifier_v2(uuid,uuid,bigint,text) from public,anon;
revoke all on function public.create_pharmflow_global_item_v2(uuid,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.add_pharmflow_global_identifier_v2(uuid,text,text,text) to authenticated;
grant execute on function public.correct_pharmflow_global_identifier_v2(uuid,uuid,bigint,text,text) to authenticated;
grant execute on function public.remove_pharmflow_global_identifier_v2(uuid,uuid,bigint,text) to authenticated;
grant execute on function public.create_pharmflow_global_item_v2(uuid,text,text,text,text,text,text,text) to authenticated;

commit;
