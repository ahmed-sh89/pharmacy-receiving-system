-- Staging preparation only. Additive JSON eligibility and guarded preset application.
-- Existing seven migrations, presets and saved entries are unchanged. No backfill.
CREATE OR REPLACE FUNCTION public.save_pharmflow_duty_presets_v1(p_pharmacy_id uuid,p_presets jsonb,p_expected_revision bigint)
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
  IF r ? 'positions' THEN
   IF jsonb_typeof(r->'positions') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'positions')>1000 THEN RAISE EXCEPTION 'Invalid preset positions';END IF;
   IF (SELECT count(DISTINCT v) FROM jsonb_array_elements(r->'positions') v)<>jsonb_array_length(r->'positions') THEN RAISE EXCEPTION 'Duplicate preset positions';END IF;
   IF EXISTS(SELECT FROM jsonb_array_elements(r->'positions') v WHERE jsonb_typeof(v)<>'string' OR NOT (
    EXISTS(SELECT FROM public.pharmflow_duty_positions_v1 p WHERE p.pharmacy_id=p_pharmacy_id AND p.key=v#>>'{}') OR v#>>'{}' IN ('pharmacist','labor','beauty-advisor')
   )) THEN RAISE EXCEPTION 'Unknown pharmacy position';END IF;
  END IF;
  PERFORM pharmflow_duty_private.validate_entry(jsonb_build_object('status','WORK','periods',r->'periods','basic_limit',540,'note','','highlight',''));
 END LOOP;
 INSERT INTO public.pharmflow_duty_settings_v1(pharmacy_id,shift_presets) VALUES(p_pharmacy_id,p_presets)
 ON CONFLICT(pharmacy_id) DO UPDATE SET shift_presets=excluded.shift_presets,revision=pharmflow_duty_settings_v1.revision+1;
 INSERT INTO public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) VALUES(p_pharmacy_id,'shift-presets','presets',auth.uid(),coalesce(to_jsonb(oldrow),'{}'::jsonb),jsonb_build_object('shift_presets',p_presets));
 RETURN jsonb_build_object('saved',jsonb_array_length(p_presets));
END $$;
REVOKE ALL ON FUNCTION public.save_pharmflow_duty_presets_v1(uuid,jsonb,bigint) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharmflow_duty_presets_v1(uuid,jsonb,bigint) TO authenticated;


create or replace function public.manage_pharmflow_duty_directory_v2(p_pharmacy_id uuid,p_kind text,p_action text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r jsonb;oldrow jsonb;newrow jsonb;used boolean;label text;
begin
 if not pharmflow_duty_private.allowed(p_pharmacy_id,true) then raise exception 'Duty administrator access required' using errcode='42501';end if;
 if p_kind is null or p_kind not in ('employee','position') or p_action is null or p_action not in ('reorder','archive','restore','delete') or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid Duty directory operation';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 if p_action='reorder' then return public.manage_pharmflow_duty_directory_v1(p_pharmacy_id,p_kind,p_action,p_rows);end if;
 if jsonb_array_length(p_rows)<>1 then raise exception 'Select one Duty directory record';end if;
 r=p_rows->0;
 if p_kind='employee' then select to_jsonb(e) into oldrow from public.pharmflow_duty_employees_v1 e where pharmacy_id=p_pharmacy_id and code=r->>'key' for update;
 else select to_jsonb(e) into oldrow from public.pharmflow_duty_positions_v1 e where pharmacy_id=p_pharmacy_id and key=r->>'key' for update;end if;
 if r->>'expected_revision' is null or (r->>'expected_revision')::bigint<>coalesce((oldrow->>'revision')::bigint,0) then raise exception 'DUTY_CONFLICT';end if;
 if oldrow is null then
  label=case r->>'key' when 'pharmacist' then 'Pharmacist' when 'labor' then 'Labor' when 'beauty-advisor' then 'Beauty Advisor' end;
  if p_kind<>'position' or label is null then raise exception 'Unknown Duty directory record';end if;
  perform public.save_pharmflow_duty_position_v1(p_pharmacy_id,r->>'key',label,true,0);
  select to_jsonb(e) into oldrow from public.pharmflow_duty_positions_v1 e where pharmacy_id=p_pharmacy_id and key=r->>'key';
  -- The virtual default was materialized under the same pharmacy lock.
  r=jsonb_set(r,'{expected_revision}',oldrow->'revision');
 end if;
 if p_action='delete' then
  if p_kind='employee' then
   used=exists(select 1 from public.pharmflow_duty_entries_v1 where pharmacy_id=p_pharmacy_id and code=r->>'key')
    or exists(select 1 from public.pharmflow_duty_settings_v1 s cross join lateral jsonb_array_elements(s.hour_rules) v where s.pharmacy_id=p_pharmacy_id and (v->'codes') ? (r->>'key'));
  else
   used=(r->>'key') in ('pharmacist','labor','beauty-advisor')
    or exists(select 1 from public.pharmflow_duty_employees_v1 where pharmacy_id=p_pharmacy_id and position_key=r->>'key')
    or exists(select 1 from public.pharmflow_duty_entries_v1 where pharmacy_id=p_pharmacy_id and identity->>'position_key'=r->>'key')
    or exists(select 1 from public.pharmflow_duty_settings_v1 s cross join lateral jsonb_array_elements(s.shift_presets) p where s.pharmacy_id=p_pharmacy_id and coalesce(p->'positions','[]'::jsonb) ? (r->>'key'));
  end if;
  if used then raise exception 'Historical dependencies exist. Use Archive instead.';end if;
  return public.manage_pharmflow_duty_directory_v1(p_pharmacy_id,p_kind,'delete',jsonb_build_array(r));
 end if;
 if p_kind='employee' then update public.pharmflow_duty_employees_v1 set archived=p_action='archive',active=false,revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and code=r->>'key' returning to_jsonb(pharmflow_duty_employees_v1.*) into newrow;
 else update public.pharmflow_duty_positions_v1 set archived=p_action='archive',active=false,revision=revision+1,updated_at=now() where pharmacy_id=p_pharmacy_id and key=r->>'key' returning to_jsonb(pharmflow_duty_positions_v1.*) into newrow;end if;
 insert into public.pharmflow_duty_audit_v1(pharmacy_id,entity,entity_key,actor_id,before_record,after_record) values(p_pharmacy_id,p_kind||'-'||p_action,r->>'key',auth.uid(),oldrow,newrow);
 return newrow;
end $$;

CREATE FUNCTION public.apply_pharmflow_duty_preset_v1(p_pharmacy_id uuid,p_month date,p_preset_id text,p_expected_settings_revision bigint,p_changes jsonb,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.pharmflow_duty_settings_v1;p jsonb;c jsonb;position_key text;
BEGIN
 IF NOT pharmflow_duty_private.allowed(p_pharmacy_id,true) THEN RAISE EXCEPTION 'Duty administrator access required' USING errcode='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text,4183));
 SELECT * INTO s FROM public.pharmflow_duty_settings_v1 WHERE pharmacy_id=p_pharmacy_id FOR UPDATE;
 IF p_expected_settings_revision IS NULL OR p_expected_settings_revision<>coalesce(s.revision,0) THEN RAISE EXCEPTION 'DUTY_CONFLICT: presets changed; reopen Apply Shift';END IF;
 SELECT v INTO p FROM jsonb_array_elements(s.shift_presets) v WHERE v->>'id'=p_preset_id;
 IF p IS NULL THEN RAISE EXCEPTION 'Preset no longer exists';END IF;
 IF p_month IS NULL OR extract(day FROM p_month)<>1 OR jsonb_typeof(p_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_changes) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid preset destinations';END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
  SELECT e.position_key INTO position_key FROM public.pharmflow_duty_employees_v1 e WHERE e.pharmacy_id=p_pharmacy_id AND e.code=c->>'code';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown Duty employee';END IF;
  IF coalesce(jsonb_array_length(p->'positions'),0)>0 AND NOT (p->'positions') ? position_key THEN RAISE EXCEPTION 'Preset is incompatible with a selected employee position';END IF;
  IF (c->>'date')::date<p_month OR (c->>'date')::date>=(p_month+interval '1 month')::date THEN RAISE EXCEPTION 'Select dates in the active month';END IF;
  IF c->'payload'->>'status' IS DISTINCT FROM 'WORK' OR c->'payload'->'periods' IS DISTINCT FROM p->'periods' OR coalesce(c->'payload'->'manual_minutes','{}'::jsonb)<>'{}'::jsonb THEN RAISE EXCEPTION 'Preset values changed; reopen Apply Shift';END IF;
 END LOOP;
 -- Reuse the existing atomic validated save, audit, overlap check and authoritative read.
 RETURN public.save_pharmflow_duty_schedule_v2(p_pharmacy_id,p_month,p_changes,p_reason);
END $$;
REVOKE ALL ON FUNCTION public.apply_pharmflow_duty_preset_v1(uuid,date,text,bigint,jsonb,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pharmflow_duty_preset_v1(uuid,date,text,bigint,jsonb,text) TO authenticated;
