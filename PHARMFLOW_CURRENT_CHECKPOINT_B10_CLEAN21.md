# PharmFlow B10 Clean21 — Dirty-only Cloud Workspace Saves

Status: NOT USER VERIFIED
Date: 2026-09-03
Target: Project B / pharmflow-dev only

## Root trace
The compatibility RPC `save_pharmflow_cloud_workspace_guarded` had a legacy ownership bridge:
`saveWorkspaceSnapshot()` -> `workspace:saved` -> cloud workspace snapshot scheduler.
Local autosave runs independently of a real pharmacy data mutation, so a persistence heartbeat could still reach the cloud compatibility-save path. This ownership is unnecessary because receiving changes already use the authoritative transaction queue and order structure uses the Active Order Manifest.

## Clean21 root fix
- Removed the `workspace:saved` -> cloud compatibility write bridge.
- Local autosave remains local and continues normally.
- Receiving transactions remain immediate through the canonical transaction queue.
- Added a structural signature gate for `files:updated`.
- Active Order Manifest + compatibility Cloud Workspace are written only when order structure is actually dirty.
- Remote manifest/server-empty hydration cannot trigger structural writes back to Supabase.
- Structural save success records the synced signature.
- No SQL/schema/Auth/quantity/UI behavior changes.

## Expected idle behavior
After startup settles and no user activity occurs, Project B should no longer issue a periodic `save_pharmflow_cloud_workspace_guarded` solely because local autosave fired.

## Verification
Open one Project B tab, leave idle 10 minutes, then inspect Supabase logs. Filter/inspect `save_pharmflow_cloud_workspace_guarded`. Expected: no once-per-minute Project-B compatibility writes while idle.
