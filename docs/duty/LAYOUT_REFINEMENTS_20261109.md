# Duty final layout correction — 9 November 2026

**READY FOR USER TEST.** Existing Draft PR #53 / `fix/duty-exchange-staging-20261109-v2` only. Starting source independently verified: `6be3bb2ba474c1bf24c821d50026b48e4931e5cb`; Production main `c68a940fecd9d40b57b625769e9a4654991b6010`. No competing PR or Production/backend/data change.

## Root causes established before editing

- Staff pagination used 12px gaps, conflicting old button padding/minimums and a later shared Month/Staff selector. Real Chromium measured **108.92 CSS px** for `1/2`; the same intrinsic sizing affects `1/1`.
- The Schedule control row was a wrapping flex container with ungrouped navigation and one entire max-content action group using `margin-left:auto`. Its wrapping threshold was the sum of all intrinsic widths, so the action group dropped as a unit. Existing generic button styles competed with pagination. The main module header also mixed a shared flex declaration with grid, fixed 240/420px tracks and viewport-based 1300/600 breakpoints that ignored the actual sidebar/content width.
- The KPI Grid already declared two columns, but an explicit **`@container (max-width:172px)` changed it to one column**. This exactly reproduced the owner's 67% versus 70–80% behavior on the secondary 1280×720 / OS 125% surface. Duplicate KPI-wrapper padding and shared cell/KPI number rules made sizing hard to reason about. Four one-column rows plus Total used **113px**; two columns used **67px**.
- Dropdown hover was barely different from the base row. The later selected/focus rules could replace the hovered row background, blurring mouse and keyboard/selection feedback. Pointer-following itself needs no JavaScript; the state cascade was responsible.

## Final component ownership

- `.duty-schedule-navigation` groups existing navigation only; action track is `minmax(0,1fr)` with `min-width:0`, controlled gaps and intrinsic button sizing. Pagination now owns its own 24px minimum-width arrow buttons, 3px gaps and `width:max-content`, measuring **73.61px** for `1/2`. Month-button sizing is separate.
- Header grid uses intrinsic month/action tracks and a flexible center. Relevant shared flex membership, redundant tab gap rule, fixed 240/420px tracks and fixed grid-row heights were removed. Component queries on `.duty-shell` use actual content width: module header rearranges below 920px; Schedule controls use two deliberate rows at ≤1040px. Very small headers use a two-by-two tab arrangement. No browser-zoom detection, negative margins, absolute positioning or resize timers were added.
- Today badge uses a stronger light-green background/border and two short internal text lines, **30px inside the existing 34px control row**. Its date logic, midnight/wake updater and day-row indicator are byte-unchanged. Increasing its emphasis never moves the toolbar bottom down.
- KPI wrapper/padding has one owner. Grid always has two equal tracks then full-width Total. Semantic label/value elements and container-relative text size keep values on one line within supported employee columns. Ordinary metric rows are 17px with 2px gaps. Total is **26px (previously 21px, +5px)**, dark corporate blue with bold 14px number; complete KPI section is **64px**, smaller than the old 67px two-column version. Four category colors/calculations remain unchanged. Cell-number styling was separated from header KPI styling; generic Total number styling is scoped to its other actual owner (auto summary).
- Dropdown rows have a subtle background/defined border, immediate full-row light-blue CSS hover and coordinated border. Selected rows have their own darker blue, left accent and check; selected+hover is explicit. Focus owns an outline without overriding pointer background. No dropdown JavaScript or keyboard behavior changed.

## Measured screen-space comparison

All values below are **CSS px**, with identical synthetic data, Arial, sidebar, top bar and desktop dimensions before/after. Grid data gain subtracts the sticky employee header from available internal grid height.

| Desktop surface | Zoom | Schedule controls before → after | KPI section before → after | Extra data area |
| --- | --- | --- | --- | --- |
| 1366×768 / 100% OS | 75% | 34 → 34 | 67 → 64 | +6 |
| 1366×768 / 100% OS | 80% | 34 → 34 | 67 → 64 | +6 |
| 1366×768 / 100% OS | 90% | 34 → 34 | 67 → 64 | +6 |
| 1280×720 / 125% OS | 75% | 75 → 34 | 113 → 64 | +93 |
| 1280×720 / 125% OS | 80% | 75 → 72 | 113 → 64 | +101 |
| 1280×720 / 125% OS | 90% | 75 → 72 | 113 → 64 | +65 |

At 1366×768, all **67/70/75/80/90/100%** cases use one 34px Schedule row and stable two-column KPIs. At 100%, data area also gains **93 CSS px** (old controls 75→34; sticky header 176→124). Grid cell dimensions and employee-column minimums are unchanged.

**Exact narrow-surface limitation:** 1280×720 with OS 125% at 80/90/100% has only about 1009/868/754 CSS px of Duty content. The complete action/navigation set cannot fit one row legibly, so the component uses two controlled rows (72px) with no overlap. KPIs stay two-column. Where content is below the unchanged 966px six-employee table minimum, horizontal scrolling stays inside the schedule, preserving all columns and readable cells; there is no page horizontal scroll. Six employees are fully visible wherever the existing width supports them. This is an explicit fallback, not an unreported zoom-specific overlap.

## Verification results

- **2 new Node tests PASS:** correct five KPI values/labels for every visible employee, preserved data, six-at-a-time pagination and saved order.
- **28 focused Duty/layout/UI/Exchange/Reports/export tests PASS.**
- Complete Duty + sleep/wake suite: **122 total / 120 PASS / 1 historical FAIL / 1 optional SKIP**.
- Relevant authentication/session/permission regressions: **42 PASS / 0 FAIL**.
- Existing real Chromium Exchange runner **PASS**, unchanged: single/double click, module/Reports/Positions navigation, async refresh, populated 5↔5, Ctrl+Drag, invalid shapes/overlap/third ranges, Undo/Redo, actual idle-resume guard and document reload.
- Existing real Chromium final-UI runner **PASS**, unchanged: local midnight/wake, month/custom exclusion, Friday/Holiday/OFF/Leave, 48-employee mouse/keyboard/scroll/outside/Escape/Tab, zero writes and unchanged data.
- New layout runner **PASS** at **67/70/75/80/90/100%** on both desktop/OS surfaces: computed two-row KPI geometry, full-width 26px Total, KPI text overflow checks, compact pagination, all enabled/disabled buttons non-overlapping, badge containment, page scroll, immediate consecutive mouse hover, selected/hover distinction, keyboard Escape and paging. Additional 1024px surface confirms coherent fallback/internal scroll. **0 writes / unchanged synthetic data / no page errors**.
- Real Chromium uses layout viewport + DPR for desktop zoom equivalence; captures are direct CDP WebP screenshots, without image edits. This is not a claim of manual Windows browser-menu acceptance. Before runs read the exact starting Git source; after runs read final source. Visual review completed.
- Default and allowlisted Staging Preview builds PASS; no dependencies, database schema/RPC/Edge Functions, calculations, save/auth logic or operational records changed.

Only historical failure: old `duty-release-isolation.test.cjs` protected-file snapshot at unchanged `js/app.js`, already independently established on main and the starting PR. Optional external-template fixture stays skipped. No existing failing test was modified, disabled or suppressed. Current final-head CI/Preview identity is pinned in PR #53; no whole-suite-green claim.

## Before / after evidence

| Zoom | 1366×768 Schedule | 1280×720 / OS 125% Schedule |
| --- | --- | --- |
| 75% | [Before](layout-20261109/before-schedule-75.webp) · [After](layout-20261109/after-schedule-75.webp) | [Before](layout-20261109/desktop-125/before-schedule-75.webp) · [After](layout-20261109/desktop-125/after-schedule-75.webp) |
| 80% | [Before](layout-20261109/before-schedule-80.webp) · [After](layout-20261109/after-schedule-80.webp) | [Before](layout-20261109/desktop-125/before-schedule-80.webp) · [After](layout-20261109/desktop-125/after-schedule-80.webp) |
| 90% | [Before](layout-20261109/before-schedule-90.webp) · [After](layout-20261109/after-schedule-90.webp) | [Before](layout-20261109/desktop-125/before-schedule-90.webp) · [After](layout-20261109/desktop-125/after-schedule-90.webp) |

Reports hover/selection at 80%: [Before](layout-20261109/before-reports-80.webp) · [After](layout-20261109/after-reports-80.webp).

Raw measurements for all six zooms: [primary before](layout-20261109/before-measurements.json), [primary after](layout-20261109/after-measurements.json), [OS 125% before](layout-20261109/desktop-125/before-measurements.json), [OS 125% after](layout-20261109/desktop-125/after-measurements.json).

## Exact changed files versus 6be3bb2

Application: `css/duty.css`, `js/duty-schedule.js` (markup only), `index.html` (two asset cache keys).

Tests: `tests/duty-layout.test.cjs`, `tests/duty-layout.browser.cjs`.

Documentation: `PHARMFLOW_CURRENT_CHECKPOINT.md`, `PHARMFLOW_CHANGELOG.md`, `PHARMFLOW_TEST_MATRIX.md`, `docs/duty/CURRENT_CHECKPOINT.md`, `docs/duty/LAYOUT_REFINEMENTS_20261109.md`.

Evidence: the 14 WebP captures and four JSON measurement files linked above under `docs/duty/layout-20261109/` (including `desktop-125/`). No other source files changed.

## Three short Product Owner checks

1. At 75/80/90%, check compact pagination, stronger Today badge, two-by-two KPI rows and prominent Total; compare available schedule area and scroll. Check 67/70/100% if used.
2. Exercise staff paging, a two-range Exchange, Undo/Redo and Refresh, preserving already accepted behavior.
3. In Reports move the pointer across consecutive employees: whole-row hover must follow immediately, selected employee stays distinct; check arrows/Escape, Copy and Excel.

Remaining: Product Owner visual acceptance on actual Windows Chrome. Keep **READY FOR USER TEST** and stop at Staging. Production release remains unauthorized.
