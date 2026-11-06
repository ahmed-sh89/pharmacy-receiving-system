-- Additive pharmacy-scoped presets. Saved entries contain values, never preset references.
ALTER TABLE public.pharmflow_duty_settings_v1 ADD COLUMN shift_presets jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE FUNCTION public.save_pharmflow_duty_presets_v1(p_pharmacy_id uuid,p_presets jsonb,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE oldrow public.pharmflow_duty_settings_v1; r jsonb; result jsonb;
BEGIN
 IF NOT pharmflow_duty_private.allowed(p_pharmacy_id,true) THEN RAISE EXCEPTION 'Duty administrator access required' USING errcode='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 SELECT * INTO oldrow FROM public.pharmflow_duty_settings_v1 WHERE pharmacy_id=p_pharmacy_id FOR UPDATE;
 IF p_expected_revision IS NULL OR p_expected_revision<>coalesce(oldrow.revision,0) THEN RAISE EXCEPTION 'DUTY_CONFLICT'; END IF;
 IF jsonb_typeof(p_presets) IS DISTINCT FROM 'array' OR jsonb_array_length(p_presets)>50 THEN RAISE EXCEPTION 'Use at most 50 shift presets'; END IF;
 IF (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(p_presets) v)<>jsonb_array_length(p_presets) OR (SELECT count(DISTINCT lower(trim(v->>'name'))) FROM jsonb_array_elements(p_presets) v)<>jsonb_array_length(p_presets) THEN RAISE EXCEPTION 'Preset names and IDs must be unique'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_presets) LOOP
  IF jsonb_typeof(r->'name') IS DISTINCT FROM 'string' OR length(trim(r->>'name')) NOT BETWEEN 1 AND 40 OR jsonb_typeof(r->'id') IS DISTINCT FROM 'string' OR length(r->>'id') NOT BETWEEN 1 AND 60 OR jsonb_array_length(r->'periods') NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'Invalid shift preset'; END IF;
  PERFORM pharmflow_duty_private.validate_entry(jsonb_build_object('status','WORK','periods',r->'periods','basic_limit',540,'note','','highlight',''));
 END LOOP;
 INSERT INTO public.pharmflow_duty_settings_v1(pharmacy_id,shift_presets) VALUES(p_pharmacy_id,p_presets)
 ON CONFLICT(pharmacy_id) DO UPDATE SET shift_presets=excluded.shift_presets,revision=pharmflow_duty_settings_v1.revision+1;
 INSERT INTO public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) VALUES(p_pharmacy_id,'shift-presets','presets',auth.uid(),coalesce(to_jsonb(oldrow),'{}'::jsonb),jsonb_build_object('shift_presets',p_presets));
 RETURN jsonb_build_object('saved',jsonb_array_length(p_presets));
END $$;
REVOKE ALL ON FUNCTION public.save_pharmflow_duty_presets_v1(uuid,jsonb,bigint) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_duty_presets_v1(uuid,jsonb,bigint) TO authenticated;

create or replace function public.get_pharmflow_duty_schedule_v1(p_pharmacy_id uuid,p_month date) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;finish date=(p_month+interval '1 month')::date;s public.pharmflow_duty_settings_v1;
begin
 result=public.get_pharmflow_duty_foundation_v1(p_pharmacy_id,p_month);
 select * into s from public.pharmflow_duty_settings_v1 where pharmacy_id=p_pharmacy_id;
 return result||jsonb_build_object('shift_presets',coalesce(s.shift_presets,'[]'::jsonb),'presets_supported',true,'manual_hours',true,'working_pending',true,'holiday_first',true,'persistent_settings',true,
 'default_basic',coalesce(s.default_basic,540),'hour_rules',coalesce(s.hour_rules,'[]'::jsonb),'settings_revision',coalesce(s.revision,0),
 'entries',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('minutes',pharmflow_duty_private.effective_minutes(p_pharmacy_id,e.date,e.payload,e.code,coalesce(h.active,false))) order by e.date,e.code) from public.pharmflow_duty_entries_v1 e left join public.pharmflow_duty_holidays_v1 h on h.pharmacy_id=e.pharmacy_id and h.date=e.date where e.pharmacy_id=p_pharmacy_id and e.date>=p_month and e.date<finish),'[]'::jsonb),
 'holidays',coalesce((select jsonb_agg(to_jsonb(h) order by h.date) from public.pharmflow_duty_holidays_v1 h where h.pharmacy_id=p_pharmacy_id and h.date>=p_month and h.date<finish),'[]'::jsonb));
end $$;

