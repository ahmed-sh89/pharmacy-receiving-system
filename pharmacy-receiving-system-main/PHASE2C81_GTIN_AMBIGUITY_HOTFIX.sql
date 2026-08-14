-- ============================================================
-- PHARMFLOW — PHASE 2C.8.1
-- GTIN AMBIGUITY HOTFIX
--
-- Fixes:
--   ERROR: column reference "gtin" is ambiguous
--
-- Cause:
--   learn_pharmacy_gtin() RETURNS TABLE(gtin,...), so PL/pgSQL
--   creates an output variable named "gtin". The previous
--   ON CONFLICT(pharmacy_id,gtin) could therefore be interpreted
--   as either the output variable or the table column.
--
-- Safety:
--   - Does NOT delete GTIN data.
--   - Does NOT change Global Master rows.
--   - Does NOT change orders / receiving / archives.
--   - Replaces only the RPC function body.
-- ============================================================

create or replace function public.learn_pharmacy_gtin(
    p_pharmacy_id uuid,
    p_gtin text,
    p_item_code text,
    p_item_name text
)
returns table(
    gtin text,
    item_code text,
    item_name text,
    source text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_gtin text := regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g');
    v_code text := trim(coalesce(p_item_code,''));
    v_name text := trim(coalesce(p_item_name,''));
begin
    if auth.uid() is null
       or not public.is_pharmacy_member(p_pharmacy_id) then
        raise exception 'Pharmacy access required';
    end if;

    if v_gtin = '' or v_code = '' then
        raise exception 'GTIN and Item Code are required';
    end if;

    insert into public.pharmflow_pharmacy_gtin_v1 as target (
        pharmacy_id,
        gtin,
        item_code,
        item_name,
        source,
        created_by,
        updated_by
    )
    values (
        p_pharmacy_id,
        v_gtin,
        v_code,
        v_name,
        'PHARMACY_LEARNED',
        auth.uid(),
        auth.uid()
    )
    on conflict on constraint pharmflow_pharmacy_gtin_v1_pharmacy_id_gtin_key
    do update set
        item_code = excluded.item_code,
        item_name = case
            when excluded.item_name <> '' then excluded.item_name
            else target.item_name
        end,
        source = 'PHARMACY_LEARNED',
        updated_by = auth.uid(),
        updated_at = now();

    return query
    select
        g.gtin,
        g.item_code,
        g.item_name,
        g.source
    from public.pharmflow_pharmacy_gtin_v1 as g
    where g.pharmacy_id = p_pharmacy_id
      and g.gtin = v_gtin
    limit 1;
end;
$$;

revoke all on function public.learn_pharmacy_gtin(uuid,text,text,text)
from public, anon;

grant execute on function public.learn_pharmacy_gtin(uuid,text,text,text)
to authenticated;

-- Force PostgREST to reload the updated function definition.
select pg_notify('pgrst','reload schema');
