-- Staging-only additive metadata correction. Existing auth, ACL and mapping precedence retained.
CREATE OR REPLACE FUNCTION public.resolve_pharmflow_identifier_v2(p_pharmacy_id uuid, p_identifier_display text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_key text := public.pharmflow_identifier_key_v2(p_identifier_display);
  v_pharmacy_mapping public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_global_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
  v_item public.pharmflow_global_items_v2%rowtype;
begin
  if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then
    raise exception 'Pharmacy access required';
  end if;
  if v_key = '' then
    raise exception 'Identifier is required';
  end if;

  select * into v_pharmacy_mapping
    from public.pharmflow_pharmacy_gtin_v1
   where pharmacy_id = p_pharmacy_id
     and identifier_key = v_key;
  if v_pharmacy_mapping.id is not null then
    select * into v_item from public.pharmflow_global_items_v2
     where item_code = v_pharmacy_mapping.item_code;
    return jsonb_build_object(
      'found', true, 'source', 'PHARMACY_V2', 'mappingScope', 'PHARMACY',
      'identifierId', v_pharmacy_mapping.id,
      'mappingRevision', v_pharmacy_mapping.mapping_revision,
      'identifierDisplay', v_pharmacy_mapping.identifier_display,
      'identifierKey', v_pharmacy_mapping.identifier_key,
      'itemCode', v_pharmacy_mapping.item_code,
      'itemName', v_pharmacy_mapping.item_name,
      'groupName', v_item.group_name
    );
  end if;

  select * into v_global_mapping
    from public.pharmflow_global_item_identifiers_v2
   where identifier_key = v_key;
  if v_global_mapping.id is null then
    return jsonb_build_object('found', false, 'identifierDisplay', btrim(p_identifier_display), 'identifierKey', v_key);
  end if;
  select * into v_item from public.pharmflow_global_items_v2 where item_code = v_global_mapping.item_code;
  return jsonb_build_object(
    'found', true, 'source', 'GLOBAL_V2', 'mappingScope', 'GLOBAL',
    'identifierId', v_global_mapping.id, 'mappingRevision', v_global_mapping.mapping_revision,
    'identifierDisplay', v_global_mapping.identifier_display, 'identifierKey', v_global_mapping.identifier_key,
    'itemCode', v_item.item_code, 'itemName', v_item.item_name,
    'groupName', v_item.group_name, 'category', v_item.category, 'subCategory', v_item.sub_category
  );
end;
$function$;
