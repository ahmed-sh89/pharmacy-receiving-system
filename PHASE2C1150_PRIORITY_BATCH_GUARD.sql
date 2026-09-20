-- PharmFlow Project B — batched item-priority patch guard.
-- Updates only priorityType/highPriority inside the current server Manifest.
-- Duplicate item codes across Orders count once for request verification.

create or replace function public.patch_pharmflow_item_priorities_v2(
    p_pharmacy_id uuid,
    p_changes jsonb,
    p_expected_generation bigint,
    p_expected_revision bigint
)
returns table(
    revision bigint,
    updated_at timestamptz,
    changed_items integer,
    order_files integer,
    order_items integer,
    workspace_generation bigint
)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
    v_generation bigint;
    v_revision bigint;
    v_manifest jsonb;
    v_change_map jsonb;
    v_order_data jsonb;
    v_changed integer;
begin
    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes)=0 then
        raise exception 'Priority changes must be a non-empty JSON array';
    end if;

    if exists (
        select 1 from jsonb_array_elements(p_changes) c
         where trim(coalesce(c->>'itemCode',''))=''
            or upper(trim(coalesce(c->>'priorityType',''))) not in ('','SHORT','NEW')
    ) then
        raise exception 'Invalid item priority change';
    end if;

    select coalesce(jsonb_object_agg(
        trim(c->>'itemCode'),
        to_jsonb(upper(trim(coalesce(c->>'priorityType',''))))
    ),'{}'::jsonb)
      into v_change_map
      from jsonb_array_elements(p_changes) c;

    select g.generation into v_generation
      from public.pharmflow_workspace_generation_v1 g
     where g.pharmacy_id=p_pharmacy_id for update;

    if coalesce(p_expected_generation,-1) <> coalesce(v_generation,0) then
        raise exception 'STALE_WORKSPACE_GENERATION';
    end if;

    select m.manifest,m.revision into v_manifest,v_revision
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id for update;

    if v_manifest is null then raise exception 'Active Order Manifest not found'; end if;
    if coalesce(p_expected_revision,-1) <> coalesce(v_revision,0) then
        raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';
    end if;

    select jsonb_agg(
        case when v_change_map ? coalesce(item->>'itemCode',item->>'itemNumber','')
        then jsonb_set(jsonb_set(
            item,'{priorityType}',
            v_change_map->coalesce(item->>'itemCode',item->>'itemNumber',''),true
        ),'{highPriority}',to_jsonb(
            coalesce(v_change_map->>coalesce(item->>'itemCode',item->>'itemNumber',''),'') <> ''
        ),true)
        else item end order by ordinal_position
    ),count(distinct coalesce(item->>'itemCode',item->>'itemNumber','')) filter (
        where v_change_map ? coalesce(item->>'itemCode',item->>'itemNumber','')
    )::integer
      into v_order_data,v_changed
      from jsonb_array_elements(coalesce(v_manifest->'orderData','[]'::jsonb))
           with ordinality as entries(item,ordinal_position);

    if coalesce(v_changed,0) <> (select count(*) from jsonb_object_keys(v_change_map)) then
        raise exception 'One or more priority items are not in the Active Order Manifest';
    end if;

    update public.pharmflow_active_order_manifest_v1 m
       set manifest=jsonb_set(m.manifest,'{orderData}',v_order_data,false),
           revision=m.revision+1,updated_at=now(),updated_by=auth.uid()
     where m.pharmacy_id=p_pharmacy_id;

    return query select m.revision,m.updated_at,v_changed,
        jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
        jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),
        m.workspace_generation
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id;
end;
$function$;

revoke all on function public.patch_pharmflow_item_priorities_v2(
    uuid,jsonb,bigint,bigint
) from public,anon;

grant execute on function public.patch_pharmflow_item_priorities_v2(
    uuid,jsonb,bigint,bigint
) to authenticated;
