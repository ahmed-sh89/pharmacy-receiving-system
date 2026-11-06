# Duty final two fixes · 6 November 2026

**READY FOR USER VERIFICATION — not Production-approved.** Staging only. No merge, Production deployment, schema/data change or activation.

## Scope and source

Production main baseline `2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f`. Preserve development HEAD `1afffa85f267e777cdf6a1250c3b39b722eba80d` and Draft release PR #44 HEAD `6a2f374eebaa42146c8f761f030e3b519a975973` as parents. No new PR, migration or dependency.

1. **All Employees Excel:** default empty-key filter is now explicitly All Employees. Excel Export is enabled whenever the existing selected-month report projection contains applicable employees. One download uses the existing multi-employee workbook planner: Standard Timesheet has one sheet per employee; Schedule Layout retains six employees per page/sheet in one workbook. Includes active employees without shifts and preserves the existing inclusion of inactive staff with selected-month history. Existing order, IDs/official names, date/range projection, shifts and totals are unchanged. Individual selection still exports one employee. Copy remains disabled for All and stays exactly E:L for one employee; reserved M:O compatibility remains. Clear returns to All while preserving period. No-employees export stays disabled.
2. **Schedule internal scrolling:** removed obsolete fixed viewport offsets and 65/70vh overrides from grid source styles. One measured Duty viewport helper now serves Schedule and Reports, using actual page top/content padding and current viewport/preview scale. It responds to resize/visual-viewport/header size changes. Flex layout reserves header, month/tabs, toolbar and notices; only the grid consumes/scrolls the remainder. Existing sticky column/date headers, horizontal scrolling, selection, editing, drag autoscroll and saved scroll offsets are retained. Grid region is keyboard focusable. Receiving/Expiry/global layout remains unaffected when Duty is inactive.

## Verification

| Check | Result |
|---|---|
| Focused Duty tests | PASS: 84, no failures/skips locally, private actual-template overlay included |
| Focused release tests | PASS: 86, no failures/skips locally, including 81 protected Production file hashes |
| Relevant regressions | PASS: 124 Receiving/Expiry/auth/security/Handheld checks |
| New export tests | PASS: one-workbook All Full Month in both formats; All Custom Range in both formats; active blank staff, historical applicability, order/identity, unique days/columns, explicit totals, individual export/Copy, Clear and empty-roster guard |
| Viewport test | PASS: actual top/padding measurement, resize response and fractional preview-scale arithmetic |
| Existing edit/data tests | PASS: serialized Save, conflict draft, overnight/split/manual rules, month response races, scope isolation, persisted order and retained grid scroll |
| Build / CI / browser / READY Preview | Final delivery evidence below |

No full legacy-suite rerun; inherited failures remain in VERIFICATION_20261105.json. Prior owner USER VERIFIED persistence/refresh/two-session sync/conflicts/permissions/Excel/paste acceptance remains preserved evidence, not a fresh authenticated browser claim.

## Remaining acceptance / safety

- Native Windows Chrome zoom 75/80/100 remains NOT VERIFIED until actual owner acceptance. CSS-scaled browser diagnostics are identified separately.
- Fresh authenticated two-session testing is not claimed; no password request/auth retry. Outstanding native Excel 2016/2019 acceptance remains USER VERIFICATION REQUIRED. Prior Chrome Dangerous badge remains an unresolved release gate; never bypass it or claim clean security.
- No backend, calculation, persistence, Receiving, Expiry or authentication code changes. Existing six Duty migrations stay unchanged: `20261103235030`, `20261103235335`, `20261104013200`, `20261105183357`, `20261106001033`, `20261106010727`. No Production SQL performed. Preserve schema/history and directory-v2/manual-aware compatibility on rollback; keep other module grants unchanged.

Next owner checks: export All Full Month/Custom Range, including a blank employee, then compare individual export/Copy; at native Chrome 75/80/100 scroll Schedule vertically/horizontally with sticky employee headers and visible top toolbar, edit/refresh a synthetic duty and compare saved values. Stop on any Dangerous warning without bypassing. Separate explicit approval is required before any Production action.

## Delivery evidence

Runtime commits, READY Preview, CI and scoped browser results recorded after publishing. PR #44 remains Draft/unmerged.
