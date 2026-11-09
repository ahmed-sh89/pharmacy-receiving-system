# Duty final grid separators — 9 November 2026

**READY FOR USER TEST.** Existing Draft PR #53 only, branch `fix/duty-exchange-staging-20261109-v2`. Verified starting HEAD `c47a9c05339875bc2a4efbbcef23181a98994358`; verified Production main `c68a940fecd9d40b57b625769e9a4654991b6010`, unchanged. Final source/deployment identity pinned in PR #53.

## Accepted baseline and scope

Product Owner explicitly reports USER VERIFIED PASS for interaction, Exchange, Ctrl+Drag, adjacent range separation, Today indicator/badge, toolbar/paging, two-row KPIs/Total and Reports filter. Preserve these. Calendar Settings behavior is accepted unchanged: saved Public Holiday configuration is reversed through Calendar Settings and Save, rather than Schedule Undo.

UI/CSS defect only. No database, RPC, transactions, calculations, authorization, operational records or calendar behavior changes.

## Root cause and correction

The owning vertical-grid border rule used the same pale `#b9cde0` for both axes; a later employee-column nth-child override changed the right edge to similarly pale `#bacbdd`. Consolidate the owner to a clearer navy-blue vertical `#91abc4` and lighter daily horizontal `#cbd9e6`; remove that redundant nth-child override. Keep both border widths **1px**. No margins/gaps, padding, width or height changes. Existing stronger Friday boundary and all background rules remain untouched. Existing 2px selected-cell pseudo outlines and independent range colors remain untouched.

Only application files changed: `css/duty.css` and its cache key in `index.html`. Added `tests/duty-grid-separators.browser.cjs`, this report, root and Duty checkpoints, changelog/test matrix, and 11 evidence files in `docs/duty/grid-separators-20261109/`.

## Actual verification

- Default and branch-allowlisted Staging Preview builds PASS.
- Full Duty plus sleep/wake: **122 tests / 120 PASS / 1 historical FAIL / 1 optional SKIP**. Historical protected-file snapshot fails at unchanged `js/app.js` (expected f089b6ac, actual 673a367e); optional external-template fixture skipped. No failing check altered or suppressed.
- Relevant auth/request-timeout/session/viewport/security-boundary/sleep-wake: **63 PASS**.
- Existing Exchange Chromium runner PASS unchanged: click/double-click, Reports/Positions navigation, async refresh, Ctrl+Drag five-cell and rectangular ranges, third/mismatch/overlap validation, single-request Exchange, Undo/Redo, Session Paused/resume, reload with retained synthetic server data, no page errors.
- Existing Today/Reports Chromium runner PASS unchanged: adjacent ranges, Riyadh midnight, month/custom-range exclusion, Friday/Holiday, dropdown mouse/keyboard/scroll/outside/Escape/Tab, copy/export enabled paths, zero writes/page errors.
- New Chromium before/after regression PASS at **75/80/90/100%**, identical practical 1366×768 surface using Chromium viewport/DPR browser-zoom rendering. Before uses exact c47a9c0 source. Asserts exact equality of all 180 cell rectangles, grid/table/header/KPI geometry, scrolling widths and Friday/Today/Leave/OFF/Holiday backgrounds; 1px widths unchanged, no page horizontal overflow. Header **124px unchanged at every zoom**. Six visible employee columns unchanged.
- Actual adjacent three-cell Ctrl+Drag ranges remain separately outlined, double-click editor works, Reports employee filter/Clear and copy/export eligibility work. **0 write RPCs**, synthetic data unchanged, no page errors. Transaction/conflict behavior is covered by retained Duty tests; no real operational exchange/write was performed.

Browser evidence is actual Chromium with synthetic data, not an authenticated operational test or a claim of manual Windows Chrome acceptance. Owner visual acceptance remains pending.

## Before/after evidence

| Zoom | Before | After |
|---|---|---|
|75%|[Before](grid-separators-20261109/before-75.webp)|[After](grid-separators-20261109/after-75.webp)|
|80%|[Before](grid-separators-20261109/before-80.webp)|[After](grid-separators-20261109/after-80.webp)|
|90%|[Before](grid-separators-20261109/before-90.webp)|[After](grid-separators-20261109/after-90.webp)|
|100%|[Before](grid-separators-20261109/before-100.webp)|[After](grid-separators-20261109/after-100.webp)|

[Adjacent selected ranges](grid-separators-20261109/after-selected-80.webp). Raw exact-geometry/background measurements: [before](grid-separators-20261109/before-measurements.json), [after](grid-separators-20261109/after-measurements.json).

Reproduce after: `TC26_CHROMIUM_EXECUTABLE=/path/to/chromium DUTY_GRID_EVIDENCE_DIR=docs/duty/grid-separators-20261109 node tests/duty-grid-separators.browser.cjs`. Add `GRID_PHASE=before` to regenerate the baseline first.

## Product Owner acceptance

1. At 75/80/90/100%, inspect normal, Friday, Holiday, Today, OFF and Leave cells: clear vertical edges, lighter daily edges, same visible rows and internal scrolling.
2. Select adjacent equal ranges using Ctrl+Drag; verify independent outlines, Exchange, Undo and Redo using Staging test cells.
3. Double-click a cell, then open Duty Reports and return: editor, filter, employee KPIs and compact toolbar remain unchanged.

Stop at Staging. After acceptance, next task is a separately requested read-only Production release readiness review; no Production release authorization is implied.
