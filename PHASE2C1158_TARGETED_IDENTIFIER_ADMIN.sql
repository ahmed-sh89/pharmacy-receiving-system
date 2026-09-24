-- PHASE2C1158 — targeted identifier administration completion.
-- Additive/permission correction only. No operational Receiving or historical rows are rewritten.
begin;

create or replace function public.search_pharmflow_global_items_v2(
  p_query text,
  p_limit integer default 50
)
returns table(item_code text,item_name text,group_name text,category text,sub_category text)
language sql stable security definer
set search_path=public,pg_temp
as $function$
  select distinct i.item_code,i.item_name,i.group_name,i.category,i.sub_category
  from public.pharmflow_global_items_v2 i
  left join public.pharmflow_global_item_identifiers_v2 x on x.item_code=i.item_code
  where auth.uid() is not null
    and (
      btrim(coalesce(p_query,''))=''
      or i.item_code ilike '%'||btrim(p_query)||'%'
      or i.item_name ilike '%'||btrim(p_query)||'%'
      or x.identifier_key=public.pharmflow_identifier_key_v2(p_query)
      or x.identifier_display ilike '%'||btrim(p_query)||'%'
      or exists(
        select 1 from public.pharmflow_pharmacy_gtin_v1 pm
        where pm.item_code=i.item_code
          and public.is_pharmacy_member(pm.pharmacy_id)
          and (
            pm.identifier_key=public.pharmflow_identifier_key_v2(p_query)
            or pm.identifier_display ilike '%'||btrim(p_query)||'%'
          )
      )
    )
  order by i.item_code
  limit least(greatest(coalesce(p_limit,50),1),100)
$function$;

create or replace function public.get_pharmflow_identifier_admin_scope_v1(p_pharmacy_id uuid)
returns text
language plpgsql stable security definer
set search_path=public,pg_temp
as $function$
begin
  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy admin permission required';
  end if;
  if exists(select 1 from public.pharmacies p where p.id=p_pharmacy_id and p.code='HHP084' and p.status='active') then
    return 'GLOBAL';
  end if;
  return 'PHARMACY';
end
$function$;

create or replace function public.route_pharmflow_identifier_add_v1(
  p_operation_id uuid,
  p_pharmacy_id uuid,
  p_identifier_display text,
  p_item_code text,
  p_item_name text,
  p_reason text
)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $function$
declare v_scope text;
begin
  v_scope:=public.get_pharmflow_identifier_admin_scope_v1(p_pharmacy_id);
  if v_scope='GLOBAL' then
    return public.add_pharmflow_global_identifier_v2(
      p_operation_id,p_identifier_display,p_item_code,p_reason
    ) || jsonb_build_object('mappingScope','GLOBAL');
  end if;
  return public.add_pharmflow_pharmacy_identifier_v2(
    p_operation_id,p_pharmacy_id,p_identifier_display,p_item_code,p_item_name,p_reason
  ) || jsonb_build_object('mappingScope','PHARMACY');
end
$function$;

create or replace function public.list_pharmflow_item_identifiers_for_pharmacy_v1(
  p_pharmacy_id uuid,
  p_item_code text
)
returns table(
  identifier_id uuid,
  identifier_display text,
  identifier_key text,
  mapping_revision bigint,
  mapping_scope text
)
language sql stable security definer
set search_path=public,pg_temp
as $function$
  select g.id,g.identifier_display,g.identifier_key,g.mapping_revision,'GLOBAL'::text
  from public.pharmflow_global_item_identifiers_v2 g
  where public.is_pharmacy_member(p_pharmacy_id)
    and g.item_code=btrim(coalesce(p_item_code,''))
  union all
  select p.id,p.identifier_display,p.identifier_key,p.mapping_revision,'PHARMACY'::text
  from public.pharmflow_pharmacy_gtin_v1 p
  where public.is_pharmacy_member(p_pharmacy_id)
    and p.pharmacy_id=p_pharmacy_id
    and p.item_code=btrim(coalesce(p_item_code,''))
    and not exists(
      select 1 from public.pharmflow_global_item_identifiers_v2 g
      where g.identifier_key=p.identifier_key and g.item_code=p.item_code
    )
  order by identifier_display
$function$;

-- Reference-pharmacy Admins own Global Master maintenance for HHP084.
-- System Owner retains the same authority. All optimistic-revision and audit
-- semantics remain unchanged.
create or replace function public.correct_pharmflow_global_identifier_v2(
 p_operation_id uuid,p_identifier_id uuid,p_expected_mapping_revision bigint,p_new_item_code text,p_reason text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;v_old_item_code text;
v_new_item_code text:=btrim(coalesce(p_new_item_code,''));v_reason text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Reference pharmacy Admin or System Owner permission required';end if;
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
end $function$;

create or replace function public.remove_pharmflow_global_identifier_v2(
 p_operation_id uuid,p_identifier_id uuid,p_expected_mapping_revision bigint,p_reason text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;v_reason text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Reference pharmacy Admin or System Owner permission required';end if;
 if p_operation_id is null or p_identifier_id is null or coalesce(p_expected_mapping_revision,0)<=0 or v_reason='' then raise exception 'Operation, identifier, revision and reason are required';end if;
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where id=p_identifier_id for update;
 if v_mapping.id is null then raise exception 'Identifier mapping is missing';end if;
 if v_mapping.mapping_revision<>p_expected_mapping_revision then raise exception 'Identifier mapping changed; refresh before removing';end if;
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
 values(p_operation_id,'REMOVE',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,v_mapping.item_code,null,v_reason,auth.uid());
 delete from public.pharmflow_global_item_identifiers_v2 where id=v_mapping.id;
 return jsonb_build_object('success',true,'removedIdentifierId',v_mapping.id,'itemCode',v_mapping.item_code);
end $function$;

revoke all on function public.get_pharmflow_identifier_admin_scope_v1(uuid) from public;
revoke all on function public.route_pharmflow_identifier_add_v1(uuid,uuid,text,text,text,text) from public;
revoke all on function public.list_pharmflow_item_identifiers_for_pharmacy_v1(uuid,text) from public;
grant execute on function public.get_pharmflow_identifier_admin_scope_v1(uuid) to authenticated;
grant execute on function public.route_pharmflow_identifier_add_v1(uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.list_pharmflow_item_identifiers_for_pharmacy_v1(uuid,text) to authenticated;

commit;
