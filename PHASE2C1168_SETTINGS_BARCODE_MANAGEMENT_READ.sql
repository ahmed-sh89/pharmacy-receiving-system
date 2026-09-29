-- PHASE2C1168 — additive Settings barcode management read path.
create or replace function public.list_pharmflow_pharmacy_item_identifiers_v1(p_pharmacy_id uuid,p_item_code text)
returns table(identifier_id uuid,identifier_display text,identifier_key text,mapping_revision bigint,item_code text,item_name text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp
as $function$
begin
 if auth.uid() is null or not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Pharmacy access required'; end if;
 return query
 select m.id,m.identifier_display,m.identifier_key,m.mapping_revision,m.item_code,m.item_name,m.created_at,m.updated_at
 from public.pharmflow_pharmacy_gtin_v1 m
 where m.pharmacy_id=p_pharmacy_id and m.item_code=btrim(coalesce(p_item_code,''))
 order by m.created_at asc,m.identifier_key asc;
end
$function$;
revoke all on function public.list_pharmflow_pharmacy_item_identifiers_v1(uuid,text) from public,anon;
grant execute on function public.list_pharmflow_pharmacy_item_identifiers_v1(uuid,text) to authenticated;
