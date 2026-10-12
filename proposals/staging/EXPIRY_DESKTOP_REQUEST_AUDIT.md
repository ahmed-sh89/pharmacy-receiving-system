# Expiry Desktop recurring Supabase requests — Staging

Starting verified GitHub/local HEAD: bf112f9bd389e260472546766b9861d131394cec.
Branch: feature/expiry-stage1-visual-gate. Supabase: tovkcakucyagvbzvlnks.
Vercel: pharmflow-test Preview; existing stable URL unchanged.
Production code/database/config/deployments untouched. No Supabase schema/RLS/RPC change.

## VERIFIED root causes
ui.js refreshNeedsReviewCountFromCloud runs every 30s, plus focus/visibility with a 25s dedupe. It calls refreshNeedsReviewCounters, which previously fetched list_pharmflow_needs_review_v4(RECEIVING) and projected rows into the PC-selected order scope. Despite an obsolete comment mentioning a tiny count, the actual selected-order counter used full review rows.
1. This Receiving-only counter fetched rows in Expiry Desktop even though Expiry has its own ExpiryReviewBackend counter/contract.
2. Empty selected-order scope always projects every possible row to zero; the previous query could not change the displayed result.
3. route:changed called ensureNeedsReviewButtons (which refreshes the counter), then refreshed again, and a third time for expiry. Direct/event counter callers lacked an in-flight read owner, allowing overlapping identical requests.

Corrections: skip Receiving counter reads in expiry; render the existing zero result without a query when no orders are selected; coalesce only in-flight identical user/pharmacy/order-scope reads; discard old-scope results; retain fresh sequential authoritative reads. Route entry has one counter owner. All counter entry points stop during existing Idle Sleep. No polling interval was changed; no cache of review rows/counts is used.

## RPC classification — VERIFIED source, not live counts
| RPC | Initiator/trigger | Classification / behavior |
|---|---|---|
| list_pharmflow_needs_review_v4(RECEIVING) | refreshNeedsReviewCounters; watcher every 30s, focus/visibility, route and receiving events | Redundant in Expiry or empty PC scope. Conditional/required for Receiving with selected orders. Overlapping same-scope requests coalesced. |
| get_pharmflow_active_order_manifest_meta_v1 | pollActiveOrderManifestMeta; shared adaptive scheduler every 15s | Required for newly activated orders/assignments from another device, including while the current workspace is empty. Unchanged. |
| get_pharmflow_workspace_generation | reconcileWorkspaceGeneration; shared scheduler every 60s plus lifecycle/structural operations | Required for authoritative remote reset/generation fences. Unchanged. |
| get_pharmflow_cloud_workspace | restoreCloudWorkspaceOnLogin / reconcileCloudWorkspaceAuthority | Conditional startup/hydration/foreground compatibility read. It is not an unconditional steady-state timer read once hydrated. Redundancy in the reported capture is not established. Unchanged. |
| get_pharmflow_active_order_manifest_v3 | startup, Receiving entry, metadata indicating change, forced recovery | Conditional authority read. Previous bf112f9 empty-answer optimization retained exactly. |
| list_pharmflow_cloud_transactions_delta_v3 | shared scheduler: 3s after Receiving activity, 15s idle | Required when orders exist; no ledger RPC for a known empty workspace. Cursor/queue semantics unchanged. |
| Expiry current-state/review/capture/session RPCs | Expiry activation, business actions, scoped focus refresh | Necessary Expiry paths unchanged; no new timer/heartbeat. |
| Auth user/token/session requests | existing authenticated lifecycle | Required, unchanged; excluded from inferred business polling counts. |

The shared initialized guard and the Desktop watcher clearInterval prevent multiple active timers. The 10s context watcher calls hydration only when the pharmacy is not hydrated; it does not by itself imply a request every 10s. The local scanner focus watch does not call Supabase. No recurring subscription was added/removed.

## Baseline and comparison
Product Owner evidence: 48 Fetch/XHR requests, approximately 46KB, timeline >300s, HTTP200 responses. This is USER-OBSERVED evidence, not our instrumented baseline, and not all requests are redundant.
An authenticated Desktop browser was available in the prior session, but the provided browser interface has no Network/response-body capture and its read-only environment does not expose Resource Timing. Therefore our two-minute and ten-minute comparisons below are SIMULATED, not live captures. No actual transferred-byte/egress reduction is asserted.

Deterministic tests execute the canonical UI watcher/counter functions against fake request boundaries, exclude startup, and advance four 30s ticks. Shared-scheduler tests execute its existing callback for eight 15s ticks.
| RPC / scenario (steady 120s) | Before | After | Classification |
|---|---:|---:|---|
| Receiving review list / Expiry Desktop idle | 4 | 0 | SIMULATED / Redundant |
| Receiving review list / Choose Workspace Handheld idle | 0 | 0 | SIMULATED / Already excluded |
| Receiving review list / Receiving Desktop, no selected order | 4 | 0 | SIMULATED / Redundant; unchanged zero projection |
| Receiving review list / Expiry after Receiving | 4 | 0 | SIMULATED / Redundant |
| Receiving review list / Receiving with selected order | 4 | 4 | SIMULATED / Conditional, retained |
| Manifest metadata / awake shared scheduler | 8 | 8 | SIMULATED / Required |
| Workspace generation / awake shared scheduler | 2 | 2 | SIMULATED / Required |
| Three overlapping identical counter reads | 3 | 1 | SIMULATED / Redundant duplicates |
| Nonessential counter reads during Idle Sleep | 0 | 0 | SIMULATED / Existing sleep retained |
These are grouped affected subpaths, not total whole-application traffic. Actual live request totals/frequency/bytes in the five requested scenarios are NOT MEASURED. Startup reads are separate and unchanged apart from avoiding the Receiving counter in an irrelevant surface.

Canonical idle implementation is tested directly: native fetch works before sleep, rejects while asleep without reaching the native transport, and works again after resume. IDLE_MS remains 10*60*1000. A real ten-minute browser Network capture remains NOT MEASURED.

## Verification / release
Focused: 65 PASS / 0 FAIL. Full: 567 PASS / 43 FAIL / 1 SKIP, compared with a fresh isolated bf112f9 baseline 555 / 43 / 1. Exact same 43 failing names; no new failure. Production build, ui.js syntax and diff checks pass.
Fixtures verify selected-order scope, old account/pharmacy response rejection, same-scope coalescing without result caching, empty→new-order transition, Receiving→Expiry→Receiving, one watcher timer, sleep/resume, required shared metadata/generation calls and queue flush ownership. Existing U0030/scan queue, transaction attribution, request-root and Expiry session tests pass.
Cloud scheduler, prior manifest/wake fixes, auth, queue implementation, Capture/History/GS1/UI styling and Expiry request owners are byte-for-byte unchanged. index.html only changes the root ui.js cache version.

Remaining necessary polling: 15s metadata and 60s generation for cross-device order/assignment/reset discovery; Receiving review list every30s when its selected-order counter is relevant; ledger delta when orders exist. Suspending these without a replacement entry/change-discovery contract would require separately approved synchronization redesign and is not implemented.
Remaining verification: actual authenticated Network before/after totals and bytes, physical multi-PC/Handheld sync and real ten-minute sleep observation. Candidate READY FOR TEST, not USER VERIFIED. No Production promotion.
