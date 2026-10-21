# Expiry Round 2 — verified recovery and blocked release

Date: 2026-10-13. Staging only. Branch: feature/expiry-stage1-visual-gate.
Recovered GitHub/local HEAD: 75489e63a48390a31d1700c0848ce6c8fbda3247.
Recovered READY deployment: dpl_FnuL6LUBpv2fGPSxeQapxQzr4jMV, project pharmflow-test.
Staging URL: https://pharmflow-test-git-feature-expiry-stage1-115007-fhyh2xtskz-3504.vercel.app/
Staging Supabase: tovkcakucyagvbzvlnks. Production main and Production Supabase untouched.
Initial tracked worktree was clean; untracked supabase/.temp/ preserved. This checkpoint is local only; no Round 2 push/deployment.

## Saved implementation

Two top-level tabs, Scan & Activity default and Expiry Inventory; Review outside tabs with existing authoritative count. Scoped canonical CSS changes, Items Recorded / Total Units summary, real check/warning/error indicators. Session presentation groups only authoritative canonical state IDs within the signed current session, excludes explicit foreign scopes, retains serial/raw captures internally and removes serial column/modal. Unresolved state IDs remain separate rather than inferred. Inventory operations, four KPIs, selection/export/filter/resolve and Handheld behavior preserved.

Group Edit/Delete dialogs are scope/quantity previews with disabled writes. This is a partial implementation, NOT completed grouped correction. Existing durable individual-operation retry recovery remains available. No unsafe sequential multi-operation calls or inventory-total overwrite.

## Root cause and required separately approved backend dependency

Live Staging correction RPCs accept one operation ID. correct_pharmflow_expiry_desktop_session_v1 locks/revises one capture and adjusts its contribution, with per-request idempotence and tenant/session/owner checks. It cannot atomically validate complete displayed group membership. Even a one-member group can gain another capture before correction. Therefore all new grouped writes remain blocked.

Proposed contract, not SQL and not applied: one atomic group-correction RPC accepts pharmacy/session/request ID, authoritative canonical state key, expected complete member operation IDs with revisions, and desired current-session group total (zero for delete). Authenticate signed owner; validate every member belongs to this session/owner/pharmacy and canonical group; acquire canonical and capture locks; re-read COMPLETE membership and reject changed membership/revisions or external recount; compute delta from current-session contributions only; change those contributions with deterministic allocation and an immutable audit trail; preserve original raw payload/serials and older sessions; perform all changes in one transaction; persist one idempotent request/result so retries do not double apply. Reject cross-scope, stale and ambiguous groups. Existing single-operation API remains compatible. No historical inventory migration/backfill is needed; any new RPC/ledger support requires separate Product Owner approval before implementation/application.

Required group acceptance after approval: historical 5 + session 2 = 7; group edit to 4 = 9; group delete = 5; multi-member groups; retry; simultaneous correction/capture; added/removed members; stale revisions; foreign session/owner/pharmacy; external recount; all-or-nothing failure; original serial and audit preservation. The current single-capture regression does not establish these group guarantees.

## Verification matrix

| Check | Result |
|---|---|
| Focused 9-file suite | 157 pass, 0 fail, 1 existing independent concurrency skip |
| Recovered baseline full suite | 601 pass, 44 fail, 1 skip |
| Current full suite | 606 pass, 43 fail, 1 skip |
| New full-suite failure names | None; premature first-character lookup baseline failure no longer fails |
| VERCEL=1 npm run build | PASS; existing classic-script bundling warnings remain |
| Single-capture historical quantity 5→7→9→5, retries, original serial/history | PASS in local PGlite only |
| Group preview performs no mutation; state separation / scope / tabs | PASS automated |
| Actual 1366×768, approximately1366×900, larger visual inspection | UNVERIFIED |
| Round 2 Staging deployment | NOT DEPLOYED |
| Live grouped mutation / concurrency acceptance | BLOCKED; missing atomic RPC |

Authentication handoff timed out without an authenticated result. One fresh Staging tab still showed login. No password inference or repeated credential submission. No Round 2 screenshots exist and no geometric calculation counts as visual verification. Complete secure Staging sign-in, then actual browser acceptance at requested dimensions before releasing this candidate.

## Applied migrations recovered, not reapplied

Read-only list_migrations returned 29 existing Staging migrations. Latest: 20261013015700 expiry_desktop_receipt_operator_and_readonly; preceded by 20261013012928 expiry_inventory_query_validation and 20261013012115 expiry_desktop_inventory_release. Existing session correction foundation: 20261011212352 expiry_active_session_history_and_corrections_v1. No migration was applied during this recovery/round. Do not reapply these or infer a grouped correction RPC from them.

## Exact next steps

Resume this local checkpoint without resetting saved changes. Complete secure Staging login and rendered verification. Review/approve the concrete atomic group contract separately; implement/test it only after approval and only against Staging. Then enable group mutations and run complete group acceptance plus focused regressions. Commit/push only this feature branch and deploy only pharmflow-test after gates. Year→months filtering remains deferred. Production promotion is not authorized.
