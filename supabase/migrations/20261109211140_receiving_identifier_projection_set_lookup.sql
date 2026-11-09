-- Additive hotfix: preserve the RPC contract and guards; change only its read plan.
-- Do not use ORDER BY item_code LIMIT 1 for a normalized-code lookup: without
-- expression statistics PostgreSQL can choose an ordered primary-key scan and
-- evaluate the normalizer across Global Master once per workspace item.
CREATE OR REPLACE FUNCTION public.get_pharmflow_workspace_identifiers_v1(p_pharmacy_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_rows jsonb;
BEGIN
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'RECEIVING',false,'get_pharmflow_workspace_identifiers_v1');
 PERFORM pharmflow_auth_private.require_access(p_pharmacy_id,'DATA',false,'get_pharmflow_workspace_identifiers_v1');
 WITH codes AS MATERIALIZED (
  SELECT public.pharmflow_receiving_item_code_v1(x->>'itemCode') code,
   min(x->>'itemName') name, sum(coalesce((x->>'orderedQty')::numeric,0)) qty,
   jsonb_agg(x->'orderNumbers') memberships
  FROM public.pharmflow_active_order_manifest_v1 m,
   LATERAL jsonb_array_elements(coalesce(m.manifest->'orderData','[]')) x
  WHERE m.pharmacy_id=p_pharmacy_id AND coalesce((m.manifest->>'active')::boolean,false)
  GROUP BY 1
 ), items AS MATERIALIZED (
  SELECT c.*, lookup.matches, master.item_code master_code, master.group_name
  FROM codes c
  CROSS JOIN LATERAL (
   SELECT count(*) matches, min(g.item_code) first_code
   FROM public.pharmflow_global_items_v2 g
   WHERE public.pharmflow_receiving_item_code_v1(g.item_code)=c.code
  ) lookup
  LEFT JOIN public.pharmflow_global_items_v2 master ON master.item_code=lookup.first_code
 ), pharmacy_identifiers AS MATERIALIZED (
  SELECT p.identifier_key,p.identifier_display,
   public.pharmflow_receiving_item_code_v1(p.item_code) code
  FROM public.pharmflow_pharmacy_gtin_v1 p WHERE p.pharmacy_id=p_pharmacy_id
 ), pharmacy_items AS (
  SELECT code,jsonb_agg(identifier_display ORDER BY identifier_display) identifiers
  FROM pharmacy_identifiers GROUP BY code
 ), global_items AS (
  SELECT i.code,jsonb_agg(g.identifier_display ORDER BY g.identifier_display) identifiers
  FROM items i
  JOIN public.pharmflow_global_item_identifiers_v2 g ON g.item_code=i.master_code
  LEFT JOIN pharmacy_identifiers p ON p.identifier_key=g.identifier_key AND p.code<>i.code
  WHERE p.identifier_key IS NULL
  GROUP BY i.code
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'itemCode',i.code,'itemName',i.name,'orderedQty',i.qty,'orderMemberships',i.memberships,
  'exists',i.matches=1,'conflict',i.matches>1,'groupName',i.group_name,
  'identifiers',coalesce(g.identifiers,'[]'::jsonb)||coalesce(p.identifiers,'[]'::jsonb)
 ) ORDER BY i.code),'[]'::jsonb) INTO v_rows
 FROM items i
 LEFT JOIN global_items g ON g.code=i.code
 LEFT JOIN pharmacy_items p ON p.code=i.code;
 RETURN jsonb_build_object('pharmacyId',p_pharmacy_id,'rows',v_rows);
END $$;
REVOKE ALL ON FUNCTION public.get_pharmflow_workspace_identifiers_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_workspace_identifiers_v1(uuid) TO authenticated;
