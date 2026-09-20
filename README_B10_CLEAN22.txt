PharmFlow B10 Clean22 — Periodic Workspace Write Owner Root Fix

Root fix:
- Generic files:updated no longer writes the legacy full Cloud Workspace snapshot.
- files:updated may persist only the Active Order Manifest when its structural signature changed.
- Full Cloud Workspace writes remain only in explicit structural lifecycle sync functions.
- Receiving quantities remain transaction-ledger driven and immediate.
- No Auth, SQL, Handheld UI, quantity math, or Project A changes.

Verification:
1. Deploy changed files to Project B.
2. Keep one Project B tab open and idle for 10 minutes.
3. Filter Supabase logs for save_pharmflow_cloud_workspace_guarded.
4. Project B should generate no periodic one-minute workspace saves while idle.
5. If exact one-minute saves remain in the shared Supabase project, they are from another deployed client (most likely Project A / an old open client), not this B generic event path.
