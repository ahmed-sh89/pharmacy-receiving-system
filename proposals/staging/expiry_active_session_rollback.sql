-- First roll the Staging client back to 51c63db. Preserve all session/audit rows.
-- Do not restore old quantity readers after any correction has committed.
begin;
revoke execute on function public.open_pharmflow_expiry_session_v1(uuid,uuid,text),public.close_pharmflow_expiry_session_v1(uuid,uuid),public.save_pharmflow_expiry_session_capture_v1(uuid,uuid,uuid,jsonb),public.list_pharmflow_expiry_session_v1(uuid,uuid),public.correct_pharmflow_expiry_session_v1(uuid,uuid,uuid,uuid,integer,integer) from authenticated;
-- Keep the corrected review quantity readers/resolver in service. Returning to
-- original readers requires zero adjustments and a separate reviewed release.
commit;
