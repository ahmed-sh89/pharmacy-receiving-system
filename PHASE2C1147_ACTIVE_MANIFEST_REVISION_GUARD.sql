-- PharmFlow Project B — Active Order Manifest optimistic concurrency guard.
-- Safe rollout: v3 remains available while the client moves to v4.

create or replace function public.save_pharmflow_active_order_manifest_v4(
    p_pharmacy_id uuid,
    p_manifest jsonb,
    p_expected_generation bigint,
    p_expected_revision bigint
)
returns table(
    revision bigint,
    updated_at timestamptz,
    order_files integer,
    order_items integer,
    workspace_generation bigint
)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
    v_files integer;
    v_items integer;
    v_generation bigint;
    v_revision bigint;
begin
    if not public.pharmflow_manifest_member_v2(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    insert into public.pharmflow_workspace_generation_v1(pharmacy_id,generation)
    values(p_pharmacy_id,0)
    on conflict(pharmacy_id) do nothing;

    select g.generation
      into v_generation
      from public.pharmflow_workspace_generation_v1 g
     where g.pharmacy_id=p_pharmacy_id
     for update;

    if coalesce(p_expected_generation,-1) <> coalesce(v_generation,0) then
        raise exception 'STALE_WORKSPACE_GENERATION';
    end if;

    select m.revision
      into v_revision
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id
     for update;

    v_revision:=coalesce(v_revision,0);

    if coalesce(p_expected_revision,-1) <> v_revision then
        raise exception 'STALE_ACTIVE_ORDER_MANIFEST_REVISION';
    end if;

    v_files:=jsonb_array_length(coalesce(p_manifest->'orderFiles','[]'::jsonb));
    v_items:=jsonb_array_length(coalesce(p_manifest->'orderData','[]'::jsonb));

    if v_files<=0 or v_items<=0 then
        raise exception 'Active Order Manifest requires orderFiles and orderData';
    end if;

    insert into public.pharmflow_active_order_manifest_v1(
        pharmacy_id,manifest,revision,updated_at,updated_by,workspace_generation
    )
    values(
        p_pharmacy_id,p_manifest,1,now(),auth.uid(),v_generation
    )
    on conflict(pharmacy_id) do update set
        manifest=excluded.manifest,
        revision=public.pharmflow_active_order_manifest_v1.revision+1,
        updated_at=now(),
        updated_by=auth.uid(),
        workspace_generation=v_generation;

    return query
    select m.revision,m.updated_at,
           jsonb_array_length(coalesce(m.manifest->'orderFiles','[]'::jsonb)),
           jsonb_array_length(coalesce(m.manifest->'orderData','[]'::jsonb)),
           m.workspace_generation
      from public.pharmflow_active_order_manifest_v1 m
     where m.pharmacy_id=p_pharmacy_id;
end;
$function$;

revoke all on function public.save_pharmflow_active_order_manifest_v4(
    uuid,jsonb,bigint,bigint
) from public,anon;

grant execute on function public.save_pharmflow_active_order_manifest_v4(
    uuid,jsonb,bigint,bigint
) to authenticated;
