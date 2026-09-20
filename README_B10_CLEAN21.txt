PharmFlow B10 Clean21 — Dirty-only Cloud Workspace Saves

Upload the files in this package to Project B using the same root upload method used for Clean19/Clean20.

Commit subject:
Stop idle workspace cloud saves

Verification:
1. Open ONE Project B tab.
2. Refresh once.
3. Do not scan/search/change orders for 10 minutes.
4. Open Supabase Logs.
5. Inspect save_pharmflow_cloud_workspace_guarded.
Expected: no repeating once-per-minute Project-B compatibility workspace saves during idle.
