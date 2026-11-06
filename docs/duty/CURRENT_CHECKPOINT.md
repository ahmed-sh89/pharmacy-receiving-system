# Duty final UI acceptance · 6 November 2026

**BLOCKED — NOT READY FOR PRODUCTION. Staging implementation complete; final visual/security acceptance remains open.**

Production main verified `2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f`. PR #44 is the single Draft release candidate (`release/duty-production-prep-20261105`); PR #43 is the existing broader development branch. Recovered feature `972a451d08f79fe938c589fdffbbad99a758aee2` and release `05b3c5432835c1b2f16901fedb16d71d39e16f9e` were preserved as parents. No merge, Production deployment/SQL/activation or operational-data change is authorized.

## Implemented in this continuation

- Compact separated Employee/Position cards, green Active/neutral Inactive indicators, accessible edit/archive/restore/delete icons and Move Earlier/Move Later tooltips. Active, Inactive, Archived and All filters share the same UX. Reordering swaps visible neighbors while submitting the complete immutable roster with expected revisions.
- Archive is now a durable independent state. Restore returns to Inactive; ordinary activation remains in Edit. Historical schedules/rule/position references block permanent deletion. Unused records may be deleted after explicit confirmation. Archived records are view-only until restored; historical schedule/report visibility remains.
- Optional Schedule Display Name affects only Schedule column labels. Without it, long multi-part names use first/last names; official names remain intact in records and reports/exports. Schedule identity tooltips show the full official name and employee code. No identity/history rewrite.
- Standard Timesheet footer has three aligned separated rows: Period Totals (OT columns I:K), Basic Hours and Total Hours (column I). A:H label merges are shared by preview/XLSX. Daily E:L mapping, actual Notes, calculations and filters are unchanged.
- Toolbar uses fixed grid tracks and fixed tab dimensions instead of content-dependent space-between. Responsive rows reserve the same space across views; Duty-only document scrollbar gutter prevents width shifts. Active colors transition subtly; reduced-motion is respected. Schedule scroll survives tab roundtrips. Duplicate toolbar overrides consolidated; vertical spacing reduced.
- View Demo hidden from signed-in operational UI. Isolated generated Staging `/duty-demo.html` remains memory-only developer diagnostics and is excluded from release. Manual Refresh retained: automatic visible/focus reads skip active editors/panels and do not fully replace explicit recovery. No extra polling or authentication changes.

## Migration / compatibility

`20261106010727_duty_directory_lifecycle_staging.sql` applied **once to Staging only**, project `tovkcakucyagvbzvlnks`, after embedded PostgreSQL verification. Hosted history supplies this exact version. Additive archived flags/defaults, bounded schedule display name, guarded CAS employee-v3/directory-v2 writers and reader projection. Existing rows keep official names, IDs, ordering and entries; no backfill. Old directory-v1 direct authenticated execution is revoked to prevent superseded delete/archive behavior; v2 delegates internally under the existing guarded pharmacy lock. Legacy UI directory operations therefore require the updated client.

Migration order for any separately approved future Production release: `20261103235030`, `20261103235335`, `20261104013200`, `20261105183357`, `20261106001033`, `20261106010727`. Retain the readiness migration unchanged; never replay existing versions or apply the obsolete manual-hours proposal. No Production DB was queried or modified.

Rollback: disable Duty using existing Permissions while preserving Receiving/Expiry grants. Retain additive schema/history. An older UI that calls directory-v1 is not a compatible directory rollback; retain the v2 client adapter or keep Duty disabled. Never drop tables, restore operational data or roll back manual-hour readers.

## Focused verification

| Acceptance | Status / evidence |
|---|---|
| Lifecycle, archive/restore/delete, order/CAS and tenant isolation | PASS: embedded PostgreSQL and live rollback-only Staging synthetic RPC test |
| Schedule label vs official names / tooltip | PASS: model, DOM and both XLSX exports |
| Report footer / unchanged daily mapping and calculations | PASS: merged workbook roundtrip, existing independent XLSX ZIP/XML validator and E:L template overlay |
| Focused feature tests | PASS: 72, no failures; private actual-template fixture included locally |
| Focused release tests / protected files | PASS: 74, no failures; all 81 protected Production files match by Git blob hash |
| Receiving/Expiry/auth/security/Handheld regressions | PASS: 124, no failures; no protected business source edits |
| Build / CI / READY Preview identity | Pending final publish verification below |
| Prior owner acceptance | Preserved USER VERIFIED — PASS for save/refresh, independent-session sync, conflicts, Administrator access, report consistency, native Excel opening and single-employee paste on prior candidate |
| Fresh authenticated new-feature session/order/alias verification | BLOCKED: browser is signed out; no password request or authentication retries |
| Native Windows Chrome 75/80/100 geometry | NOT VERIFIED; requires owner acceptance (DOM tests do not establish browser zoom geometry) |
| New footer/native Excel 2016/2019 acceptance | USER VERIFICATION REQUIRED; prior opening acceptance is preserved, not reused as proof of new footer |
| Reported Chrome Dangerous warning | One focused read-only check reached the prior READY preview's sign-in page, no blocking interstitial reproduced. Cloud screenshot shows page content, not Chrome address-bar/security state. Exact Dangerous badge/cause remains NOT VERIFIED and an open release blocker; no bypass, protection change or clean-security claim |

Prior full legacy-suite inherited failures remain in `VERIFICATION_20261105.json`; no unnecessary full-suite rerun or unrelated repair. Actual A(3).xlsx has inconsistent underlying dates; match the real destination employee/month/date before paste. Source attachment and all outside-E:L cells/styles remain untouched by the disposable overlay test.

## Next action — maximum four owner checks

1. Open the READY Staging URL in Chrome. Verify no Dangerous warning; if present, stop and report its exact warning details without bypassing it. At 75%, 80%, 100%, switch all four tabs and check fixed positions, grid scroll and editor footer.
2. With synthetic Employee/Position records, test ordering, Active/Inactive/Archive filters, Restore, unused delete and rejected historical delete. Check full official name vs optional schedule label/tooltip and preserved history.
3. In two independent signed-in Staging sessions, confirm new order/name/archive state after the intended visible/focus refresh; attempt a stale edit and confirm conflict rejection and no duplicate/lost records. Prior schedule/session acceptance is retained.
4. Check report footer and both XLSX formats in Windows Excel 2016/2019 (no repair). Copy one employee's full month E:L once into a disposable correctly dated template; verify Notes, fractional/whole hours, totals and adjacent cells.

Stop before Production. Security-warning closure and owner acceptance are required before readiness approval.
