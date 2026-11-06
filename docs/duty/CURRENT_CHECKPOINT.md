# Duty final UX corrections · 6 November 2026

**BLOCKED — Staging implementation complete; final browser/native/security acceptance remains open. No Production action authorized.**

## Source and scope

Production main: `2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f`. Existing Duty branch `feature/duty-staging-20261104`, recovered HEAD `9c856adb37c0fc2c19ee7d91aa7a0a106e045235`; existing Draft release PR #44 (`release/duty-production-prep-20261105`), recovered HEAD `8662983330679a4564dceee6cd179b2a1f2e0b6f`. Preserve both parents. No new PR, main merge, Production deployment/SQL/activation or operational record change.

This continuation changes only Duty month-view loading, Reports layout/controls and editor presentation, plus focused tests/docs. Prior lifecycle/order/archive/official-name/display-name/access integration is retained. No dependency, database, migration, permission, authentication, Receiving or Expiry code changes.

## Four fixes

1. **DUTY-UI-MONTH-TRANSITION-001:** carry only the same authenticated scope's directory/settings into the selected-month read-only shell. Clear all previous-month entries/holidays/month metadata immediately; show the correct new calendar with empty cells. Restore editability only from the authoritative selected-month response. Sequence/scope guards reject late replies; scope reset clears retained employees. Genuine read failure shows the reserved status error and retains a read-only roster. Remove obsolete pending-database text. Loading uses a reserved line, not an inserted row.
2. **DUTY-REPORT-OUTER-SCROLL-001:** Reports use the remaining measured application viewport. Header, fixed tabs, controls, identity/actions and KPIs stay outside the table scroller. The table owns vertical/horizontal scrolling and sticky column headers. Height follows viewport resize; document overflow rules apply only while Duty Reports is active. Other modules' layout remains unchanged.
3. **Edit Duty:** compact Status / Shift Times / Hours Calculation / Notes sections; aligned IN/OUT pickers, decorative sun/moon with explicit unchanged AM/PM text, Auto/Manual segment, Basic/OT/Total summary, optional second shift. Existing field names, time parsing, calculations, CAS/save/conflict behavior retained. Only editor body scrolls; error area and footer remain reserved/visible.
4. **Reports controls:** searchable name/code combobox with keyboard support; Full Month / Custom Date Range using existing native date inputs with shared Schedule date-field styling. Selection auto-renders the single-employee report; no Search/Preview confirmation step. Compact labelled Copy/Excel icons, employee/code/period context and a small paste-help popover. No permanent long instruction row. Exact eight-column E:L clipboard/start-date mapping, reserved M:O compatibility and both XLSX formats unchanged.

## Verification

| Item | Status |
|---|---|
| Focused Duty tests | PASS: 76, 0 failed, 0 skipped locally; actual private A(3).xlsx overlay included |
| Focused release tests | PASS: 78, 0 failed, 0 skipped locally; all 81 protected Production files match by blob hash |
| New month regression | PASS: Nov → Dec → Nov, retained sorted roster, empty December calendar, late reply rejection, genuine failure and scope isolation |
| New editor regression | PASS: operational AM/PM/overnight payload, rapid Save serialized, authoritative acknowledgement and retained conflict draft |
| Report regression | PASS: name/code search, automatic selection/range changes, exact date-aligned E:L copy; existing independent XLSX/ZIP/XML/calculation checks retained |
| Build | PASS: feature Staging Preview artifact and local release artifact; local release build is not a deployment |
| Receiving/Expiry/auth/security/Handheld regressions | PASS: 124, 0 failed; no protected business source changes |
| Native Windows Chrome 75/80/100 | NOT VERIFIED; CSS-scaled synthetic checks, if recorded below, do not establish native browser zoom |
| Fresh authenticated two-session new UX | BLOCKED: no usable signed-in browser session; no credential request/retry. Prior owner acceptance of schedule persistence/sync/conflict/access is retained, not claimed as fresh verification |
| Native Excel 2016/2019 on new report controls | USER VERIFICATION REQUIRED; prior owner XLSX-opening acceptance retained; no new native-Excel claim |
| Chrome Dangerous badge | Unresolved prior release blocker. Earlier read-only preview reached sign-in without an interstitial but could not inspect Chrome security/address-bar state. No clean-security claim or bypass |

Prior owner USER VERIFIED results remain preserved for save/refresh, independent-session sync, conflict rejection, Administrator enable/disable/sidebar, report consistency, native XLSX opening and single-employee paste on the prior candidate. No unnecessary full legacy-suite rerun; inherited failures stay in VERIFICATION_20261105.json.

## Database / rollback

No new migration or SQL execution in this task. Retain existing ordered Staging migrations `20261103235030`, `20261103235335`, `20261104013200`, `20261105183357`, `20261106001033`, `20261106010727`. In particular retain `20261105183357_duty_production_readiness_staging.sql`; do not duplicate/replay or apply obsolete proposals. Last lifecycle migration intentionally revoked direct authenticated directory-v1 execution; retain the v2 adapter on any scoped UI rollback.

Safe rollback is a focused Duty UI revert or disabling Duty through existing Permissions while retaining all data/schema/manual-hour readers and other module grants. Never drop/restore operational tables. Production requires separate explicit authorization.

## Maximum four owner checks

1. Open the READY Staging candidate without bypassing any Dangerous warning; check Nov → Dec → Nov with preserved roster/order and restored saved November shifts.
2. At native Windows Chrome 75%, 80%, 100%, open Reports/select an employee and Custom Range: header/actions/KPIs stay visible, only the table scrolls and column headers stick.
3. Edit ordinary/split/overnight duty in Auto/Manual, verify AM/PM and visible footer; rapidly Save, refresh, and compare the second independent Staging session without accepting a stale overwrite.
4. Check both XLSX formats in Excel 2016/2019; copy the whole month and a custom range into a disposable correctly dated employee template starting at E, confirming E:L and unchanged reserved M:O/adjacent cells.

## Delivery evidence

Final commit, CI and READY Preview identity are recorded after publishing. No browser/authentication retry or approval bypass is authorized by a tool failure. The previous Auto-review notice supplied no detailed latest rejection reason; do not infer an app/security defect from that interruption.
