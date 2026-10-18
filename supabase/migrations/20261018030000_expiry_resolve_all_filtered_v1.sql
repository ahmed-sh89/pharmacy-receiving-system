-- Additive, pharmacy-scoped all-filtered Expiry resolution.
-- The complete scope is reselected on the server and must exactly match the
-- reviewed IDs, versions, count and units before the existing transactional
-- mutation RPC is called. No existing RPC or inventory table is replaced.

create table pharmflow_expiry_private.filtered_inventory_requests_v1 (
  request_id uuid primary key references pharmflow_expiry_private.inventory_requests_v1(request_id),
  pharmacy_id uuid not null,
  created_by uuid not null,
  filters jsonb not null,
  expected_count integer not null check (expected_count > 0),
  expected_units bigint not null check (expected_units >= 0),
  created_at timestamptz not null default clock_timestamp()
);

alter table pharmflow_expiry_private.filtered_inventory_requests_v1 enable row level security;
revoke all on pharmflow_expiry_private.filtered_inventory_requests_v1 from public, anon, authenticated;

create function public.resolve_all_filtered_pharmflow_expiry_inventory_v1(
  p_pharmacy_id uuid,
  p_request_id uuid,
  p_filters jsonb,
  p_selection jsonb,
  p_expected_count integer,
  p_expected_units bigint
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  expected_payload jsonb := jsonb_build_object('action','RESOLVE','selection',p_selection,'quantity',null);
  prior pharmflow_expiry_private.inventory_requests_v1%rowtype;
  prior_scope pharmflow_expiry_private.filtered_inventory_requests_v1%rowtype;
  current_scope jsonb;
  remaining_scope jsonb;
  result jsonb;
begin
  perform pharmflow_expiry_private.valid_auth_session();
  if public.is_pharmacy_member(p_pharmacy_id) is not true then
    raise exception 'Pharmacy access required';
  end if;
  if p_request_id is null or p_filters is null or jsonb_typeof(p_filters)<>'object'
     or p_selection is null or jsonb_typeof(p_selection)<>'array'
     or p_expected_count is null or p_expected_count<1
     or p_expected_units is null or p_expected_units<0
     or jsonb_array_length(p_selection)<>p_expected_count then
    raise exception 'Invalid filtered resolve confirmation';
  end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_selection) x)<>p_expected_count
     or exists(select 1 from jsonb_array_elements(p_selection) x
               where jsonb_typeof(x)<>'object' or nullif(x->>'id','') is null or nullif(x->>'version','') is null) then
    raise exception 'Invalid filtered resolve selection';
  end if;

  -- Serialize retries with the existing mutation RPC's durable request lock.
  perform pg_advisory_xact_lock(hashtextextended('expiry-inventory-request/'||p_request_id::text,0));
  select * into prior from pharmflow_expiry_private.inventory_requests_v1 where request_id=p_request_id;
  if found then
    if prior.pharmacy_id<>p_pharmacy_id or prior.created_by<>auth.uid()
       or prior.payload is distinct from expected_payload then
      raise exception 'Request payload conflict';
    end if;
    select * into prior_scope from pharmflow_expiry_private.filtered_inventory_requests_v1 where request_id=p_request_id;
    if not found or prior_scope.pharmacy_id<>p_pharmacy_id or prior_scope.created_by<>auth.uid()
       or prior_scope.filters is distinct from p_filters
       or prior_scope.expected_count<>p_expected_count
       or prior_scope.expected_units<>p_expected_units then
      raise exception 'Request scope conflict';
    end if;
    return prior.result;
  end if;

  current_scope := public.select_pharmflow_expiry_inventory_v1(
    p_pharmacy_id,p_filters,false,null
  );
  if (current_scope->>'count')::integer is distinct from p_expected_count
     or (current_scope->>'units')::bigint is distinct from p_expected_units
     or current_scope->'selection' is distinct from p_selection then
    raise exception 'Filtered inventory changed; refresh and confirm again';
  end if;

  -- Reuse the established mutation contract for item locks, version checks,
  -- resolved snapshots, per-row events and durable idempotency.
  result := public.mutate_pharmflow_expiry_inventory_v1(
    p_pharmacy_id,p_request_id,'RESOLVE',p_selection,null
  );

  -- The existing mutation locks and versions only the submitted rows. A new
  -- matching inventory row can appear after the preflight selection without
  -- sharing any of those item locks. Recheck inside the same transaction;
  -- if any matching active row remains, raising rolls back the whole mutation
  -- (including its events and idempotency record) so the user must reconfirm.
  remaining_scope := public.select_pharmflow_expiry_inventory_v1(
    p_pharmacy_id,p_filters,false,null
  );
  if (remaining_scope->>'count')::integer is distinct from 0
     or (remaining_scope->>'units')::bigint is distinct from 0
     or remaining_scope->'selection' is distinct from '[]'::jsonb then
    raise exception 'Filtered inventory changed during resolution; refresh and confirm again';
  end if;

  insert into pharmflow_expiry_private.filtered_inventory_requests_v1(
    request_id,pharmacy_id,created_by,filters,expected_count,expected_units
  ) values (
    p_request_id,p_pharmacy_id,auth.uid(),p_filters,p_expected_count,p_expected_units
  );
  return result;
end;
$$;

revoke all on function public.resolve_all_filtered_pharmflow_expiry_inventory_v1(uuid,uuid,jsonb,jsonb,integer,bigint) from public,anon;
grant execute on function public.resolve_all_filtered_pharmflow_expiry_inventory_v1(uuid,uuid,jsonb,jsonb,integer,bigint) to authenticated;
