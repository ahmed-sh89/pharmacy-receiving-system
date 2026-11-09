-- Synthetic, private Staging-only scale fixture. Never execute on Production.
CREATE SCHEMA pharmflow_identifier_perf_nostats_20261110;
REVOKE ALL ON SCHEMA pharmflow_identifier_perf_nostats_20261110 FROM PUBLIC,anon,authenticated;
CREATE TABLE pharmflow_identifier_perf_nostats_20261110.pharmflow_active_order_manifest_v1 (LIKE public.pharmflow_active_order_manifest_v1 INCLUDING DEFAULTS INCLUDING CONSTRAINTS) WITH (autovacuum_enabled=false);
CREATE TABLE pharmflow_identifier_perf_nostats_20261110.pharmflow_global_items_v2 (LIKE public.pharmflow_global_items_v2 INCLUDING DEFAULTS INCLUDING CONSTRAINTS) WITH (autovacuum_enabled=false);
CREATE TABLE pharmflow_identifier_perf_nostats_20261110.pharmflow_global_item_identifiers_v2 (LIKE public.pharmflow_global_item_identifiers_v2 INCLUDING DEFAULTS INCLUDING CONSTRAINTS) WITH (autovacuum_enabled=false);
CREATE TABLE pharmflow_identifier_perf_nostats_20261110.pharmflow_pharmacy_gtin_v1 (LIKE public.pharmflow_pharmacy_gtin_v1 INCLUDING DEFAULTS INCLUDING CONSTRAINTS) WITH (autovacuum_enabled=false);

ALTER TABLE pharmflow_identifier_perf_nostats_20261110.pharmflow_global_items_v2 ADD PRIMARY KEY(item_code);
CREATE INDEX perf_identifier_item_idx ON pharmflow_identifier_perf_nostats_20261110.pharmflow_global_item_identifiers_v2(item_code);
CREATE UNIQUE INDEX perf_identifier_key_idx ON pharmflow_identifier_perf_nostats_20261110.pharmflow_global_item_identifiers_v2(identifier_key);
CREATE INDEX perf_pharmacy_item_idx ON pharmflow_identifier_perf_nostats_20261110.pharmflow_pharmacy_gtin_v1(pharmacy_id,item_code);
CREATE UNIQUE INDEX perf_pharmacy_key_idx ON pharmflow_identifier_perf_nostats_20261110.pharmflow_pharmacy_gtin_v1(pharmacy_id,identifier_key);
INSERT INTO pharmflow_identifier_perf_nostats_20261110.pharmflow_global_items_v2(item_code,item_name,group_name)
 SELECT '9'||lpad(n::text,6,'0'),'Synthetic scale item '||n,'Medicine' FROM generate_series(1,56604) n;
INSERT INTO pharmflow_identifier_perf_nostats_20261110.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key)
 SELECT '9'||lpad((((n-1)%56604)+1)::text,6,'0'),'PERF-G-'||n,'PERF-G-'||n FROM generate_series(1,78192) n;
INSERT INTO pharmflow_identifier_perf_nostats_20261110.pharmflow_pharmacy_gtin_v1(pharmacy_id,gtin,item_code,item_name,identifier_display,identifier_key)
 SELECT 'f1111111-1111-4111-8111-111111111111','PERF-P-'||n,'9'||lpad((56161+n)::text,6,'0'),'Synthetic scale item','PERF-P-'||n,'PERF-P-'||n FROM generate_series(1,443) n;
INSERT INTO pharmflow_identifier_perf_nostats_20261110.pharmflow_active_order_manifest_v1(pharmacy_id,manifest)
 SELECT 'f1111111-1111-4111-8111-111111111111',jsonb_build_object('active',true,'orderData',jsonb_agg(jsonb_build_object('itemCode','9'||lpad(n::text,6,'0'),'itemName','Synthetic scale item '||n,'orderedQty',10,'orderNumbers',jsonb_build_array('PERF-A','PERF-B')) ORDER BY n)) FROM generate_series(56119,56604) n;
ANALYZE pharmflow_identifier_perf_nostats_20261110.pharmflow_global_items_v2;
ANALYZE pharmflow_identifier_perf_nostats_20261110.pharmflow_global_item_identifiers_v2;
ANALYZE pharmflow_identifier_perf_nostats_20261110.pharmflow_pharmacy_gtin_v1;
ANALYZE pharmflow_identifier_perf_nostats_20261110.pharmflow_active_order_manifest_v1;
-- Match the incident: valid expression index created after the last table analyze.
CREATE INDEX perf_canonical_code_idx ON pharmflow_identifier_perf_nostats_20261110.pharmflow_global_items_v2(public.pharmflow_receiving_item_code_v1(item_code));
CREATE FUNCTION pharmflow_identifier_perf_nostats_20261110.old_projection(p_pharmacy_id uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $perf$
DECLARE v_rows jsonb;
BEGIN
 WITH codes AS (
 SELECT public.pharmflow_receiving_item_code_v1(x->>'itemCode') code,
 min(x->>'itemName') name, sum(coalesce((x->>'orderedQty')::numeric,0)) qty,
 jsonb_agg(x->'orderNumbers') memberships
 FROM pharmflow_identifier_perf_nostats_20261110.pharmflow_active_order_manifest_v1 m,
 LATERAL jsonb_array_elements(coalesce(m.manifest->'orderData','[]')) x
 WHERE m.pharmacy_id=p_pharmacy_id AND coalesce((m.manifest->>'active')::boolean,false)
 GROUP BY 1), items AS (
 SELECT c.*, (SELECT count(*) FROM pharmflow_identifier_perf_nostats_20261110.pharmflow_global_items_v2 g WHERE public.pharmflow_receiving_item_code_v1(g.item_code)=c.code) matches,
 (SELECT to_jsonb(g) FROM pharmflow_identifier_perf_nostats_20261110.pharmflow_global_items_v2 g WHERE public.pharmflow_receiving_item_code_v1(g.item_code)=c.code ORDER BY g.item_code LIMIT 1) master
 FROM codes c)
 SELECT coalesce(jsonb_agg(jsonb_build_object('itemCode',i.code,'itemName',i.name,'orderedQty',i.qty,'orderMemberships',i.memberships,
 'exists',i.matches=1,'conflict',i.matches>1,'groupName',i.master->>'group_name',
 'identifiers',coalesce((SELECT jsonb_agg(g.identifier_display ORDER BY g.identifier_display) FROM pharmflow_identifier_perf_nostats_20261110.pharmflow_global_item_identifiers_v2 g
 WHERE g.item_code=i.master->>'item_code' AND NOT EXISTS(SELECT 1 FROM pharmflow_identifier_perf_nostats_20261110.pharmflow_pharmacy_gtin_v1 p WHERE p.pharmacy_id=p_pharmacy_id AND p.identifier_key=g.identifier_key AND public.pharmflow_receiving_item_code_v1(p.item_code)<>i.code)),'[]'::jsonb)
 ||coalesce((SELECT jsonb_agg(p.identifier_display ORDER BY p.identifier_display) FROM pharmflow_identifier_perf_nostats_20261110.pharmflow_pharmacy_gtin_v1 p WHERE p.pharmacy_id=p_pharmacy_id AND public.pharmflow_receiving_item_code_v1(p.item_code)=i.code),'[]'::jsonb)) ORDER BY i.code),'[]'::jsonb) INTO v_rows FROM items i;
 RETURN jsonb_build_object('pharmacyId',p_pharmacy_id,'rows',v_rows);
END $perf$;
REVOKE ALL ON FUNCTION pharmflow_identifier_perf_nostats_20261110.old_projection(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION pharmflow_identifier_perf_nostats_20261110.new_projection(p_pharmacy_id uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $perf$
DECLARE v_rows jsonb;
BEGIN
 WITH codes AS MATERIALIZED (
  SELECT public.pharmflow_receiving_item_code_v1(x->>'itemCode') code,
   min(x->>'itemName') name, sum(coalesce((x->>'orderedQty')::numeric,0)) qty,
   jsonb_agg(x->'orderNumbers') memberships
  FROM pharmflow_identifier_perf_nostats_20261110.pharmflow_active_order_manifest_v1 m,
   LATERAL jsonb_array_elements(coalesce(m.manifest->'orderData','[]')) x
  WHERE m.pharmacy_id=p_pharmacy_id AND coalesce((m.manifest->>'active')::boolean,false)
  GROUP BY 1
 ), items AS MATERIALIZED (
  SELECT c.*, lookup.matches, master.item_code master_code, master.group_name
  FROM codes c
  CROSS JOIN LATERAL (
   SELECT count(*) matches, min(g.item_code) first_code
   FROM pharmflow_identifier_perf_nostats_20261110.pharmflow_global_items_v2 g
   WHERE public.pharmflow_receiving_item_code_v1(g.item_code)=c.code
  ) lookup
  LEFT JOIN pharmflow_identifier_perf_nostats_20261110.pharmflow_global_items_v2 master ON master.item_code=lookup.first_code
 ), pharmacy_identifiers AS MATERIALIZED (
  SELECT p.identifier_key,p.identifier_display,
   public.pharmflow_receiving_item_code_v1(p.item_code) code
  FROM pharmflow_identifier_perf_nostats_20261110.pharmflow_pharmacy_gtin_v1 p WHERE p.pharmacy_id=p_pharmacy_id
 ), pharmacy_items AS (
  SELECT code,jsonb_agg(identifier_display ORDER BY identifier_display) identifiers
  FROM pharmacy_identifiers GROUP BY code
 ), global_items AS (
  SELECT i.code,jsonb_agg(g.identifier_display ORDER BY g.identifier_display) identifiers
  FROM items i
  JOIN pharmflow_identifier_perf_nostats_20261110.pharmflow_global_item_identifiers_v2 g ON g.item_code=i.master_code
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
END $perf$;
REVOKE ALL ON FUNCTION pharmflow_identifier_perf_nostats_20261110.new_projection(uuid) FROM PUBLIC,anon,authenticated;
