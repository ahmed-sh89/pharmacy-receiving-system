# Duty interaction and Exchange — 9 November 2026

Status: **STAGING READY FOR USER TEST**. No Product Owner acceptance yet. Staging only; no Production merge/deploy/database/Edge Function/operational write.

## Verified baseline and root cause

Production main verified through Git and GitHub: `c68a940fecd9d40b57b625769e9a4654991b6010`. Dedicated branch: `fix/duty-exchange-staging-20261109-v2`.

Classification: local scheduler lifecycle/state synchronization. `route:changed` called `DutySchedule.clear()` (resetting the internal month, selection and gesture state) while retaining the already-rendered grid. The controller retained its authoritative data; an identical subsequent read did not mount/render because `changed` was false. The visible cells therefore used a cleared scheduler, including an empty active-month edit guard. Switching Duty tabs always mounts, explaining recovery. A new real-component test failed at editor opening on unchanged-data re-entry before the fix and passes afterward. This proves a specific incident mechanism; it does not assert every possible intermittent symptom has the same cause.

Fix: distinguish a live mounted scheduler from a cleared/detached one. Re-entering mounts the cleared scheduler before loading, independently of data equality; redundant activation preserves the live grid/scroll/selection and existing handlers. DOM rerenders cancel active gesture animation/state. Handlers remain single assigned delegated properties, with no new global handlers or timers. Existing editor/loading/month/permission guards remain; controller save also checks active identity, write permission and data readiness. Real Session Paused guard is unchanged.

## Exchange and selection architecture

- Compact Exchange beside Apply Shift; tooltip “Exchange selected shifts”. Exactly two explicit rectangular gesture ranges, matching width and height, disjoint destinations and current editability required. Invalid/third ranges do not write: “Select two equal ranges to exchange shifts.”
- Normal drag replaces selection. Ctrl+Drag snapshots the existing ranges and extends only the added rectangle. Ctrl-click/exclusion and row selection remain supported. Range B has subtle violet styling; Friday/Holiday/leave backgrounds are retained. No hover popups or toolbar redesign.
- Correspondence is visible employee-column order, then ascending date within each column. Both payloads are snapshotted before one save. Employee IDs, dates and destination revision tokens remain fixed. Split/overnight periods, OFF/leave, notes, color and explicit `manual_minutes` keys move together. No automatic value is converted into a manual override.
- Existing `save_pharmflow_duty_schedule_v2` performs `save_pharmflow_duty_entries_v1` and the authoritative read in one PostgreSQL RPC transaction. The Staging-deployed function bodies were inspected read-only: permission/password/session boundary via private `allowed`, pharmacy advisory transaction lock, per-cell expected revisions, duplicate destination validation, completed-month protection, final-batch overlap validation and audited writes. One error rolls back both sides plus audits/month creation. No schema or RPC migration is required or applied.
- One Exchange uses existing one-frame Undo/Redo. Busy guard rejects duplicate local submissions. Stale client/Undo/Redo revision conflicts reject the complete batch, preserving newer changes. Server exceptions roll back atomically. A transport failure after a possible commit is reported as “Save not confirmed”, never falsely labeled rollback; refresh resolves uncertain acknowledgement.
- Automatic hours use destination date, employee defaults/current pharmacy rules: ordinary Basic/Normal OT, all Friday OT, Holiday before Friday, overnight attributed to start date. Explicit manual category keys stay explicit, including partial/zero overrides; untouched automatic categories continue projecting under existing rules.

## Actual verification

| Check | Result / boundary |
| --- | --- |
| New component + actual SQL engine tests | 6 PASS (included in Duty count below) |
| All Duty + sleep/wake permission tests | 116 total: **114 PASS / 1 FAIL / 1 optional SKIP** |
| Related auth/session/persistence/navigation tests | 62 total: **61 PASS / 1 FAIL** |
| Focused security/Receiving release checks | **66 PASS / 0 FAIL** |
| Chromium offline real-pointer integration | PASS: initial readiness, repeated module re-entry with identical reads, Reports/Positions, asynchronous data change, single/double-click, 5↔5 and multi-column rectangles, invalid shape/overlap/third range, normal replacement, one-request Exchange, Undo/Redo, actual idle guard/resume button, document reload with retained mock server fixture; no page errors |
| Display scaling | Chromium CSS zoom 100%, 80%, 75% PASS. Native Windows Chrome zoom is owner acceptance, not claimed identical |
| SQL engine integration | Actual migration SQL in isolated PGlite: Friday/Holiday/manual/split/overnight, empty/leave/OFF, authoritative reread, stale-client rejection, Undo/Redo, permissions, cross-pharmacy denial, second-side conflict and final-overlap rollback including audit rows PASS |
| Concurrency scope | Stale-client CAS and lock definition verified. No live simultaneous two-PC hosted write test performed |
| Default build | PASS; unchanged Production backend configuration retained, no deploy |
| Allowlisted Duty Preview build | PASS; entry/config/client use only `tovkcakucyagvbzvlnks`, no Production ref or startup diagnostics in those active files |

Historical failures independently reproduced on untouched baseline `c68a940` using the same two tests: `duty-release-isolation.test.cjs` old 81-file byte snapshot (first mismatch `js/app.js`), and `high-priority-persistence.test.cjs` old Receiving CSS expectation `#87b9e2`. The optional actual online template acceptance fixture remains skipped. No test was disabled, changed to conceal a failure, or reclassified as passing. The initial pre-build run also lacked dist; after building that environmental failure passed. An interim lifecycle implementation replaced the grid on redundant activation; the existing grid-identity regression caught it and the final mounted-state solution passes. Full historical suite not claimed green.

Browser package was obtained temporarily outside repository because the runtime's standard Playwright browser download was unavailable. No package/lockfile change. Extra standalone sleep-wake-session browser runner could not launch its single-process GPU configuration; no PASS claimed for that extra runner. The new Duty runner successfully exercised the actual idle guard/resume code; focused existing sleep/wake unit regressions passed.

## Changed files

Application: `js/duty.js`, `js/duty-schedule.js`, `css/duty.css`. Entry cache versions: `index.html` (only changed Duty assets). Preview-only allowlist: `vite.config.js` (exact branch, existing startup preview retained, default/Pages configuration unchanged). Tests: `tests/duty-exchange.test.cjs`, `tests/duty-exchange-database.test.cjs`, `tests/duty-exchange.browser.cjs`. Documentation: current checkpoint, changelog, test matrix, this report, Duty checkpoint.

No Receiving/Orders/Expiry/Handheld/Global GTIN/authentication runtime, SQL, production settings, dependencies, employee roster or operational records changed.

## Product Owner acceptance — Staging synthetic/test schedules only

1. Open Duty immediately after sign-in; single-click an empty cell, double-click and cancel. Repeat after Receiving→Duty, Reports→Schedule, Positions→Schedule, F5 and Session Paused Resume. No recovery navigation should be necessary.
2. Give two test employees different shifts with notes. Select first cell, Ctrl-click second, Exchange: both shift payloads swap. Refresh; both remain swapped. Undo once restores both; Redo once swaps both again.
3. Drag five dates for employee A. Hold Ctrl and drag five non-adjacent dates for B, release, Exchange. Verify corresponding dates in both directions. Repeat with equally shaped multi-column ranges.
4. Try different sizes, same-count different shapes, overlap and a third range. Exchange stays disabled; no schedule values change. Normal drag resets selection. Check at native Chrome 75%, 80%, 100%, including internal scroll.
5. Check ordinary→Friday and Friday→Holiday destinations, an overnight/split shift, OFF/leave↔working and empty↔populated. Automatic categories follow destination rules; explicit Manual numbers and notes remain unchanged.
6. Confirm Copy/Paste, Apply Shift, grouped roster/order/pagination, month/range, Reports and Excel remain as accepted. On a second Staging PC change one selected cell before Exchange/Undo: whole stale operation must conflict; neither side overwrites the newer value. Refresh both PCs to verify.

Deployment/PR evidence is recorded in the current checkpoint and PR after publishing. Stop after Staging delivery; retain this status until actual owner verification.
