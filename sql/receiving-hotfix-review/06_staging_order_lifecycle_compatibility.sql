-- PREPARED ONLY. STAGING tovkcakucyagvbzvlnks ONLY. NOT EXECUTED.
-- First switch/verify the Supabase connection; no Production execution.
-- Exact recovered function bodies, with authenticated-only entry grants.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE v record;v_type text;v_notnull boolean;v_default text;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Use the reviewed migration owner postgres';END IF;
 IF to_regprocedure('public.get_pharmflow_master_cache_meta_v2()') IS NULL THEN
  RAISE EXCEPTION 'Staging compatibility marker absent. Stop and verify target project; Production is prohibited';
 END IF;
 IF to_regclass('public.pharmflow_orders') IS NULL THEN RAISE EXCEPTION 'Missing order table';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.pharmflow_orders'::regclass AND relrowsecurity AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)='postgres') THEN RAISE EXCEPTION 'Order owner/RLS contract differs';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.pharmflow_orders'::regclass AND contype='u' AND convalidated AND pg_get_constraintdef(oid)='UNIQUE (pharmacy_id, order_number)') THEN RAISE EXCEPTION 'Required duplicate-order constraint absent; no function installed';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='id' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'uuid' OR v_notnull IS DISTINCT FROM true OR v_default IS DISTINCT FROM 'gen_random_uuid()' THEN RAISE EXCEPTION 'Order column id contract differs';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='pharmacy_id' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'uuid' OR v_notnull IS DISTINCT FROM true OR v_default IS DISTINCT FROM NULL THEN RAISE EXCEPTION 'Order column pharmacy_id contract differs';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='order_number' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'text' OR v_notnull IS DISTINCT FROM true OR v_default IS DISTINCT FROM NULL THEN RAISE EXCEPTION 'Order column order_number contract differs';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='order_date' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'date' OR v_notnull IS DISTINCT FROM false OR v_default IS DISTINCT FROM NULL THEN RAISE EXCEPTION 'Order column order_date contract differs';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='from_warehouse' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'text' OR v_notnull IS DISTINCT FROM true OR v_default IS DISTINCT FROM '''''::text' THEN RAISE EXCEPTION 'Order column from_warehouse contract differs';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='to_warehouse' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'text' OR v_notnull IS DISTINCT FROM true OR v_default IS DISTINCT FROM '''''::text' THEN RAISE EXCEPTION 'Order column to_warehouse contract differs';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='source_file' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'text' OR v_notnull IS DISTINCT FROM true OR v_default IS DISTINCT FROM '''''::text' THEN RAISE EXCEPTION 'Order column source_file contract differs';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='item_count' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'integer' OR v_notnull IS DISTINCT FROM true OR v_default IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'Order column item_count contract differs';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='status' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'text' OR v_notnull IS DISTINCT FROM true OR v_default IS DISTINCT FROM '''uploaded''::text' THEN RAISE EXCEPTION 'Order column status contract differs';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='uploaded_at' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'timestamp with time zone' OR v_notnull IS DISTINCT FROM true OR v_default IS DISTINCT FROM 'now()' THEN RAISE EXCEPTION 'Order column uploaded_at contract differs';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='uploaded_by' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'uuid' OR v_notnull IS DISTINCT FROM false OR v_default IS DISTINCT FROM NULL THEN RAISE EXCEPTION 'Order column uploaded_by contract differs';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='received_at' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'timestamp with time zone' OR v_notnull IS DISTINCT FROM false OR v_default IS DISTINCT FROM NULL THEN RAISE EXCEPTION 'Order column received_at contract differs';END IF;
 SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) INTO v_type,v_notnull,v_default FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.pharmflow_orders'::regclass AND a.attname='received_by' AND NOT a.attisdropped;
 IF v_type IS DISTINCT FROM 'uuid' OR v_notnull IS DISTINCT FROM false OR v_default IS DISTINCT FROM NULL THEN RAISE EXCEPTION 'Order column received_by contract differs';END IF;
 IF to_regprocedure('public.is_pharmacy_admin(uuid)') IS NULL OR (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('public.is_pharmacy_admin(uuid)')) IS DISTINCT FROM 'c1c335586703076ee2f8bd56ca1378a8' THEN RAISE EXCEPTION 'Authorization helper is_pharmacy_admin differs; review before install';END IF;
 IF to_regprocedure('public.is_system_owner()') IS NULL OR (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('public.is_system_owner()')) IS DISTINCT FROM '9682d90232cbc3ec9b777e24237ab775' THEN RAISE EXCEPTION 'Authorization helper is_system_owner differs; review before install';END IF;
 IF to_regprocedure('public.get_pharmflow_order(uuid,text)') IS NOT NULL AND (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('public.get_pharmflow_order(uuid,text)')) IS DISTINCT FROM '0e4427460fbd825eed0596631777695d' THEN RAISE EXCEPTION 'Existing get_pharmflow_order differs; no overwrite authorized';END IF;
 IF to_regprocedure('public.register_pharmflow_order_upload(uuid,text,date,text,text,text,integer)') IS NOT NULL AND (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('public.register_pharmflow_order_upload(uuid,text,date,text,text,text,integer)')) IS DISTINCT FROM 'c629de8204d6b5158a8ecb7e540d5b1c' THEN RAISE EXCEPTION 'Existing register_pharmflow_order_upload differs; no overwrite authorized';END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.get_pharmflow_order(p_pharmacy_id uuid, p_order_number text)
 RETURNS SETOF pharmflow_orders
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select *
  from public.pharmflow_orders
  where pharmacy_id=p_pharmacy_id
    and upper(regexp_replace(order_number,'\\s','','g'))=
        upper(regexp_replace(p_order_number,'\\s','','g'))
    and auth.uid() is not null
    and public.is_pharmacy_admin(p_pharmacy_id)
  limit 1;
$function$
;
REVOKE ALL ON FUNCTION public.get_pharmflow_order(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_pharmflow_order(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.register_pharmflow_order_upload(p_pharmacy_id uuid, p_order_number text, p_order_date date DEFAULT NULL::date, p_from_warehouse text DEFAULT ''::text, p_to_warehouse text DEFAULT ''::text, p_source_file text DEFAULT ''::text, p_item_count integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Pharmacy ADMIN access required';
  end if;

  if nullif(trim(p_order_number),'') is null then
    raise exception 'Order Number is required';
  end if;

  insert into public.pharmflow_orders(
    pharmacy_id,order_number,order_date,from_warehouse,to_warehouse,
    source_file,item_count,status,uploaded_by
  ) values (
    p_pharmacy_id,
    upper(regexp_replace(trim(p_order_number),'\\s','','g')),
    p_order_date,
    coalesce(p_from_warehouse,''),
    coalesce(p_to_warehouse,''),
    coalesce(p_source_file,''),
    greatest(coalesce(p_item_count,0),0),
    'uploaded',
    auth.uid()
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Order % was already uploaded and cannot be uploaded twice',p_order_number;
end;
$function$
;
REVOKE ALL ON FUNCTION public.register_pharmflow_order_upload(uuid,text,date,text,text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_pharmflow_order_upload(uuid,text,date,text,text,text,integer) TO authenticated;
COMMIT;
