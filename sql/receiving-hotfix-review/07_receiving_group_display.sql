-- Additive read-only Global Master display projection. No order/receipt data access.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE FUNCTION public.get_pharmflow_receiving_groups_v1(p_item_codes text[])
RETURNS TABLE(item_code text,group_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp SET statement_timeout='5s' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF coalesce(cardinality(p_item_codes),0)>1000 THEN RAISE EXCEPTION 'At most 1000 Item Codes per request'; END IF;
 -- The same canonical Item Code contract used by Quick Add; ambiguous codes fail closed.
 RETURN QUERY SELECT public.pharmflow_receiving_item_code_v1(i.item_code),min(i.group_name)
 FROM public.pharmflow_global_items_v2 i
 WHERE public.pharmflow_receiving_item_code_v1(i.item_code)=ANY(coalesce(p_item_codes,ARRAY[]::text[]))
 GROUP BY public.pharmflow_receiving_item_code_v1(i.item_code) HAVING count(*)=1;
END $$;
REVOKE ALL ON FUNCTION public.get_pharmflow_receiving_groups_v1(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_receiving_groups_v1(text[]) TO authenticated;
COMMIT;
