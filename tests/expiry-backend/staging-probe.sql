-- STAGING TEST INSTRUMENTATION ONLY. Never include in the release migration.
CREATE OR REPLACE FUNCTION public.pharmflow_expiry_staging_probe_v1(p_pharmacy_id uuid, p_operation_id uuid, p_capture jsonb, p_delay numeric DEFAULT 0, p_rollback boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$ DECLARE r jsonb;started timestamptz:=clock_timestamp();write_started timestamptz;write_finished timestamptz;BEGIN IF p_pharmacy_id NOT IN ('11111111-1111-4111-8111-111111111111'::uuid,'22222222-2222-4222-8222-222222222222'::uuid) OR p_delay<0 OR p_delay>2 THEN RAISE EXCEPTION 'Synthetic target required';END IF;PERFORM pg_sleep(p_delay);write_started:=clock_timestamp();r:=public.save_pharmflow_expiry_capture_v3(p_pharmacy_id,p_operation_id,p_capture);write_finished:=clock_timestamp();PERFORM pg_sleep(p_delay);IF p_rollback THEN RAISE EXCEPTION 'Synthetic rollback after save';END IF;RETURN jsonb_build_object('ack',r,'backend_pid',pg_backend_pid(),'started',started,'write_started',write_started,'write_finished',write_finished,'finished',clock_timestamp());END $function$
;
revoke all on function public.pharmflow_expiry_staging_probe_v1(uuid,uuid,jsonb,numeric,boolean) from public,anon;
grant execute on function public.pharmflow_expiry_staging_probe_v1(uuid,uuid,jsonb,numeric,boolean) to authenticated;

