-- PHASE2C1185 — Minimal Staging-only Cloud Workspace save RPC dependency.
-- Project: tovkcakucyagvbzvlnks ONLY. Additive contract; no row backfill.
begin;
create or replace function public.save_pharmflow_cloud_workspace(p_pharmacy_id uuid,p_workspace jsonb,p_device_id text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or public.pharmflow_can_access_pharmacy(p_pharmacy_id) is not true then raise exception 'Pharmacy access required'; end if;
  insert into public.pharmflow_cloud_workspaces(pharmacy_id,workspace,updated_at,updated_by,device_id)
  values(p_pharmacy_id,coalesce(p_workspace,'{}'::jsonb),now(),auth.uid(),p_device_id)
  on conflict(pharmacy_id) do update set workspace=excluded.workspace,updated_at=now(),updated_by=auth.uid(),device_id=excluded.device_id;
end;
$$;
revoke all on function public.save_pharmflow_cloud_workspace(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_pharmflow_cloud_workspace(uuid,jsonb,text) to authenticated;
commit;
