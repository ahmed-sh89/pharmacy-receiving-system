# Controlled group RPC Staging execution — 2026-10-14 Riyadh

Status: READY FOR USER TEST — grouped actions remain DISABLED; concurrency gate BLOCKED. Not a completed grouped Edit/Delete release.

Applied migration: 20261013234424_expiry_desktop_current_session_group_correction_v1.
Verified project: tovkcakucyagvbzvlnks / pharmflow-staging / ACTIVE_HEALTHY / PostgreSQL17.
Exact package SQL equals preserved repository SQL; SHA256 d3b800712008e405ad0b0a68764f57a128886cf51602d36182add7fa51f5cb1f.
The original artifact retains its REVIEW ONLY header as immutable review evidence; this record supersedes its applied-status comment.

Pre-application gates passed: new audit table/new function absent before application; additive CREATE only, no existing RPC replacement or business-data backfill. Explicit signed auth-session, pharmacy membership/owner scope and private audit path reviewed against live dependencies. No Production access. Safe disablement is possible by revoking authenticated EXECUTE on the new function; retain all audit records. No disablement SQL was executed.

Installed function hash29b402465098598f9290c23e0c590264. SECURITY DEFINER with search_path=pg_catalog; anon execute=false, authenticated=true. Audit RLS=true, authenticated direct table access=false, group audit rows0. Live missing-auth-session smoke test rejected and rolled back. Security advisor notes expected authenticated definer API / private RLS without policies; unrelated existing advisories were not modified.

Before/after live reconciliation: Inventory39 rows/100 units; session captures34 rows/56 units; operations97; events103; single-adjustments10. All unchanged. No group corrections or synthetic business-data writes were committed.

Actual concurrency availability probe used two tool calls launched together, each reporting a different PostgreSQL backend. A PID576986 ran23:43:01.495968–23:43:04.499021UTC; B PID576987 ran23:43:06.822531–23:43:09.823293UTC. Intervals DO NOT overlap. This access path is insufficient for actual concurrency verification. No psql/postgres/initdb executable or configured PHARMFLOW_LOCAL_PG_URL/direct disposable connection is available. Different PIDs alone are not concurrent proof. Simultaneous edits, new scan/correction race, simultaneous retry, cross-device totals and interruption retry therefore remain NOT RUN, not PASS.

Focused local database suite34PASS/0FAIL/1SKIP; local sequential cases verify historical5+current2=7, edit current4=>9, delete=>5, capturedSerial preservation, retries/conflicts, stale members, scope and all-or-none rollback. These are NOT a substitute for independent-connection tests. UI group-disabled suite9PASS/0FAIL. BuildPASS.

No frontend source changed; existing Inventory Edit/Delete remains unchanged. No group UI integration, refresh/multi-PC acceptance or live5+2 functional claim. No new Preview deployment warranted while the mandatory gate is blocked. Current verified READY Preview SHA a9550c8b23fe8dd52fd08827b374836e970b46e1 remains deployed:
https://pharmflow-test-git-feature-expiry-stage1-115007-fhyh2xtskz-3504.vercel.app/

Changed repository files: this execution record and PHARMFLOW_CURRENT_CHECKPOINT.md only; local documentation commit retained. Applied SQL tracked by Supabase migration history. No code/reset/force-push/Production changes.

Remaining exact blocker: independent simultaneous SQL/RPC connections to an isolated test scope in Staging. A configured authorized Staging PostgreSQL connection or equivalent independent authenticated test transport is required. Credentials must be provisioned securely, never pasted into chat. Existing authorization is sufficient once that transport is available; do not reapply this migration. Enable group UI only after the required concurrent tests succeed.
