-- PharmFlow additive identifier creation V3.
-- Atomically creates a new Global Item + first Global identifier and, for the
-- HHP084 reference pharmacy, records the same exact identifier as pharmacy
-- provenance. Existing V2 RPCs remain unchanged for backward compatibility.

create or replace function public.create_pharmflow_global_item_and_learn_v1(
  p_global_operation_id uuid,
  p_pharmacy_operation_id uuid,
  p_pharmacy_id uuid,
  p_item_code text,
  p_item_name text,
  p_group_name text default null,
  p_category text default null,
  p_sub_category text default null,
  p_identifier_display text default null,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_reference boolean := false;
  v_global jsonb;
  v_pharmacy jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_pharmacy_id is null then raise exception 'Current pharmacy is required'; end if;
  if not public.pharmflow_is_pharmacy_identifier_admin_v2(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access is required';
  end if;

  select exists(
    select 1 from public.pharmacies p
    where p.id=p_pharmacy_id
      and p.code='HHP084'
      and p.active is true
      and p.status='active'
  ) into v_reference;

  if not v_reference then
    raise exception 'Global Item creation is restricted to the reference pharmacy';
  end if;
  if p_global_operation_id is null or p_pharmacy_operation_id is null then
    raise exception 'Global and pharmacy operation IDs are required';
  end if;

  -- Both calls execute inside this transaction. Any failure rolls back both.
  v_global := public.create_pharmflow_global_item_v2(
    p_global_operation_id,p_item_code,p_item_name,p_group_name,p_category,
    p_sub_category,p_identifier_display,p_reason
  );

  v_pharmacy := public.add_pharmflow_pharmacy_identifier_v2(
    p_pharmacy_operation_id,p_pharmacy_id,p_identifier_display,p_item_code,
    p_item_name,p_reason
  );

  return jsonb_build_object(
    'success',true,
    'scope','GLOBAL_AND_PHARMACY',
    'globalItem',v_global,
    'pharmacyMapping',v_pharmacy
  );
end
$function$;

revoke all on function public.create_pharmflow_global_item_and_learn_v1(uuid,uuid,uuid,text,text,text,text,text,text,text) from public;
grant execute on function public.create_pharmflow_global_item_and_learn_v1(uuid,uuid,uuid,text,text,text,text,text,text,text) to authenticated;
