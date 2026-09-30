-- PHASE2C1171 — allow System Owner to coordinate Settings barcode removal.
-- Root-cause fix for the Settings owner path; HHP084 ADMIN behavior is preserved.

create or replace function public.remove_pharmflow_settings_identifier_v1(
    p_global_operation_id uuid,
    p_pharmacy_operation_id uuid,
    p_pharmacy_id uuid,
    p_identifier_display text,
    p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_is_owner boolean := public.is_system_owner();
    v_is_hhp084_admin boolean;
    v_pharmacy_identifier record;
    v_global_identifier record;
begin
    select exists(
        select 1
        from public.pharmacy_members pm
        join public.pharmacies p on p.id=pm.pharmacy_id
        where pm.user_id=auth.uid()
          and pm.pharmacy_id=p_pharmacy_id
          and pm.active=true
          and lower(coalesce(pm.role,''))='admin'
          and upper(coalesce(p.code,''))='HHP084'
    ) into v_is_hhp084_admin;

    if not v_is_owner and not v_is_hhp084_admin then
        raise exception 'System Owner or HHP084 ADMIN permission required';
    end if;

    select x.identifier_id,x.mapping_revision
    into v_pharmacy_identifier
    from public.list_pharmflow_pharmacy_item_identifiers_v1(p_pharmacy_id,'') x
    where upper(btrim(x.identifier_display))=upper(btrim(p_identifier_display))
    limit 1;

    -- The list RPC is item-scoped; resolve the exact pharmacy mapping directly
    -- so owner removal cannot leave local provenance behind.
    if v_pharmacy_identifier.identifier_id is null then
        select p.id as identifier_id,p.mapping_revision
        into v_pharmacy_identifier
        from public.pharmflow_pharmacy_gtin_v1 p
        where p.pharmacy_id=p_pharmacy_id
          and upper(btrim(p.gtin))=upper(btrim(p_identifier_display))
        limit 1;
    end if;

    if v_pharmacy_identifier.identifier_id is not null then
        perform public.remove_pharmflow_pharmacy_identifier_v2(
            p_pharmacy_operation_id,p_pharmacy_id,
            v_pharmacy_identifier.identifier_id,v_pharmacy_identifier.mapping_revision,p_reason
        );
    end if;

    select g.id as identifier_id,g.mapping_revision
    into v_global_identifier
    from public.pharmflow_global_item_identifiers_v2 g
    where g.identifier_key=upper(btrim(p_identifier_display))
    limit 1;

    if v_global_identifier.identifier_id is not null then
        perform public.remove_pharmflow_global_identifier_v2(
            p_global_operation_id,v_global_identifier.identifier_id,
            v_global_identifier.mapping_revision,p_reason
        );
    end if;
end;
$$;

revoke all on function public.remove_pharmflow_settings_identifier_v1(uuid,uuid,uuid,text,text) from public, anon;
grant execute on function public.remove_pharmflow_settings_identifier_v1(uuid,uuid,uuid,text,text) to authenticated;
