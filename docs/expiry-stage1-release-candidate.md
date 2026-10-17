# Expiry Stage 1 release candidate — 13 October 2026

Branch: feature/expiry-stage1-visual-gate. Parent: 1ce1ad9f03013c40bf5145eb3e245aaf9c81a0bf.
Staging: Supabase tovkcakucyagvbzvlnks; Vercel pharmflow-test. Production remains untouched.

| Requirement | Implemented behavior | Evidence |
|---|---|---|
| R1 Design | Consolidated canonical desktop table/KPI styles, application dialogs and toolbar menus | DOM/capture/dropdown tests |
| R2 Scan | Compact existing capture geometry and draft retention; Inventory hides capture | View-switch draft tests |
| R3 Session KPIs | Five clickable cards from employee's successful signed-session receipts; Last Scanned saved detail/timestamp | SQL session authority and DOM details |
| R4 Session table | Five columns, exact identifiers, batch/date, own quantity, saved timestamp and operation Edit/Delete | Correction/delete/scanner tests |
| R5 Inventory | Independent scanner-free full-width workspace and pager | DOM view isolation |
| R6 Period KPIs | Current Riyadh month is Expired; Next 1/2/6 months overlap and show ranges | SQL/DOM month tests |
| R7 Server queries | Search, department/month intersections, count/units and 50-row pages | 55-row SQL pagination and combined filters |
| R8 Table | Compact product/identification, batch, date, quantity, status, two-line updated date/time | Cell alignment; live gate below |
| R9 Aggregation | Existing canonical product + normalized batch + month/year unique key; serial not a key | Existing exact-identifier/aggregation SQL |
| R10 Quantity | Versioned total replacement; zero retains ACTIVE | Zero/stale/idempotency SQL and DOM |
| R11 Resolve/Restore | Retained snapshots; exact all-page preview; stale/version/item locks; request idempotency; isolated restore | SQL bulk rollback, duplicate, new capture after resolve and restore |
| R12 Shelf outputs | Same authoritative export filters; all matching pages; six columns, text codes, earliest expiry and A4 repeat headers | SQL parity and workbook/print DOM |
| R13 Sync/isolation | Same-scope reads coalesce; scope races rejected; active visible/awake Expiry polls every 30s | Signed-session/pharmacy denies, DOM race/polling and existing regressions |

## Database

Applied additive migrations 20261013012115_expiry_desktop_inventory_release and 20261013012928_expiry_inventory_query_validation. Two private RLS tables deny direct client access; eight public RPCs require signed authentication and membership, with anon EXECUTE revoked. Private query helpers cannot be called by clients. Original capture/Handheld/Receiving/auth/review function definitions remain unchanged.

Migration fingerprints matched exactly before/after: state 31; events 64; operations 78; reviews 14. No historical rewrite/backfill. Pre-release Desktop captures lacking signed-session association remain persisted in Inventory/audit and are not assigned speculative session membership. Acceptance starts with fresh Sign In.

Resolve retains a snapshot and records CLEARED through the existing event model. New captures use the existing locked additive path and start at zero. Restore adds only selected retained quantities; externally changed original identity is rejected. Quantity replacement records RECOUNT while retaining ACTIVE at zero. Session Edit/Delete targets the employee's own registration; external recounts/resolution trigger the existing read-only guard.

## Automated gate

Focused 69 PASS / 0 FAIL / 1 SKIP; SQL 32 PASS / 0 FAIL / 1 SKIP. Full suite 593 PASS / 43 FAIL / 1 SKIP; all 43 failure names exist at the parent. This is not a clean full-suite PASS. Preview build, syntax and diff checks pass. Native independent PostgreSQL concurrency is NOT RUN: no native server is installed; serialized locks/stale revisions/idempotency are tested in PGlite.

Live browser visual/operational gate completed on runtime 822a7b8b552a9a9dc6c5b55dd7df4100b2537439 at the verified branch alias. Five session/four Inventory cards share a row at 1363×936; no document horizontal overflow. Compact rows, saved operator, separate batch/expiry and two-line Last Updated inspected. Successful GS1 QA-RC-RECOVERY save updated metrics and Last Scanned details; aggregate zero remained ACTIVE; exact filtered Resolve/Restore retained quantity 1. Downloaded Excel has six shelf columns, one matching row and text item code; print DOM matches. Receiving/Settings navigation works. Physical Windows multi-PC/Handheld and Office/A4 output acceptance remain Product Owner gates. Synthetic Staging Global Master shows UNAVAILABLE; this run does not claim that separate baseline limitation was repaired.

Recovery: 8bf4615 was both GitHub and READY deployment HEAD; local refinements were preserved and finished. Migration 20261013015700_expiry_desktop_receipt_operator_and_readonly was already applied, so was committed without reapplication. Audit proves earlier QA-RC-20261013-A Restore had already completed (2 retained + 1 new = 3 active); no repeat performed. New account reset now clears page and sorting; loading counters and stable unchanged polling preserve focus. Final focused 95 PASS / 0 FAIL / 1 SKIP; full 597 PASS / 43 inherited FAIL / 1 SKIP, no new failure names. Preview build/syntax/diff PASS. Native independent lock concurrency remains NOT RUN. No auth configuration changed.

## Rollback and acceptance

Restore the preceding Staging preview if a gate fails; retain additive tables/RPCs and audit history. No destructive schema/data rollback.

1. Fresh Sign In; save two known items; check five cards/details and draft retention across views.
2. Check Active Item/Save & Next, Session Activity Edit/Delete and exact identifiers.
3. Check current-month Expired and future ranges; combine search, department and multiple months.
4. Set quantity zero, Resolve, add a new capture with same key, Restore only retained quantity.
5. Select all matching pages; verify records/units before Resolve/Restore.
6. Check Excel/A4, Refresh, second Windows PC and Handheld/Receiving spot checks.

Status: READY FOR TEST; not USER VERIFIED or DONE. Production untouched.
