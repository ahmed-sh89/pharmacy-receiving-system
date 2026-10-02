-- PharmFlow Receiving History hardening after advisor verification.
revoke all on table public.pharmflow_receiving_workspace_history_v1 from public,anon,authenticated;
revoke all on table public.pharmflow_receiving_history_items_v1 from public,anon,authenticated;
grant select on table public.pharmflow_receiving_workspace_history_v1 to authenticated;
grant select on table public.pharmflow_receiving_history_items_v1 to authenticated;

create index if not exists idx_pf_receiving_history_items_workspace_id
    on public.pharmflow_receiving_history_items_v1(workspace_history_id);
