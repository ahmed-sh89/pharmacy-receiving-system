# PharmFlow current checkpoint — 16 November 2026

## Item Movement module — Staging only

Item Movement is a separate sidebar destination with an independent pharmacy setting. The pharmacy administrator can search, export and manage imports. When Receiving is enabled, successfully uploaded Orders contribute ordered quantities immediately, using the date and warehouse code from the original file. Orders take precedence over repeated imports of the same TO. When Receiving is disabled, the module uses saved imports from warehouses and branches. Receiving History contains New Items and Discrepancies in this preview. Production feature flag and database remain gated.

The Staging results layout shows a single item's total alongside an always-open detail table. Multi-item searches group all movements under the relevant item and open each group individually. The page keeps the same totals and exports while reducing repeated identifiers in the visible details.

## Item Movement source column — Staging

Receiving rows display the From Warehouse code from the matching order file. Imported transfers continue to display their saved source code. Single and bulk completion retain the source code in future archives. For older archives, the report reads missing source codes from the authorized order registry. Rows with no accessible saved source show a dash. The owner confirmed the Production search for the previously reported imported item now returns a result.

## Production transfer import hotfix — 16 November 2026

Production read-only verification found zero saved transfer records for HHP084. The XLSX parser rejected TO fields containing a trailing pharmacy code. The hotfix canonicalizes both workbook formats to the same TO and reads source from From Warehouse. The import dialog now distinguishes files read from transfers saved. Item Movement empty results explain that transfers are searched by the workbook Receiving Date. Manage Imports previews the count of today's uploads before confirmation, uses the existing scoped and version-checked deletion endpoint, and refreshes the day after processing. Deletions across more than 100 records run in batches and report completed progress if a later batch fails. The owner confirmed the previously reported imported item appears in Production search.

## Receiving History — Staging review

Based on Production main `3f03b9705661d7cef01a35cbd320e7b54ba5f082`. Receiving Report opens one Receiving History page with Discrepancies, New Items, and Item Receiving History. Item search supports an optional order number and one date range in Riyadh time. New completions retain per-item quantities in the existing per-order archive payload. Older uploads with no verified receiving row show Not available, and older orders with incomplete searchable records are flagged. No schema changes. The owner confirmed item lookup after staging receipt. Follow-up aligns Receiving History with the Receiving Report controls, restores its custom month calendar, and defaults to Item Receiving History. Report and date pickers now open above the Receiving scroll container. Follow-up: discrepancy and NEW reports read the existing RLS-protected history directly in pages (one request initially). Authenticated archive queries apply their filters and pagination. Item reports use one compact search field with an adjacent Search action. Add Item adds a matched code and its report rows to an independent export list for the same dates, with each item retaining its order filter. A date mismatch offers to search the list dates. The independent Export List tab uses already loaded rows and does not fetch them again. Excel saves formatted Summary and Order Details sheets with filters and frozen headers. Export List PDF uses Item Code, Item Name and Total Quantity, calculated from Ordered quantities. Item Search PDF retains the summary and order details. Staging Nov 16 fixture: 420 differences, initial JSON about 28 KB versus 115 KB for the old all-rows flow. Quantity headers and values are centered in Item Search and Export List, a single matched item highlights Total Ordered, and the Receiving History action is centered between Back and Email. Excel and PDF center quantity headers and values. Export List Print opens the A4 dialog with the same item totals table as the list PDF. Owner verified the Print Preview on 16 November 2026 at `5a8dc4a647b6ffca7be3bdfa2bd99de472afe207`.

## Item Movement — unified Receiving History on Staging

Draft PR #66 builds on the owner-accepted Receiving History Print Preview. Staging Item Movement combines warehouse Order Date and Ordered quantities with pharmacy transfer Receiving Date and Quantity. The range uses the Date displayed in the report. Archives without a valid source date cannot be placed into the range. Source pharmacy can be searched by code or by an existing name matched to an imported source code, with or without an item. The optional TO filter runs on the server. Export List, Excel, PDF and A4 Print use one centered Total Quantity per selected item. A transfer and archive matching the same TO and item in the selected period use the imported transfer row once.

Import Transfers keeps Excel parsing local, accepts native Excel dates, and treats ambiguous text dates as month-first. Identical TOs are skipped and changed content on the same TO is flagged. Manage Imports lets users with Receiving write access find imports by TO or upload date in Riyadh time, select specific records, confirm deletion, and reimport. The list shows Upload Date and File Date side by side. Last import shows the newest saved upload timestamp, a TO and its file date as soon as Manage Imports opens. Transfers saved at the same timestamp are counted together. Duplicate-only uploads preserve the last saved timestamp. Upload date inputs reuse the Receiving History calendar with an optional Clear action. From Pharmacy has room for the code or name hint. The wider item search is emphasized. In Discrepancies, search by item code or name or select a result’s item code. Item selection applies before pagination and remains in Excel and PDF output. Import Transfers uses a primary upload action, separated from the outlined Manage Imports action. Selected records are version-checked and deletion is scoped to the current pharmacy. Saved transfer changes invalidate the in-memory export list to prevent stale totals.

The transfer SQL proposals are scoped to the Staging Supabase project. The 100-file XLSX replay and Staging archive date checks passed. A rolled-back hosted test saved 50 transfers, skipped the same 50 on replay, added 10 new, found 60 by source, deleted and reimported one, and left zero test rows. The upload-date test checks the start and end of the Riyadh day and direct TO lookup. The owner approved the exact Staging preview at `a2a554af508b945ee7025a51e345c94b5920f3aa` and authorized one cumulative Production release on 16 November 2026. Production PR #67 was merged at `be7e09cca9871df7305d8b026c176c76288b5fc6`, with combined migration `20261116102323`. The follow-up fixes the legacy archived-order query by including both PostgREST sort columns in its projection. The update banner uses concise copy and allows refresh after changing read-only report filters while preserving pending-write and editor checks.

Follow-up Staging Preview: batch item searches across older source orders so the database sends matching rows and reports missing source data. The update action follows the normal browser reload and autosave path, with guards for live editors, scans and pending writes.

## Pharmacy activation and deletion — Production approved

Based on Production main `3911030186e2c94b4f2a671b9c51e0c7bd1c6238` (PR #62). Newly provisioned pharmacy admin accounts remain Pending Activation until their initial temporary password is replaced. Later resets preserve the initial activation state. Deactivate and Reactivate reuse the existing pharmacy access control, with the same supervisor message for valid email and code sign-ins. Existing accounts keep their activation classification. The owner can permanently delete an empty pharmacy regardless of activation. The confirmation appears first and server rejections stay in the same dialog. Deletion removes pharmacy memberships and setup records while preserving Auth accounts and their other memberships. Pharmacies with operational history or files use Deactivate. Provisioning one new admin shows a one-time Copy Account Details action for the individual pharmacy. Deletion History records future successful deletes with the pharmacy name/code, actor, and timestamp. Pending Requests remains available while a request is open. Owner reported Staging PASS and authorized Production on 15 November 2026. Final adjustments make account details paste into Excel as two columns and restyle the bottom-of-page PharmFlow update notification.

## Pharmacy Admin sign-in — Staging accepted

Product Owner verified PASS on Staging and authorized Production on 14 November 2026. Accepted Staging head `a1960ff709c5f08fcb370e8a3af82cc59c9bd527`. Includes email or pharmacy code for Pharmacy Admin, email sign-in for System Owner, mandatory temporary-password replacement, Duty in initial permissions, and a suspension message after valid credentials. Production release also requires the two SQL migrations, two Edge Functions, and the hosted Auth signup setting disabled. Existing account credentials and pharmacy permissions require no backfill.

## Receiving discrepancy email WO wrapping — Production approved

Baseline `0fda480ba6945a905ea8c45df3ad091739b03df1` (PR #61), approved candidate `d33c167c130970c3a8af797bf2b7bb1aa3e80005`. The HTML email and preview allow a wrap after WO- and keep the digits together. The plain-text copy retains the full identifier. The focused email, Pages artifact and release-isolation checks pass. Direct Production release is authorized. Verify visually in a narrow Outlook reading pane after deployment.

## Receiving KPI order details — Staging review

Based on Production main `1e0db955d2ee174cc9d95572af39d9532c9f23bd` (PR #60). Completed, Remaining Items, Remaining Units, and Over Received details classify each selected Order row independently. The Order No. and signed Received minus Ordered are drawn from the existing per-order Receiving projection. The cards keep their unique-item counts and aggregate remaining units. Review all four details on the Staging Preview, including the same item on two Orders, before requesting Production release.

## Historical Extra Items and export menu — Staging review

Production baseline `463b9d1881796b4620ada6628e9030981d580cd9` (PR #59). See the [Staging checkpoint](docs/receiving/archive-extra-menu/CHECKPOINT.md) for archive scoping and manual verification.

## Work Order per discrepancy item — Production approved

Production baseline `6c82f95ae1c3d10915509917e8802e66f3510089` (PR #58). See the [release checkpoint](docs/receiving/email-item-wo/CHECKPOINT.md) for work order entry, cell styling and verification.

## Receiving discrepancy email — Staging review

One table per TO with a single header for the date and all manually entered WO numbers, English left-to-right headers and approved Arial 10/11/12/15pt typography, signed differences with Arabic status quantities, and a TO-only subject. Application candidate and remaining Outlook verification are recorded in the [Staging checkpoint](docs/receiving/email-simplification-20261113/CHECKPOINT.md). Production release requires separate approval.

## Duty KPI / Today polish — READY FOR USER TEST — 9 November 2026

PR #53 only, branch fix/duty-exchange-staging-20261109-v2. Verified start d97d60417f53659d34782953a67c48c3b2a542db; Production main c68a940fecd9d40b57b625769e9a4654991b6010 unchanged. Existing USER VERIFIED acceptance retained.

Consolidated label/value grid spacing; symmetric Total tracks center number independently, unchanged 26px bar. Today now one line without weekday, 12px bold, Saudi date/highlight unchanged. No business/persistence/backend/data changes. Four-zoom Chromium before/after PASS: exact cell/header/KPI/grid geometry, centered Total ≤0.1px, text gaps, no overflow, zero writes. 24 focused PASS; both existing browser runners PASS; full Duty 120 PASS / 1 historical FAIL / 1 optional SKIP. Preview build PASS. [Exact files, root causes and visual evidence](docs/duty/KPI_TODAY_POLISH_20261109.md). Final source/READY Preview/CI identity pinned in PR #53.

Next: owner visual acceptance. Stop at Staging; no Production merge/deploy.

## Retained accepted Production releases



**PR #49 RELEASE CLOSURE: CLOSED — USER VERIFIED.** Product Owner Production acceptance recorded 8 November 2026. The previous operational acceptance blocker is resolved; no deployment or operational tests repeated for this documentation closure.

## Verified release identity

- Repository: ahmed-sh89/pharmacy-receiving-system. Production Supabase: `zznoshzcyxmtwfbznjyr`.
- Released [PR #49](https://github.com/ahmed-sh89/pharmacy-receiving-system/pull/49); approved head `be2f46b579d0087df004e45a8583f9c6dac84e07`.
- Application release merge SHA: `94300f212994c1995d7dc7595a80c929d0218de1`; official Pages [run 42520331672](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42520331672) SUCCESS.
- Product Owner-accepted / pre-closure Production main: `ee5f18dbde4233de078cd59a079a6dd28fe98ab3`, including documentation PR #50; official Pages [run 42520914046](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42520914046) SUCCESS for that SHA. Main, merged release identity and deployment evidence rechecked read-only for this closure. A subsequent documentation-only merge has its own SHA; application source remains identical.
- Released scope: nonpersistent automatic Handheld classification with explicit mode preserved; exact-URL parallel script preloads preserving execution order/SRI; one redundant registration-status read removed. No further application changes.

## Actual Product Owner Production acceptance — USER VERIFIED / PASS

On **8 November 2026**, the Product Owner confirms:

- Production loads completely and becomes usable **approximately 7 seconds after Refresh**, compared with the previously reported **approximately 30–60 seconds**. These are owner-observed approximate operational timings, not a controlled laboratory benchmark or a DOM-only timing.
- **Receiving, Orders and Reports** open successfully.
- **Expiry**, **Duty** and **Administrator** open successfully.

This explicit manual operational acceptance closes the prior PR #49 smoke-acceptance gap. Earlier agent sign-in returned `Invalid login credentials`; that attempt is not relabeled agent-authenticated PASS. No operational tests were rerun for closure and no operational data was modified by this documentation task.

## Staging / verification boundaries

Prior Product Owner **Staging USER VERIFIED / PASS** remains distinct: Windows authenticated Refresh **3.5 seconds in each of two trials**; Desktop restored after mobile emulation and stayed correct after Refresh; **Zebra / Receiving / Expiry PASS**. This is not a new Production hardware test.

Retained release evidence: 20 focused/build checks + 255 related regressions PASS; required security and session-boundary checks PASS. Prior agent Production checks established signed-out startup/reload, no app-origin startup errors observed, Production ref/CSP, 51 preloads and absence of Staging diagnostics. No operational tests or audit repeated; mandatory documentation CI remains required. Manual acceptance does not independently prove comprehensive security, cross-pharmacy isolation, token revocation, record fingerprints, every permission combination or physical hardware behavior. No whole-suite-green claim.

## Historical CI exception / safety

The reviewed **non-mandatory Duty file-snapshot exception** remains documented and unchanged. The old 81-file manifest matches the pre-release main; only four approved frontend/build files differ in PR #49. Retained Duty job: 108 PASS / 1 FAIL / 1 SKIP; only `tests/duty-release-isolation.test.cjs`'s historical byte-freeze comparison failed at `js/app.js`. It is not a verified Duty behavioral regression. No check was disabled or bypassed; required security checks must pass for this documentation PR as well.

Closure changes **only `PHARMFLOW_CURRENT_CHECKPOINT.md` and `PHARMFLOW_CHANGELOG.md`** through existing branch protection. No application code, SQL/migrations, Supabase/schema/data/Auth configuration, Edge Functions, secrets or operational records changed. No manual application deployment or replay of PR #49. The existing main-push workflow is unmodified.

Rollback remains a protected revert PR plus official Pages deployment; **actual rollback/restore was not tested**. No database rollback is required for the frontend-only release.


Security Release #47 remains CLOSED — USER VERIFIED with its previously documented residual risks and verification boundaries: [closure](docs/security/20261108/CLOSURE.md). No replay, reopened audit or new certification.
