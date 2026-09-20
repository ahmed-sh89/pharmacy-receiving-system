PharmFlow Project B — B10 Clean17
Startup Authority & Dirty Save Root Fix

Scope:
- Consolidates login/startup cloud authority into one shared single-flight promise.
- Adaptive background reads wait until startup authority completes.
- Foreground focus/visibility reconciliation reuses startup authority instead of racing it.
- Local autosave no longer causes save_pharmflow_cloud_workspace_guarded when workspace data is unchanged.
- Preserves Clean16 adaptive read cadence: transactions 3s active/15s idle, manifest 15s/60s, generation 60s, no hidden-tab periodic reads.
- Auth behavior, Receiving quantities, Supabase schema, PC/Handheld UI are unchanged.

Deploy only these changed files to Project B, preserving their paths.
