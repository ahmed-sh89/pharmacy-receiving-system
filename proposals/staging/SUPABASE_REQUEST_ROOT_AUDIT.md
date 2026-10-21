# Supabase unnecessary requests — Staging root-cause audit

Baseline: cfbc4aa8163636f14c26ccf6cb6e4f41a58bdcc9, feature/expiry-stage1-visual-gate.
Environment: tovkcakucyagvbzvlnks / pharmflow-test Preview only.
Production source read only: main e935582e4484d13ba6f98232fe1a8de2affaee68. No Production database/config/deployment action.

## VERIFIED source and controlled invocation findings
The warning is emitted by pullActiveOrderManifest in cloud-workspace.js after await authRpc(get_pharmflow_active_order_manifest_v3) returns no manifest. utils.js Logger.warn only forwards to console; the warning is not a U0030-specific recovery function. authRpc performs an authenticated POST through authRequest/fetch, and can retry after token refresh. A successful warning branch follows a completed RPC; warning count is not total traffic or bytes.

Three coordinated causes:
1. Empty-order pullCloudWorkspaceTransactions re-fetches the full manifest in each normal receiving scheduler cycle even though pollActiveOrderManifestMeta already checks authoritative changes every 15s.
2. pullActiveOrderManifestAuthority treats a successful empty server answer like a busy/transport failure and forces four reads.
3. Handheld install/pageshow/focus/visibility/online wake calls hhRefreshWorkspaceAuthority in IDLE and EXPIRY; that extra owner invokes the Receiving refresh path alongside the shared cloud owner.
The 900ms scanner focus watch is local only. Initialization guards prevent duplicate installation; no redundant subscription was found in the affected owners. Multiple focus owners exist, but their existing busy/throttle guards mean every function invocation need not reach the network.

Corrections: track only the latest successful empty manifest answer, scoped/reset to current pharmacy/account; suppress repeated full-read ledger fallback while unchanged server metadata checks continue. Metadata failure invalidates known absence; explicit force and new order metadata retain full-read recovery. Stop forced retries only after definitive empty authority. Restrict the extra Handheld wake refresh to Receiving and awake state. Explicit Receiving mode entry still hydrates while the UI is on Choose Workspace.
No polling interval, shared scheduler, queue flush/repair, cursor, transaction, U0030 retry, auth, idle timer/refresh, Expiry or UI behavior changed. No warnings suppressed. No data/schema/RLS changes.

## Before/after comparison — VERIFIED controlled fake-RPC boundary, NOT live network
| Reproducible subpath | Before | After |
|---|---:|---:|
| Four 15s cycles after authoritative empty manifest: full reads | 4 | 0 |
| Same cycles: metadata reads | 4 | 4 |
| Forced authority pass with successful empty answer | 4 | 1 |
| One additional Handheld wake in Choose Workspace | 1 | 0 |
| One additional Handheld wake in Expiry/History mode | 1 | 0 |
| One additional Handheld wake in Receiving | 1 | 1 |
| Transport-error authority retry attempts | 4 | 4 |
These are only affected subpaths, not whole-app request totals, billing or actual egress. Controlled fixtures return an empty server response and count canonical authRpc invocations; no real Supabase calls or sensitive contents are used.

## Live browser observation and measurement limits
A signed-in Staging Desktop browser was available. Before editing it logged 20 no-manifest warnings between 01:14:44.549Z and 01:18:50.617Z; the steady segment was approximately 15.5–16 seconds between warnings. This is observed Console frequency, not a complete Network capture. The browser interface exposes no Network request/response-body recording and its read-only evaluation environment does not expose performance.now/resource timing. Transferred bytes, physical Handheld counts, and live before/after total network reduction are NOT MEASURED. No egress savings percentage is claimed.

| Required scenario | Classification / result |
|---|---|
| Initial startup | Controlled forced-empty subpath 4→1; total/auth/compatibility reads NOT MEASURED |
| Choose Workspace idle | Extra HH wake 1→0; shared metadata retained; live Handheld totals NOT MEASURED |
| Expiry idle | Extra HH wake 1→0; no shared scheduler shutdown; live Handheld totals NOT MEASURED |
| Expiry History idle | Same mode guard; user-open list/photo reads unchanged; live totals NOT MEASURED |
| Receiving idle | Empty fallback 4→0 over simulated 60s; metadata 4→4; populated-ledger path retained |
| Receiving↔Expiry transition | Explicit Receiving authority entry preserved; Expiry wake no longer invokes extra Receiving refresh; live totals NOT MEASURED |
| Ten-minute Idle Sleep | Existing IDLE_MS=10*60*1000 and fetch guard unchanged; extra HH wake blocked; real 10-minute network capture NOT MEASURED |
| Refresh/resume | Existing authenticated resume path unchanged; Receiving wake allowed after resume; live totals NOT MEASURED |

Necessary paths retained: /rest/v1/rpc/get_pharmflow_active_order_manifest_meta_v1 (15s), /rest/v1/rpc/list_pharmflow_cloud_transactions_delta_v3 (3s after receiving activity, 15s idle when orders exist), /rest/v1/rpc/get_pharmflow_workspace_generation (60s), startup/foreground get_pharmflow_cloud_workspace and full manifest authority when needed. Auth /auth/v1/token and /auth/v1/user maintenance remains separate. Expiry capture/session list/photo requests remain business-triggered. No raw tokens or response contents recorded.

## Regression / exposure
Focused: 53 PASS / 0 FAIL. Full: 555 PASS / 43 FAIL / 1 SKIP versus 541 / 43 / 1; exactly the same 43 failing names. Build, syntax and diff checks pass. Tests exercise metadata discovering subsequently assigned orders, metadata failure fallback, forced bootstrap, transport retry, busy overlap, old pharmacy response isolation, sleep wake guard, Receiving entry, scanner queue/U0030 recovery and Expiry session behavior.
Production cloud-workspace.js exactly matches the Staging baseline source; Production hhRefreshWorkspaceAuthority is the same affected function even though the complete HH file differs. Thus source exposure is VERIFIED, live Production traffic is NOT MEASURED. No Production change was made.
Candidate READY FOR TEST; physical multi-PC / PC↔Handheld synchronization and measured live egress acceptance remain required. Existing native PostgreSQL concurrency skip remains unrelated. Rollback is a Staging-only source revert to the baseline; no data rollback required.
