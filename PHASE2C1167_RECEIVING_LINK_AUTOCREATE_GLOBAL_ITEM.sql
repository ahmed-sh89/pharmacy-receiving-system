-- PHASE2C1167 — Receiving Link & Receive auto-creates a missing Global item for HHP084 only.
-- Non-reference pharmacies remain pharmacy-only. Existing Global items keep the existing learning path.
create or replace function public.learn_pharmflow_identifier_v1(
  p_global_operation_id uuid,
  p_pharmacy_operation_id uuid,
  p_pharmacy_id uuid,
  p_identifier_display text,
  p_item_code text,
  p_item_name text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_is_reference boolean:=false;
  v_global jsonb:=null;
  v_pharmacy jsonb;
  v_item_exists boolean:=false;
  v_created jsonb:=null;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then raise exception 'Pharmacy ADMIN access is required'; end if;

  select exists(
    select 1 from public.pharmacies p
    where p.id=p_pharmacy_id and p.code='HHP084' and p.active is true and p.status='active'
  ) into v_is_reference;

  if v_is_reference then
    if p_global_operation_id is null then raise exception 'Global operation ID required'; end if;

    select exists(
      select 1 from public.pharmflow_global_items_v2 gi
      where gi.item_code=btrim(coalesce(p_item_code,''))
    ) into v_item_exists;

    if v_item_exists then
      v_global:=public.add_pharmflow_global_identifier_v2(
        p_global_operation_id,p_identifier_display,p_item_code,p_reason
      );
    else
      v_created:=public.create_pharmflow_global_item_and_learn_v1(
        p_global_operation_id,
        p_pharmacy_operation_id,
        p_pharmacy_id,
        p_item_code,
        p_item_name,
        null,
        null,
        null,
        p_identifier_display,
        p_reason
      );
      return jsonb_build_object(
        'success',true,
        'scope','GLOBAL_AND_PHARMACY',
        'globalMapping',v_created->'globalItem',
        'pharmacyMapping',v_created->'pharmacyMapping',
        'globalItemCreated',true
      );
    end if;
  end if;

  if p_pharmacy_operation_id is null then raise exception 'Pharmacy operation ID required'; end if;
  v_pharmacy:=public.add_pharmflow_pharmacy_identifier_v2(
    p_pharmacy_operation_id,p_pharmacy_id,p_identifier_display,p_item_code,p_item_name,p_reason
  );

  return jsonb_build_object(
    'success',true,
    'scope',case when v_is_reference then 'GLOBAL_AND_PHARMACY' else 'PHARMACY' end,
    'globalMapping',v_global,
    'pharmacyMapping',v_pharmacy,
    'globalItemCreated',false
  );
end
$function$;
