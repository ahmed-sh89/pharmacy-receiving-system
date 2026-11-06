# Duty final Staging candidate · 6 November 2026

**READY FOR FINAL OWNER ACCEPTANCE — NOT DEPLOYED TO PRODUCTION.**

## State and authorization

Production main remains `2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f`. Development continues from `673e5e23d43c6f904fe99d3f1bea62b5f152f950` on `feature/duty-staging-20261104` (PR #43). PR #44 on `release/duty-production-prep-20261105` is the single focused release candidate; #43 remains the broader Staging development PR. No third release PR, main merge, Production deployment, database call or activation is authorized.

The Product Owner's 6 November execution attachment explicitly records USER VERIFIED — PASS for Administrator enable/disable/sidebar, schedule save/refresh, two independent synchronized sessions, conflict prevention, Reports/Schedule consistency, Microsoft Excel opening and single-employee paste. This supersedes the earlier open acceptance entries for that prior candidate; it is owner evidence, not a new automated browser claim. New behavior below requires focused final acceptance.

## Final changes

- One audited/CAS save-and-read RPC replaces two network round trips. Saving feedback appears immediately; Saved appears only after the authoritative response. Pending writes remain serialized; no browser-local schedule source of truth, optimistic success, replay or duplicate-write queue was added. Errors retain editor inputs/clipboard and stale revisions remain rejected.
- Reused Intl date formatters reduce repeatable offline rendering cost; before/after samples and scenario are in `PERFORMANCE_20261106.json`. This is rendering evidence, not measured signed-in network latency. Run `node scripts/benchmark-duty.cjs 673e5e23d43c6f904fe99d3f1bea62b5f152f950` in a checkout with that Git object.
- Centered editor with a bounded internally scrolling body, reserved error area and persistent footer. Employee/settings panels use the same body/footer principle. Background reads do not add a loading row or replace an unchanged grid; scroll and selection are retained and an edit opened during a request is protected.
- Active/Inactive directory state, existing activation controls, Up/Down ordering and confirmed Delete/Archive. Records with schedules/rule references/dependencies are inactivated; unused rows can be deleted. Audit remains. Ordering uses immutable IDs, row revisions and the existing pharmacy lock; it is consumed by Employees, Schedule, report selection and exports.
- Existing Administrator Permissions modal closes after confirmed save, stays open with recovery guidance on write failure, and revalidates current-scope permissions independently.
- Reports preserve one employee at a time, Full Month and Custom Date Range. E:L remains eight values per day with no clipboard headers/totals/identity. The destination instruction names the employee and actual start date; partial ranges are not padded with blanks or shifted to day one. Preview/export share selected-period totals. Integer hours use Excel format `0`; fractions retain precision. Notes stay actual-note-only. Preview prioritizes A:K, with Notes secondary and reserved M:O retained in XLSX.
- Real pharmacy identity is always the authenticated context; the synthetic badge/code is a separately labelled demo. No editable demo label alters a tenant ID.

## Database and safety

Staging only: applied `20261106001033_duty_final_directory_and_save_staging.sql` once after embedded-PostgreSQL verification. It adds two ordering columns, narrow directory/save RPCs and an additive reader field. Existing records receive the same neutral ordering default. No Receiving/Expiry/auth tables, policies, business functions or records were changed. RPCs reuse strict Duty access; anonymous/direct-table access remains denied. Advisors retain the pre-existing RPC-only warnings; two additional authenticated SECURITY DEFINER wrappers are intentional and session/tenant guarded.

Future approved Production migration order: `20261103235030`, `20261103235335`, `20261104013200`, `20261105183357`, `20261106001033`. Apply only missing approved migrations after dependency preflight; never replay against existing history. Do not apply the obsolete manual-hours proposal. No Production SQL performed. Retain additive schema/data on UI rollback; disabling Duty safely removes access.

## Verification

- 69 focused Duty/permissions tests PASS, including atomic save/read, ordering, safe archive/delete, CAS, calculation rules, pending/error feedback, unchanged-grid refresh, range/date mapping, integer formats and independent XLSX XML/ZIP checks.
- 124 relevant security/auth/Handheld/Receiving/email/Expiry regression checks PASS; no changed protected business source.
- Live Staging rollback-only synthetic test PASS for ordering, unused deletion, historical inactivation and one-request save/read, in addition to the existing session/isolation/calculation checks. Synthetic fixture records were rolled back. Existing Staging user records were retained; aggregate current data includes 8 employees and 35 entries, so no zero-data claim is made.
- Actual `A(3).xlsx` was read from its supplied local attachment. Disposable in-memory full-month and range overlays in the first two employee blocks preserve all cells outside E:L/the selected rows and preserve target styles. Source bytes remain unchanged. No online sheet was opened or written.
- Template limitation: the supplied file's underlying dates are inconsistent (mixed month/day serials) and its metadata is not the selected November report. Calendar identity must be checked by the owner before normal paste. The standalone Standard Timesheet generates correct dates. Tests do not claim the untouched template was already a correct November calendar.
- The prior full legacy suite has inherited baseline failures recorded in `VERIFICATION_20261105.json`; it was not rerun or repaired as unrelated work. No full-suite-green claim.
- No new authenticated browser flow was attempted: the prior login cancellation remains respected. New ordering across independent authenticated sessions and native Windows Chrome 75/80/100 geometry require owner verification. Previous native Excel opening was USER VERIFIED; changed number formats/custom ranges need the short final check.

## Final owner checks (synthetic Staging only)

1. Edit a split/overnight duty: Saving appears immediately, Saved follows confirmation; refresh preserves it.
2. At native 75/80/100 zoom, Save/Cancel remain visible; changing browser tabs does not shift the grid.
3. Reorder employees, compare Schedule/Reports and the second independent session; test one unused delete and one historical archive.
4. Save Administrator permissions: modal closes; Duty Disabled hides/blocks it while Receiving/Expiry grants remain as selected.
5. Copy one employee for November 7–9 into that employee's matching dated rows in a disposable, correctly dated template; inspect E:L and adjacent cells.
6. Open both new XLSX formats in Excel: no repair, integers without a trailing dot, fractions/Notes/period totals correct.

## Saved release evidence

Feature implementation: `52e376b455dca0e51473f673651c76fde81e9c6c` (PR #43). Focused release implementation: `7cda81d6c005456babbb4932aab738be14cdef8c` (PR #44). Subsequent evidence-only commits do not change this runtime.

Confirmed Vercel READY Preview: https://pharmflow-test-h286zbfaq-fhyh2xtskz-3504.vercel.app/ — deployment `dpl_DkXpPXoeum5y4kB5GvMRjvKy9j9K`, exact deployed runtime `52e376b455dca0e51473f673651c76fde81e9c6c`, isolated Staging build.

Release build PASS. Final focused release tests: **71 PASS, 0 FAIL** locally, including the actual-template overlay. Release CI on `7cda81d`: Duty readiness [42135949194](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42135949194) PASS; required PharmFlow security [42135949203](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42135949203) PASS. The actual-template fixture is optional in CI because the private attachment is not committed; its local run passed. All 81 protected files match Production by Git blob hash. PR #44 diff contains no Receiving/Expiry/auth/Handheld business file, Supabase connection or Vite/deployment guard change.

New visual browser verification: **BLOCKED**. Automatic approval review rejected opening the new Preview because of the earlier explicit instruction to stop browser retries. No retry, alternate browser, credential request or bypass followed. New native-zoom geometry, changed integer-format display and cross-session ordering remain owner checks; the prior USER VERIFIED acceptance is retained as reported evidence.

Do not merge or deploy. Production requires separate explicit approval.
