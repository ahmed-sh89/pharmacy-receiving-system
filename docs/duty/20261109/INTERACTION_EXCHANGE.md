# Duty interaction and Exchange — 9 November 2026

Status: READY FOR TEST; Preview delivery and Product Owner verification pending. Staging only.
Production base verified before work: `c68a940fecd9d40b57b625769e9a4654991b6010`.
Branch: `fix/duty-exchange-staging-20261109`. Staging DB: `tovkcakucyagvbzvlnks`.

## Verified cause and fix

Classification: local Schedule lifecycle state / rendering. `route:changed` unconditionally called `DutySchedule.clear()`, resetting the internal month to an empty string while keeping the rendered grid. `load()` skipped mounting when the returned JSON matched the cached JSON. Thus the visible dates were inconsistent with the editor's writable-date gate; range selection could also fail date parsing. Positions/Reports return forced a mount and restored the month. Hard Refresh discarded the cached comparison and also restored it.

The new regression failed on original source at the missing editor assertion and passes after the fix. Entering Duty now checks that the visible schedule host is mounted for the current month and remounts when invalidated. A repeated activation of an already mounted page preserves its grid, scroll and selection. There is no timeout, extra polling, or additional event listener. Existing property-based delegated handlers remain single-owner. No overlay, authentication or Session Paused source was changed: these were traced as possible triggers/recovery paths, not established causes of the lifecycle defect. Owner reproduction of the reported full freeze and actual idle Reload remains an acceptance gate.

Write readiness also checks current permission, loaded state and matching identity scope, including the interval before an identity-reset event is delivered. The genuine editor, pending save and confirmation guards remain intact.

## Selection and Exchange

The selected-cell union remains available to Copy/Paste, Apply Shift, deletion and colors. Explicit ranges retain their separate boundaries. Ctrl (or Meta) + Drag appends a rectangle; plain drag replaces it; Ctrl-click cell toggling is retained. Range B uses a subtle violet selection tone/border while Friday/Holiday/leave backgrounds remain visible. A third range remains selected, disables Exchange and displays `Select two equal ranges to exchange shifts.` No arbitrary pair is chosen.

Exchange requires exactly two non-overlapping, equal-width/equal-height rectangles in the visible schedule, all destinations writable. Pair order is date ascending, then displayed employee order. Both sources are captured before mutation. Only payloads move: periods/split/overnight, status, notes, color and manual allocation. Employee IDs, dates and official roster do not move.

Auto payloads use existing clipboard normalization to drop the source Basic limit; destination employee/default/rule/date classification remains authoritative. Holiday precedes Friday, and overnight hours belong to the starting date. Manual allocations reuse the approved clipboard rule: preserve explicit values and materialize any implicit source categories before moving, so a partial Manual allocation keeps its source total rather than acquiring destination Auto categories. No ambiguous manual/automatic metadata was found: `manual_minutes` is explicit. The calculation model and SQL calculators are unchanged.

## Atomic persistence and conflicts

No new migration, RPC or backend deployment. Read-only inspection of actual Staging `save_pharmflow_duty_schedule_v2`, `save_pharmflow_duty_entries_v1` and the private authorization predicate confirmed the existing contract.

One Exchange calls `save_pharmflow_duty_schedule_v2` once with both sides and expected revisions for every destination. It invokes the existing batch writer and authoritative reader in one PostgreSQL transaction. The writer validates pharmacy/admin authorization and completed months, acquires the existing pharmacy advisory transaction lock, checks each row revision, records audits and validates the final schedule including adjacent overnight overlap. Any exception rolls back both sides and audits. The same lock serializes other Duty writes. A busy flag blocks duplicate/overlapping submissions from this client. A lost response is reported as unconfirmed, with no automatic resubmission; a later stale retry is revision-rejected.

The complete batch creates one history frame. Undo/Redo use a single batch and tracked revisions, not revisions silently replaced by a later remote refresh. A competing writer therefore causes a conflict instead of being overwritten.

## Actual verification

- Focused: 10 real-component DOM tests + 1 PostgreSQL-engine database test + 1 exact Preview build/fence test PASS.
- Complete Duty suite: 100 tests: 98 PASS, 1 historical FAIL, 1 SKIP. The failure is the unchanged `duty-release-isolation` byte snapshot at `js/app.js`; reproduced independently on original main. The skipped actual external worksheet-template test lacks its input file; export/XLSX structural tests pass.
- Authentication/session/permission/navigation regressions: 90 PASS, 0 FAIL (7 existing test files).
- Separate old `startup-performance.test.cjs`: FAIL at the literal empty-device bootstrap assertion on BOTH original main and this candidate. No change to its runtime files or checks.
- Existing startup build fence test: PASS for Production/local, approved startup Preview and rejection of arbitrary refs. Duty Preview fence: PASS for the exact new branch, Staging URL/key/CSP/version, no startup timing script and exact execution/preload URL parity.
- Database test uses isolated PGlite PostgreSQL with the eight original Duty migrations: successful single/five-cell swaps, empty/OFF/leave, notes, split/overnight, destination Holiday/Manual projection, identity, stale second-side rollback including audits, final-overlap rollback, competing stale-client rejection, durable read, batch Undo/Redo, foreign pharmacy and staff/session denial. No remote operational records were edited.
- Simultaneous separate live browser sessions and physical Chrome zoom/idle overlay were not established by DOM or single-engine tests; these remain explicit owner checks. No blanket full-suite or live multi-PC PASS claim.

## Changed components and risks

`js/duty.js`: lifecycle and current-scope readiness. `js/duty-schedule.js`: ranges, Exchange and existing save/history integration. `css/duty.css`: Range B only. `index.html`: matching cache versions for changed Duty assets/preloads. `vite.config.js`: exact-branch Staging exception using the existing Preview configuration path; no timing diagnostics on this branch. Three new focused test files, the existing build-identity test updated for supported exact refs, and project documentation.

Primary regression risks are selection interoperability, lifecycle readiness and stale-client history. Focused checks plus existing Duty/report/export/calculation and auth suites exercise these. Receiving, Orders, Expiry, Handheld, Global GTIN, permissions/backend implementations, package dependencies, Production build target and deployment workflows are unchanged.

## Product Owner acceptance (Staging only)

1. Open the exact Preview from the Draft PR. In Duty, single-click then double-click a cell. Cancel. Repeat after module navigation, Reports/Positions roundtrips, F5, and the real Session Paused Reload. Never require an extra tab switch.
2. Select one cell, Ctrl-click a second, Exchange. Verify both contents, notes and any split shift; Refresh to verify persistence.
3. Drag five cells, hold Ctrl and drag five elsewhere. Verify both selections, blue/violet distinction and enabled compact Exchange. Swap; Undo once; Redo once.
4. Exchange Auto ordinary/Friday/Holiday dates and a Manual allocation. Verify destination Auto categories, Holiday precedence, overnight starting date and unchanged Manual allocation.
5. Add a third range, try unequal/overlapping ranges: Exchange stays disabled, short instruction, no data change. Plain drag replaces the selection. Check Copy/Paste and Apply Shift.
6. On two Staging PCs, select the same cells. Save on PC1, then exchange/Undo from stale PC2. Confirm conflict and no partial swap/no overwrite; Refresh PC2.
7. At Chrome 75%, 80% and 100%, check both selected range boundaries, internal scrolling and the unchanged toolbar/layout. Check Labor + Beauty, month/custom range, Reports and Excel.

Do not promote/merge. Final acceptance remains Product Owner verification.
