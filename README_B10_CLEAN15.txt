PHARMFLOW B10 CLEAN15 — RPC & EGRESS ROOT FIX
Date: 2026-09-02
Scope: isolated patch; no Supabase/SQL/production mutation performed.

ROOT CAUSE ADDRESSED
Clean14 changed receiving reads to delta_v3 and Manifest reads to metadata-first,
but the browser still ran fixed polling loops every 1 second (receiving) and
3 seconds (generation/manifest). With a workstation left open, those timers
multiply into tens of thousands of RPC calls/day.

CHANGES
1. Replaced independent 1s + 3s read loops with one adaptive single-flight loop.
2. Receiving remote delta read: 3s while active; 15s after 2 minutes idle.
3. Manifest metadata read: 15s active; 60s idle.
4. Workspace generation check: 60s.
5. Hidden/background tabs perform zero periodic cloud reads.
6. Local receiving writes remain immediate through the existing queue/flush path.
7. Existing focus/visibility/auth reconciliation paths are preserved.
8. Existing Clean14 delta_v3 + manifest_meta_v1 endpoints are preserved.
9. Cache-bust updated to B10CLEAN15.

HARD NON-REGRESSION TARGETS
- PC <-> Handheld quantity synchronization
- Active Order Manifest
- REMOVE / reset server authority behavior
- Supabase remains authoritative
- No Receiving UI/layout changes

IMPORTANT TEST NOTE
After deploying this patch, fully close/reopen or hard-refresh PharmFlow on ALL
PCs and Handhelds. An old open tab can continue running the legacy timers and
polluting Supabase request counts even after GitHub is updated.

POST-FIX VALIDATION
1. Functional: scan on PC and Handheld; verify quantity convergence.
2. Manifest: add/remove/restore Active Orders and verify other device.
3. Supabase: compare API Requests over a clean 1-hour active receiving window.
4. Then compare Usage -> Egress after 24 hours.

PRE-FIX OBSERVED BASELINE
- Total Requests / 24h: 136,130
- list_pharmflow_cloud_transactions_v2: 49,244
- get_pharmflow_active_order_manifest_v3: 44,998
- get_pharmflow_workspace_generation: 23,376
- cumulative Usage Egress observed: 3.914 GB

EXPECTED DIRECTION
The fixed timer fan-out is removed. Request volume should fall sharply. Final
success must be judged from Supabase post-deploy measurements, not code review.
