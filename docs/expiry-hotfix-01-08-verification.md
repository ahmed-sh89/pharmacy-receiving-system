# Expiry acceptance hotfix 01–08 — Staging, 20 October 2026

Starting source, remote branch and READY deployment: b534ee115bf5919c121a4b9e039d571ead08491e. Existing branch fix/staging-preview-splash-css-path, project pharmflow-test, Supabase tovkcakucyagvbzvlnks only. Production/main was neither accessed nor modified. The four pre-existing untracked Settings SQL/test files were preserved and excluded.

| Hotfix | Implemented / verified |
| --- | --- |
| 01 | Existing Operator selector chooses real, immutable per-pharmacy Desktop/Handheld system Operators after authenticated initialization. Manual selection and captured operation identity are retained; changing Operator never saves. Invalid missing selection shows an error. Desktop selector room increased horizontally by 25px; height stays 42px. |
| 02 | Session/Inventory quantity inputs 150px, horizontally centered with centered values; same mutation contracts. |
| 03 | Existing top-layer row menu now 142 × 80px with blue pencil / red archive icons, clamped position, keyboard and outside dismissal. |
| 04 | Active Session/Inventory UI says Remove; one explicit confirmation with exact snapshot/count. Backend RESOLVE semantics and Needs Review Resolve terminology unchanged. Successful dialogs cannot submit again. |
| 05 | PDF/Print use bounded A4 columns, complete wrapped exact identifiers and content-height rows. Notifications have ×, 12s error timeout, scope/generation protection and tab cleanup. |
| 06 | Excel reads all current-pharmacy active Inventory with empty temporary filters, preserves string identifiers/casing, adds original Operator and local readable timestamp, complete names, wrapped cells, styled header, AutoFilter and frozen header. PDF/Print retain filtered scope. |
| 07 | Restore All enabled within existing Resolved-list Bulk Actions; full reviewed selection across pages, exact versions, transaction and request receipt. Permanent Delete All BLOCKED, not substituted with soft deletion. |
| 08 | Single click replaces after 260ms recognition window; double click adds without an intermediate reset/query; keyboard click replaces immediately. Existing × clears and cancels queued selection. GSAP/styles/calculation/query contracts unchanged. |

## Changed files

Application: `js/expiry.js`, `js/expiry-desktop-v2.js`, `js/expiry-inventory-report.js`, `css/dashboard.css`.

Migration: `supabase/migrations/20261020013030_expiry_operator_device_defaults_v1.sql`.

Tests: `tests/expiry-final-acceptance-hotfix.test.cjs`, `tests/expiry-final-acceptance.browser.cjs`, `tests/expiry-acceptance-reports.cjs`, `tests/expiry-acceptance-hotfix-staging.sql`, `tests/expiry-hardening.test.cjs`, `tests/expiry-inventory-filter-reset.test.cjs`, `tests/expiry-inventory-resolve-all-filtered.test.cjs`.

Records: this verification file, `PHARMFLOW_CURRENT_CHECKPOINT.md`, `PHARMFLOW_CHANGELOG.md`.

## Applied migration

20261020013030_expiry_operator_device_defaults_v1.sql. Adds nullable system_key to existing worker table, a check/unique index, private system-row guard trigger, and compatible replacement of list_pharmacy_expiry_workers(uuid) (same result columns). The existing list RPC provisions only the two fixed system choices, once per requested pharmacy, under existing management advisory lock. Provisioning is audited using operator_audit_v1. Existing configured Operators and historical references are untouched. No parallel Operator/session store.

Signed valid session and membership are checked before provisioning/reading. Existing management permissions stay unchanged. System choices cannot be renamed/deactivated. anon EXECUTE=false; authenticated EXECUTE=true; worker RLS remains enabled; new private trigger function has no PUBLIC/anon/authenticated EXECUTE. Advisor flags authenticated SECURITY DEFINER execution of the existing RPC as an intentional public API; it does not establish a bypass. Relevant reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable . No unrelated warning remediation was performed.

## Verification

- 240 focused Node tests PASS: capture/defaults, retained authentication failures, receipt retry, unknown review/evidence, GS1 FLUTAB, case-insensitive Batch, scanner autofocus, month filters/search, one-confirmation Remove, stale scope, Restore All, export notifications/scope/text values and GSAP lifecycle. Superseded click timing / two-step Resolve confirmation expectations were updated to the explicitly approved interaction. No operational assertions were removed.
- npm run build PASS. git diff --check PASS. Full historical suite was not run or declared green; previously documented baseline Settings/old operational-UX expectation failures are not claimed fixed.
- Authenticated-role Staging SQL: tests/expiry-acceptance-hotfix-staging.sql PASS; unique disposable fixture Batches only; ALL test writes rolled back. Two real system UUIDs stable on repeated list; immutable system choices; cross-pharmacy/unsigned denial; successful capture retry; 2 removed records / 5 units restored once; stale restore rejected; original Operator retained.
- Previous tests/expiry-hardening-staging.sql PASS, all writes rolled back: GS1 source locks, manual correction/re-key, original casing, earliest Operator provenance including delayed Needs Review resolution, inactive Operator safety and idempotency.
- Actual Chromium source fixtures, network blocked: 1366×768 table/search top stays y=242px; 142×80 row menu fits top/bottom/right edges; quantity input centered at x=683px; selector text has no overflow (124px client/scroll, 42px height). Existing 360×640 Handheld unknown state stays red, full viewport scroll height=640px, Save bottom≈486px; Serial hidden; Note/Photo fixture retained. No claim of physical TC26 or authenticated deployed-browser testing.
- Artifact verification using actual jsPDF 2.5.1 / XLSX 0.18.5: 180 rows, A4 Portrait PDF and Chromium Print each 3 pages; deliberately long Item Code/GTIN, 96-character mixed-case Batch, long Product Name/Operator preserved. Excel reopened with 180 rows, exact leading-zero text, Operator, full names, frozen heading, AutoFilter, styled header and Portrait print settings. Browser/printer preferences can override print defaults.
- Real simultaneous multi-device stress was not performed; existing server advisory/row locks and stale-version/retry checks were inspected/tested. No new concurrent mutation contract was introduced.

Business-data fingerprints before and after migration and rolled-back tests are identical:

| Object | Rows | Fingerprint |
| --- | ---: | --- |
| current state | 76 | 71514b70831795854133ab6e9e00a1a5 |
| events | 260 | e07b47bd4151be61c7452c42305b9dfc |
| operations | 192 | 6799ad66887717aa112f1097e0d33bbc |
| resolved snapshots | 27 | 81a16775d73ed87d1f74f088b9855974 |
| first Operator | 76 | 9f57ef9d41dd5df973256ebe242895d3 |

## Permanent Delete All blocker

Resolved entries are snapshots keyed to shared current_state IDs, not isolated operational aggregates. Live Staging has 11 un-restored snapshots, including 2 sharing an ACTIVE state; 9 state IDs have multiple resolution snapshots. Events, operation receipts/results, session corrections, immutable first-Operator provenance and Needs Review resolution audits refer to these same state/event identities. The review audit foreign keys explicitly RESTRICT deletion. Deleting only snapshots would fail the approved underlying-operational-record deletion requirement. Deleting entire state/event chains or cascading would risk active Inventory, other retained snapshots, review evidence, request-idempotency receipts and original attribution. No DELETE RPC, destructive migration or Delete All control was added; no user record was removed.

A separate decision must define deletion eligibility and retention for shared origins and immutable audit/receipt references before a deletion contract can be implemented safely. This is a blocker only to permanent Delete All; Restore All and other hotfixes can be tested now.

## Recovery and acceptance

Safe code rollback reference: b534ee115bf5919c121a4b9e039d571ead08491e. Revert the focused hotfix commit normally, without resetting or force-pushing newer work. Keep the additive Operator migration/system rows: captures may reference them. The prior application can use the same unchanged list signature and explicitly select an Operator. Do not drop system rows, metadata or audit; no automatic down migration. Production promotion requires separate authorization and assessment.

Product Owner: (1) TC26/PC default Operator → save immediately → next scan; choose a configured Operator and confirm it survives Save & Next. (2) Edit Quantity; use compact Remove and Restore All on disposable test records; confirm History and quantities. (3) Apply a table filter then Excel: all active rows/full identifiers/local times; PDF/Print: filtered complete A4 Portrait output; dismiss export errors/switch tabs. (4) KPI single selects, double adds, single replaces, × clears.

Status: READY FOR PRODUCT OWNER TEST for implemented changes; permanent Delete All remains BLOCKED. Physical TC26 acceptance remains pending. Final commit/deployment SHA and READY status are reported in the release response.
