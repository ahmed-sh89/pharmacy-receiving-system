-- PHASE2C1153 — additive V2 Global Item creation and identifier listing.
-- No legacy writes, no Receiving/history changes, and no schema changes.

begin;

create or replace function public.create_pharmflow_global_item_v2(
  p_operation_id uuid,
  p_item_code text,
  p_item_name text,
  p_group_name text default null,
  p_category text default null,
  p_sub_category text default null,
  p_identifier_display text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item_code text := btrim(coalesce(p_item_code, ''));
  v_item_name text := btrim(coalesce(p_item_name, ''));
  v_identifier_display text := nullif(btrim(coalesce(p_identifier_display, '')), '');
  v_identifier_key text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;
begin
  if auth.uid() is null or not public.is_system_owner() then
    raise exception 'System Owner permission required';
  end if;
  if p_operation_id is null or v_item_code = '' or v_item_name = ''
     or v_identifier_display is null or v_reason = '' then
    raise exception 'Operation ID, Item Code, Item Name, identifier and reason are required';
  end if;

  v_identifier_key := public.pharmflow_identifier_key_v2(v_identifier_display);
  perform pg_advisory_xact_lock(hashtextextended(v_identifier_key, 1153));

  select * into v_audit
    from public.pharmflow_identifier_mapping_audit_v1
   where operation_id = p_operation_id;
  if v_audit.id is not null then
    if v_audit.action = 'ADD'
       and v_audit.new_item_code = v_item_code
       and v_audit.identifier_key = v_identifier_key
       and exists (select 1 from public.pharmflow_global_items_v2 where item_code = v_item_code) then
      select * into v_mapping from public.pharmflow_global_item_identifiers_v2
       where identifier_key = v_identifier_key;
      if v_mapping.id is not null and v_mapping.item_code = v_item_code then
        return jsonb_build_object('success',true,'idempotent',true,'itemCode',v_item_code,
          'itemName',v_item_name,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision);
      end if;
    end if;
    raise exception 'Operation ID was already used for a different mapping operation';
  end if;

  if exists (select 1 from public.pharmflow_global_items_v2 where item_code = v_item_code) then
    raise exception 'Global Item Code already exists';
  end if;
  select * into v_mapping from public.pharmflow_global_item_identifiers_v2
   where identifier_key = v_identifier_key for update;
  if v_mapping.id is not null then
    raise exception 'Identifier is already mapped to another Item Code';
  end if;

  insert into public.pharmflow_global_items_v2(item_code,item_name,group_name,category,sub_category,created_by,updated_by)
  values(v_item_code,v_item_name,nullif(btrim(coalesce(p_group_name,'')),''),nullif(btrim(coalesce(p_category,'')),''),nullif(btrim(coalesce(p_sub_category,'')),''),auth.uid(),auth.uid());

  insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by)
  values(v_item_code,v_identifier_display,v_identifier_key,auth.uid(),auth.uid()) returning * into v_mapping;
  insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
  values(p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_item_code,v_reason,auth.uid());
  return jsonb_build_object('success',true,'idempotent',false,'itemCode',v_item_code,
    'itemName',v_item_name,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision);
end $$;

create or replace function public.list_pharmflow_global_item_identifiers_v2(p_item_code text)
returns table(identifier_id uuid,identifier_display text,identifier_key text,mapping_revision bigint,created_at timestamptz,updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return query
    select i.id,i.identifier_display,i.identifier_key,i.mapping_revision,i.created_at,i.updated_at
      from public.pharmflow_global_item_identifiers_v2 i
     where i.item_code = btrim(coalesce(p_item_code,''))
     order by i.created_at asc,i.identifier_key asc;
end $$;

revoke all on function public.create_pharmflow_global_item_v2(uuid,text,text,text,text,text,text,text) from public;
revoke all on function public.list_pharmflow_global_item_identifiers_v2(text) from public;
grant execute on function public.create_pharmflow_global_item_v2(uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.list_pharmflow_global_item_identifiers_v2(text) to authenticated;

commit;
