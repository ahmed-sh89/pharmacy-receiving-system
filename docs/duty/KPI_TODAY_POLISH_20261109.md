# Duty KPI and Today polish — 9 November 2026

READY FOR USER TEST. PR #53 only; starting verified HEAD d97d60417f53659d34782953a67c48c3b2a542db. Production main c68a940fecd9d40b57b625769e9a4654991b6010 unchanged. Final tested SHA/READY Staging Preview identity pinned in PR #53.

## Root cause and exact changes

Existing KPI flex centering grouped label and number with only a 2px gap, so spacing varied and the Total number was offset by the label width. Owning rules now use two grid tracks for category label/value, a 4px gap, compact numeric padding and container-sized 9–10px text. Total uses symmetric outer tracks around its intrinsic number: the number is centered independently, label right-aligned in the preceding track with a 6px gap. Bold label and 14px bold number retained; Total height remains 26px. No new KPI rows or column sizes.

Today markup explicitly rendered a second weekday row. Removed that row and its obsolete CSS/update; single-line `Today · 9 Nov`, 12px/800 weight, same green colors/accent. Existing Saudi date/midnight/focus update and schedule-day highlighting untouched. No new timers, positioning hacks, offsets or additional override layers. Cache keys updated together for schedule preload/script and stylesheet.

Application changes: css/duty.css, js/duty-schedule.js (display markup/text only), index.html (cache keys). Added tests/duty-kpi-today.browser.cjs; existing Today unit/browser assertions updated to require exact weekday-free text, preserving midnight/interaction assertions. Checkpoints/changelog/test matrix and this report updated, with 11 synthetic evidence files in docs/duty/kpi-today-20261109/.

## Verification

24 focused KPI/Today/Exchange/Reports/export tests PASS. Existing Exchange/interaction Chromium and Today/Reports Chromium runners PASS. New actual Chromium before/after at 75/80/90/100% PASS: text-range gap ≥3.9px, numeric Total center error ≤0.1px, Total 26px, one-line Today; all 180 cell/grid/header/KPI rectangles and special-day backgrounds exactly equal starting HEAD. Header remains 124px; no overflow, zero writes/page errors, synthetic records unchanged. Uses practical 1366×768 surface with viewport/DPR zoom rendering; owner Windows visual acceptance remains pending.

Full Duty/sleep-wake suite: 122 total / 120 PASS / 1 historical protected-file snapshot FAIL at unchanged js/app.js / 1 optional external-template SKIP. No suppressed check. Branch-allowlisted Preview build PASS. Final-head CI recorded in PR #53. No calculation/persistence/RPC/permissions/backend/operational data changes; all previously USER VERIFIED functionality preserved. Calendar Settings behavior unchanged.

## Evidence

|Zoom|Before|After|
|---|---|---|
|75%|[Before](kpi-today-20261109/before-75.webp)|[After](kpi-today-20261109/after-75.webp)|
|80%|[Before](kpi-today-20261109/before-80.webp)|[After](kpi-today-20261109/after-80.webp)|
|90%|[Before](kpi-today-20261109/before-90.webp)|[After](kpi-today-20261109/after-90.webp)|
|100%|[Before](kpi-today-20261109/before-100.webp)|[After](kpi-today-20261109/after-100.webp)|

Raw before/after geometry JSON and selected-range image are in the same evidence directory. Test: `TC26_CHROMIUM_EXECUTABLE=/path/to/chromium DUTY_GRID_EVIDENCE_DIR=docs/duty/kpi-today-20261109 node tests/duty-kpi-today.browser.cjs`; `GRID_PHASE=before` regenerates the baseline.

Stop at READY FOR USER TEST; no Production merge/deployment authorized.
