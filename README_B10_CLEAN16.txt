PharmFlow Project B — B10 Clean16 Egress Request De-duplication

ROOT CAUSE FOUND IN THE USER-SUPPLIED LATEST PROJECT:
The current js/cloud-workspace.js had reverted to two independent fixed timers:
- authority/manifest/generation loop every 3 seconds
- receiving transaction read loop every 1 second
It also ran nearly identical authority reads from both focus and visibilitychange, which commonly fire together on mobile.

FIX:
- one adaptive READ scheduler
- receiving delta: 3s active / 15s idle
- manifest metadata: 15s active / 60s idle
- generation: 60s
- hidden tabs: zero periodic cloud reads
- focus + visibilitychange: single-flight/de-duplicated foreground sync
- writes stay immediate

UNCHANGED:
Auth, Supabase schema/SQL, receiving transaction semantics, quantities, Active Order authority, Handheld UI/behavior, PC UI.

TEST:
1) Upload only the files in this package preserving folders.
2) Open one PharmFlow tab and sign in.
3) Refresh once, then do nothing for 30 seconds.
4) Supabase Logs should no longer show list_pharmflow_cloud_transactions_delta_v3 every second.
5) Scan on one client and verify the other client converges normally.
