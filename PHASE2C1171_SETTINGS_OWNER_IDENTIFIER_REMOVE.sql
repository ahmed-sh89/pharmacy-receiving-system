-- PHASE2C1171 — allow System Owner to coordinate Settings barcode removal.
-- HHP084 ADMIN behavior remains unchanged; System Owner gains the same coordinated path.

create or replace function public.remove_pharmflow_settings_identifier_v1(
    p_global_operation_id uuid,
    p_pharmacy_operation_id uuid,
    p_pharmacy_id uuid,
    p_identifier_display text,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := public.pharmflow_identifier_key_v2(p_identifier_display);
  v_global public.pharmflow_global_item_identifiers_v2%rowtype;
  v_local public.pharmflow_pharmacy_gtin_v1%rowtype;
  v_authorized boolean := false;
  v_global_result jsonb := null;
  v_local_result jsonb := null;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_key='' or btrim(coalesce(p_reason,''))='' then raise exception 'Identifier and reason are required'; end if;

  select public.is_system_owner() or exists(
    select 1
    from public.pharmacy_members pm
    join public.pharmacies p on p.id=pm.pharmacy_id
    where pm.pharmacy_id=p_pharmacy_id
      and pm.user_id=auth.uid()
      and pm.active is true
      and lower(coalesce(pm.role,''))='admin'
      and p.active is true
      and p.status='active'
      and upper(btrim(coalesce(p.code,'')))='HHP084'
  ) into v_authorized;

  if not v_authorized then
    raise exception 'System Owner or HHP084 ADMIN access is required for coordinated Global removal';
  end if;

  select * into v_local
  from public.pharmflow_pharmacy_gtin_v1
  where pharmacy_id=p_pharmacy_id and identifier_key=v_key
  for update;

  select * into v_global
  from public.pharmflow_global_item_identifiers_v2
  where identifier_key=v_key
  for update;

  if v_local.id is null and v_global.id is null then raise exception 'Identifier mapping not found'; end if;

  if v_local.id is not null then
    if p_pharmacy_operation_id is null then raise exception 'Pharmacy operation ID is required'; end if;
    v_local_result := public.remove_pharmflow_pharmacy_identifier_v2(
      p_pharmacy_operation_id,p_pharmacy_id,v_local.id,v_local.mapping_revision,p_reason
    );
  end if;

  if v_global.id is not null then
    if p_global_operation_id is null then raise exception 'Global operation ID is required'; end if;
    v_global_result := public.remove_pharmflow_global_identifier_v2(
      p_global_operation_id,v_global.id,v_global.mapping_revision,p_reason
    );
  end if;

  return jsonb_build_object(
    'success',true,'scope','GLOBAL_AND_PHARMACY','identifierDisplay',btrim(p_identifier_display),
    'globalRemoved',v_global.id is not null,'pharmacyRemoved',v_local.id is not null,
    'globalResult',v_global_result,'pharmacyResult',v_local_result
  );
end
$$;

revoke all on function public.remove_pharmflow_settings_identifier_v1(uuid,uuid,uuid,text,text) from public, anon;
grant execute on function public.remove_pharmflow_settings_identifier_v1(uuid,uuid,uuid,text,text) to authenticated;
