-- STAGING ONLY: fail-closed contingency; preserve all captures and corrections.
-- Prefer a forward fix. Never regrant unsigned v1 APIs or erase historical facts.
-- If a severe defect appears, apply this pause, then restore the prior Staging UI
-- through Vercel Preview only. Saving will remain paused until repaired v2 passes.
begin;
revoke execute on function public.get_pharmflow_expiry_auth_session_v1(uuid,text),public.close_pharmflow_expiry_auth_session_v1(),public.save_pharmflow_expiry_session_capture_v2(uuid,uuid,uuid,jsonb),public.list_pharmflow_expiry_session_v2(uuid,uuid),public.correct_pharmflow_expiry_session_v2(uuid,uuid,uuid,uuid,integer,jsonb),public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb) from authenticated;
commit;
-- Resume only after verification: regrant the exact six signatures above to
-- authenticated; retain all signed-session checks, RLS and existing rows.
