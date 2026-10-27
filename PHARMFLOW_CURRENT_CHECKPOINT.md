# 2026-10-27 — Production publication verified

**DEPLOYED — READY FOR USER TEST.** Not USER VERIFIED or DONE.

Runtime release commit `4c9de95ee88e79dc86bac7bbd97d7ef1663cb198`; previous Production/rollback `b618af9e0e55f30a616fd7e09eec9392ca6764c1`. Accepted Staging `12764f8044acc83108ea0d31d6cc6ac6891ae3b8`; integration branch `release/receiving-security-production-20261027`. GitHub Pages run40500905826 completed successfully. Live Production version.json matches runtime release; Production Supabase `zznoshzcyxmtwfbznjyr`, original CSP/build guard retained. This follow-up changes documentation only; its own served deployment SHA is recorded in the durable final release report.

Integrated99 focused tests, three isolated Chromium regressions, Production build and actual main/nested Pages-path Worker parsing checks PASS. Live main/nested parser/Worker/security/modal/config assets match tested bytes. Actual Production browser reaches Sign In. No signed-in Production session available: Receiving/Manifest/order quantities/Needs Review/Expiry inside an authenticated account, operational writes and live second-PC synchronization are NOT newly verified. Product Owner accepted Staging scope remains recorded. No database writes/migrations or operational changes performed. No rollback needed.

Exact Product Owner smoke: sign in on Production; confirm existing Receiving orders/quantities, open Manage Orders and verify saved assignment indicators, then open Needs Review and Expiry and refresh. No reset/reimport/reassignment or artificial receiving write is needed. Observe the next legitimate receiving action separately. If an operational regression appears, use the documented normal reverting-commit rollback; no force push/data restoration. Existing unrelated scheduled photo-cleanup failures require separate investigation and were not changed here.

---

# 2026-10-27 — Approved Production Receiving/security release preparation

Production integration base/rollback `b618af9e0e55f30a616fd7e09eec9392ca6764c1`; accepted Staging `12764f8044acc83108ea0d31d6cc6ac6891ae3b8`. Integration branch `release/receiving-security-production-20261027`. Product Owner authorized conditional publication; this entry records pre-publication gates. Final publication verification is recorded in the release handoff and subsequent checkpoint closure. Not USER VERIFIED or DONE on Production.

Selective approved Receiving consolidation/Needs Review provenance, SheetJS CE0.20.3 vendored parser/secure Worker/limits, file-picker permission race, fast Manifest restoration and compact per-order Handheld assignment. Production Supabase/CSP/build guards/Auth/Expiry/Global GTIN/package lock/workflow preserved. No migrations, backend changes or live operational mutations. Original source rows/receiving ledger preserved; no archive backfill.

Integrated source99 Node tests PASS; real supplier totals12/62 and source lines preserved. Three isolated Chromium suites PASS; Production configuration build PASS. Pages-path/main+nested entry actual Worker/CSP checks recorded in release evidence. Fixtures are isolated, no live authenticated writes or second-PC verification claimed. Product Owner Staging acceptance retained, including Needs Review relinking; explained test-mapping notice not reopened.

Rollback: normal reverting commit to the base frontend tree/config, never force push or database restore. Current Production dependencies202 definitions unchanged from preflight; no migration needed. Pages deployment40309394685 successfully published rollback SHA. Existing scheduled photo-cleanup failures are separate from successful Pages deployment and were not modified.

---

# 2026-10-26 — Approved Inventory Production promotion

Starting Production/rollback: `ca7d575066af3f82c849511718aa113f58c377cd`. Accepted Staging implementation: `8240d267302f6057de7b9d4c33a8fbeeca627e47`. Product Owner confirmed eight KPIs/filtering, corrected Actions, persistent selection, three-second save emphasis, real edit persistence and repeated Actions. Prior authenticated Staging HOLD is removed by this explicit acceptance. Final deployment SHA is recorded in delivery and Pages metadata.

Selective integration onto verified current main: Desktop Inventory JS, filter helper, CSS, cache versions and focused tests. Production Supabase/CSP/build configuration retained. Auth, permissions, Sleep/Wake, Receiving, Handheld and database contracts unchanged. No migrations or live inventory edits. EXPIRY-PERF-01: approximately two-second Edit/Delete confirmation latency accepted as non-blocking; deferred, not implemented.

Root cause fixed: refresh replaced Actions buttons while busy; resetting only the flag left DOM buttons disabled. Mutation-state transitions now synchronize current controls. Stable row_id selection and three-second static blue success emphasis preserve selection through rendering, pagination and filtering; failures never flash. Existing frozen requests/version checks remain; duplicate/stale completion guarded.

Focused verification: 91 PASS/one existing native multi-connection SKIP; Chromium isolated repeated-edit and KPI suites PASS; Production build/syntax/diff checks PASS. Known baseline Group-label and missing-history negative-control failures remain outside the selected passing suite; no full-suite green claim. Local PostgreSQL/mock readback complements Product Owner Staging acceptance; no automated Production quantity writes.

Release status after successful deployment: DEPLOYED — AWAITING PRODUCT OWNER VERIFICATION. Verify served SHA, exact approved assets and Production project configuration before claiming deployment. Rollback frontend via a new reverting commit to the starting Production tree, preserving database/data. Next Product Owner check: Production Inventory shows eight KPIs; select a Product Name and verify persistent highlight, open/cancel Actions and check filters/navigation. Observe the next legitimate operational save for responsive Actions and three-second highlight; do not create an artificial Production edit. Not USER VERIFIED or DONE.

---

# 2026-10-26 — Expiry resume recovery (Phase A)

Production baseline/rollback: `e452f22e372ad94607ab73cc2c05efb47056bce9`. Product Owner verification: navigation recovery PASS; Expiry workspace recovery FAILED on that baseline. Overall Sleep/wake is NOT DONE.

Focused Desktop recovery hotfix prepared and tested: [Phase A evidence](docs/expiry-resume-hotfix-20261026.md). Status READY FOR USER VERIFICATION after conditional publication and served-version verification. Preserve the selected Expiry view, filters, scanner input, quantities and correction journals; no database or role changes.

Exact next actions: verify Phase A Production publication, then develop monthly Inventory KPIs on a separate Staging-only Preview branch. Do not merge that KPI work into Production. Physical Sleep/wake with Scan & Activity and Inventory remains pending Product Owner acceptance. Earlier records below are historical.

---

# 2026-10-22 — Authorized Production Quick Add release

Accepted source: `7510cbcdb73a9f2a53d2b615db858e3036f91ffe`. Selective runtime promotion on Production baseline `4b3fe2e03d438ba5d462d5eabae0a6446884e125`; Production Supabase configuration preserved. Quick Add, Group display/style, V2 metrics and selected-item UX only. No Expiry/Handheld source changes.

Production migrations applied and catalog/data gate PASS: 01 `20261022203926`, 02 `20261022204003`, 05 `20261022204234`, 07 `20261022204251`. Current hardened RPCs, RLS, ACLs, constraints and aggregate operational counts unchanged. No operational records created or modified. 00/03/04/06 excluded.

Nine new RPC bodies match accepted Staging tokens; signatures and grants verified. Previously accepted focused tests remain valid. Final deployment SHA, Pages workflow and read-only smoke evidence are recorded in the accompanying Production release report; this source checkpoint does not claim deployment success before activation. Recovery: restore baseline frontend only, retaining additive database contracts and data.

# PharmFlow current Staging checkpoint

## 2026-10-20 — Report Quantity alignment

Baseline d7a46fcb6899d7a0c2d2eb7fd7465f44425b2c98. Quantity header and values centered in Excel/PDF/Print only. Date hierarchy and real mm/yyyy expiry cells unchanged; widths, heights, fonts, A4 Landscape and pagination preserved. Generated 180-row XLSX verified (all Quantity styles centered), actual PDF/Chromium Print rendered and inspected; PDF remains five pages with 41/45/45/45/4 rows. Focused report/regression tests and build PASS. No SQL or Production access. Physical Excel/printer acceptance pending. READY FOR PRODUCT OWNER TEST.

## 2026-10-20 — Final Expiry acceptance fixes

Baseline 788e60db49cb140e048711898cb6f677cfe30917. Real Excel month dates, compact A4 Landscape reports, exact-trigger row menu, canonical Group in Session, readable columns, colored filters plus first-Operator multiselect, and Restore/Clear Selected. Applied Staging read-only-contract migration 20261020045631_expiry_acceptance_reports_filters_v1; no operational data/attribution/RLS changes.

252 focused tests/build PASS; authenticated rollback-only SQL and real Chromium/artifact verification PASS. Data fingerprints unchanged, toolbar y=242px retained, no Desktop table horizontal overflow at 1366×768. Excel UI/physical TC26/two-PC acceptance pending. Evidence and non-destructive recovery: docs/expiry-final-acceptance-verification.md and docs/expiry-final-acceptance-recovery.sql. Production untouched. Status READY FOR PRODUCT OWNER TEST, not DONE.

## 2026-10-20 — Resolved Clear All

Product Owner withdrew permanent Delete All. Added Clear All beside Restore All in the existing Resolved list, with one counted confirmation and durable pharmacy-scoped cleared markers. Retains all history, quantities, original Operators and Needs Review. Applied Staging migration 20261020015824_expiry_resolved_clear_v1; existing RPC signature preserved. Baseline cf48360748cd36e291b8fc2d94ba3abecd153370.

246 focused tests/build PASS; authenticated rollback-only SQL and committed isolated-fixture persistence/retry/order checks PASS. Original user-data fingerprints unchanged. Two QA captures and three resolution snapshots retained as history, with no active/visible test rows. Real parallel SQL overlap could not be proven because the connector serialized requests; two-PC acceptance remains pending. Chromium source-fixture visual review PASS. Evidence/recovery: docs/expiry-resolved-clear-verification.md. Status READY FOR PRODUCT OWNER TEST, not DONE. Production untouched.

## 2026-10-20 — Expiry acceptance hotfix 01–08

Baseline b534ee115bf5919c121a4b9e039d571ead08491e; existing Staging only. Device-default real Operators, compact quantities/action menu, one-confirmation Remove, complete A4 PDF/Print, dismissible scoped notifications, full active Inventory Excel, Restore All, and single/double-click KPI selection. Applied 20261020013030_expiry_operator_device_defaults_v1. Existing operational rows/fingerprints unchanged.

240 focused tests and build PASS; rollback-only authenticated SQL and Chromium/artifact verification PASS. Table top y=242px retained. Permanent Delete All is BLOCKED by shared active/history state and restrictive audit dependencies; no deletion was implemented or performed. Physical TC26 acceptance pending. Full evidence/recovery: docs/expiry-hotfix-01-08-verification.md. Status READY FOR PRODUCT OWNER TEST for implemented changes, not DONE. Production untouched.

## 2026-10-20 — Staging final Expiry hardening

Scope: approved eight-stage implementation on fix/staging-preview-splash-css-path. Baseline ea11911fc27d52c3c6efc6ec4e809130070b2360; Production/main and Production Supabase were not accessed. The existing branch Preview remains the release target.

Implemented: persistent red unknown-item warning; absolute token-refresh deadline, pre-scan recovery and late-refresh logout guard; proven GS1 field locks in History and server correction; existing pharmacy Operator management with authenticated administrator checks; unified 520px Desktop correction dialogs; stable in-place Needs Review with bounded search/photo layout; A4 Portrait PDF/Excel/named-page Print; durable first-Operator projection and keyboard-accessible floating Actions menu.

Operator attribution uses original operation provenance, including delayed review resolution and corrected/re-keyed groups. Timestamp/event-ID ties have a deterministic order. Inactive Operator references and original names remain in audit. New captures require an active selected Operator on Desktop and Handheld. Older corrected records without provable field provenance remain conservatively editable; new verified GS1 locks persist across quantity edits. No original scan payloads are rewritten.

Applied Staging migrations (exact SQL in supabase/migrations):
- 20261019224613_expiry_gs1_source_locks
- 20261019224744_expiry_operator_management
- 20261019225005_expiry_first_operator_attribution
- 20261019225913_expiry_locked_batch_original_text
- 20261019230034_expiry_historical_operator_reference
- 20261019230300_expiry_original_scan_operator_origin
- 20261019230341_expiry_corrected_group_operator_origin
- 20261019230852_expiry_correction_field_provenance

Verification: 274 focused automated tests PASS; production build PASS. Staging authenticated-role SQL simulation in tests/expiry-hardening-staging.sql PASS with all test writes rolled back: authorization, duplicate names, inactive Operators, GS1 tamper denial and persistent locks, ordinary edit/re-key, case-insensitive Batch quantities, first attribution after deletion/rename, delayed Needs Review resolution, and idempotent retries. Anon has no management EXECUTE; private helpers/tables remain inaccessible to anon/authenticated and RLS enabled. Existing states/events/operations fingerprints stayed exactly unchanged (73 / 248 / 187 rows).

Actual local Chromium source-fixture inspection: four Desktop dialog types, stable review overlay through resolution, private-photo presentation with synthetic evidence, 1366x768 Inventory and 360x640 Handheld. Search y=242px and workspace height=541px unchanged; Handheld warning remains red in ready state, Serial hidden and Save visible. This is not authenticated deployed-browser or physical TC26 acceptance. Long Operator names use an ellipsis with the complete value in title; no data is truncated.

Actual report artifacts: 180 rows, PDF A4 Portrait 595.28x841.89pt, 3 pages [75,75,30]; Chromium Print A4 Portrait, 3 pages; Excel reopened with all 180 rows, full values, filters, frozen/repeated heading and fit-width Portrait settings. Named Expiry print page leaves the pre-existing default page rule unchanged. Browser/printer settings can override defaults.

Known baseline test failures: Settings barcode-management subset 8 PASS / 1 FAIL; the failing new-item handler-regex test was reproduced against ea11911 source (it cannot find the handler). The older operational-UX report test expects a superseded column list. These are not marked green or silently rewritten. Full historical suite was not run; prior baseline failures are not claimed resolved.

Pending physical acceptance: 30–60 minute TC26 idle/recovery and first scan; revoked real login and logout; scan/save/scan focus chain; Operator synchronization between actual devices; real attached-photo resolution and printed-paper readability. Real parallel multi-device commit stress is not claimed: SQL idempotent retries and existing advisory/row lock paths were verified, not a concurrent load exercise.

Recovery: baseline ea11911 and docs/expiry-hardening-20261020-recovery.sql.txt. Recovery SQL is reference-only, not executed; metadata, Operators and audit are retained. Reverting frontend alone does not undo server-required Operator selection. Pause Expiry writes and review the documented recovery transaction before a separately approved rollback. No Production promotion is authorized.

Status: READY FOR PRODUCT OWNER ACCEPTANCE — NOT DONE, conditional on final Preview READY/SHA verification recorded in the delivery response.

---

# PharmFlow isolated integration checkpoint — 15 October 2026

Scope: candidate preparation ONLY; no push, branch promotion, deploy or database action authorized.
Branch: integration/production-expiry-20261015, derived from exact Expiry93fba99a87c5c5a981cddbcef5555033e46ed5d8; merge complete Production26da5078163f69ca76a9169dd8d97365d7ba6c54. Merge base036ff5c7de988e5db06de1a2ddf779daef814164.

Four conflicts explicitly resolved: three entry/cache/script loading blocks; cloud manifest reset combines both states. Additional proven integration fix moves syncPromise cleanup past initialization for synchronous empty-manifest return. Version refresh now guards pending Expiry work alongside Receiving.

Verification: full755 tests/712PASS/42FAIL/1SKIP; all failure names reproduced on exact baseline(s), zero new failures. Focused619PASS/0FAIL. Production build and diff check PASS. Expiry modules and sensitive non-overlap owners byte-for-byte preserved. Full evidence and baseline failure list: docs/production-expiry-integration-review.md.

Status: candidate prepared for review; full suite is NOT green.42 baseline failures remain documented; physical operational behavior READY FOR USER TEST, not DONE. Next: Product Owner reviews merge and known test limitations before any separate approval for Staging integration. No approval yet to touch original Expiry/main or deployed Preview.

Protect: Production Receiving barcode/KPI/duplicate-line/filter/over-received/idle/version hotfixes; accepted Expiry Save optimizations/durable retries/green flash/search border/diagnostic removal/Handheld/Serial/Batch/history; account isolation and no SQL changes. Clear Session stays retired. Original local dirty worktree preserved separately and must never be reset.

---

# PharmFlow Global Master Group Integrity — Gate B Preparation

**Status:** Code implementation prepared in an isolated local branch. Production SQL and deployment are not approved and were not executed.

## Verified baseline

- Repository: `ahmed-sh89/pharmacy-receiving-system`
- Reverified remote `main`: `26da5078163f69ca76a9169dd8d97365d7ba6c54`
- Latest GitHub Pages workflow: run `38631263079`, success for that SHA (14 October 2026).
- Production Supabase: `zznoshzcyxmtwfbznjyr`
- Latest recorded Production migration: `20261015022216_pharmflow_approved_import_20261015_rpc`.
- Fresh clone is clean at the same SHA before edits. Working branch: `fix/global-master-approved-groups-20261016`.
- No Production SQL, schema, item data, or deployed app was modified. Expiry sources were not edited.

## Fresh Production Group audit

| Measure | Current verified value |
|---|---:|
| Global Master V2 items | 56,575 |
| Valid populated `group_name` | 3,720 |
| Blank `group_name` | 52,855 |
| Blank Group with an approved main Group in `category` | 52,792 |
| └ already canonical legacy category values | 52,766 |
| └ `BEAUTY` / `beauty` values normalized to `Beauty` in `group_name` | 26 |
| Unresolved after approved category fallback | 63 |
| Invalid nonblank `group_name` | 0 |

The total is one less than Gate A's 56,576 baseline. The Product Owner confirmed National Day Gift Card (`9999982`) was intentionally deleted through Settings. It is absent from Global Master and excluded from classification; do not restore, reclassify, or investigate its deletion further unless a new material integrity issue appears.

`PFTEST002` and `PFTEST003` exist with blank Group and no classification values. Preserve both. Current total = 56,575, so after 61 reviewed assignments and 52,792 legacy normalizations, the expected state is 56,573 approved Groups and two preserved unresolved records, subject to a fresh preflight. The former expectation of three unresolved records is stale because `9999982` is currently absent.

## Approved workbook reconciliation

The uploaded workbook copy `PHARMFLOW_GLOBAL_MASTER_UNRESOLVED_GROUP_REVIEW_20261017(3).xlsx` matches the approved 61/3 distribution in the Product Owner note. Values were read from its Approved Group column and matched to Production by exact `item_code` plus `item_name`, not row position. All 61 approved codes exist exactly once, have blank Group, and have no pre-existing conflicting approved classification.

| Product Owner label | Approved rows | Stored canonical value |
|---|---:|---|
| Medicine | 22 | Medicine |
| FMCG | 14 | FMCG |
| Beauty | 12 | Beauty |
| Home Health | 9 | HomeHealth |
| Supplement | 4 | Supplement |
| **Total** | **61** | |

Three workbook rows remain blank: `PFTEST002`, `PFTEST003`, `9999982`. The two PFTEST items remain present legacy exceptions. `9999982` was intentionally deleted and is absent; it will not be restored or classified.

## HomeHealth naming decision

Store one canonical value, `HomeHealth`, to remain compatible with Production data and existing interfaces. Show the Product Owner's approved readable label, `Home Health`, in selectors, filters, Receiving rows, and exports. The SQL normalizer accepts either spelling and writes only the canonical value. This avoids mixed stored values while implementing the preferred display name. The allowed set remains exactly six Groups.

## Root cause and correction

- `create_pharmflow_global_item_v2` currently permits null `group_name`.
- Production `learn_pharmflow_identifier_v1` currently auto-creates a missing reference-pharmacy Global Item by calling `create_pharmflow_global_item_and_learn_v1` with three null classification values.
- The Settings Barcode Control creation form sends no Group.
- `PharmFlowClassificationFilters` uses any `category` value as a Group and derives choices from arbitrary data; subordinate values can leak into the Group filter.

Prepared code adds a controlled selector to new Global creation, uses a versioned Receiving-learning RPC, and changes the old learning RPC into a compatibility delegate. Existing Global items continue through the no-Group link path; the reference-pharmacy creation branch alone requires Group. Pharmacy-scoped mappings keep their existing scope. Needs Review remains Group-free. The database creation RPC validates Group server-side and keeps current authentication, HHP084, operation-ID, locking, identifier uniqueness, idempotency, and audit checks. No broad table NOT NULL constraint is introduced.

## SQL package and impact

- SQL: `PHASE2C1173_GLOBAL_MASTER_GROUP_INTEGRITY.sql`
- It is one transaction containing the approved-Group normalizer, creation enforcement, compatible `learn_v1` wrapper, new `learn_v2`, a locked/audited Group normalization, and 61 explicit workbook assignments.
- The legacy pass changes `group_name` only when existing `group_name` is blank and `category` is exactly a normalized approved main Group. It also normalizes equivalent approved `group_name` casing/whitespace. It never replaces subordinate `category` or `sub_category`.
- The 61 explicit mappings are pinned in the SQL with names and exact item codes. The migration checks the 61-item set, names, existing classification conflicts, current invalid Groups, and post-update preservation. Errors roll back the entire transaction.
- It adds a restricted, RLS-enabled before-image audit table. There are no new direct client grants.
- Expected writes: at most 52,853 `group_name` values (52,766 canonical legacy categories + 26 case-normalized legacy categories + 61 reviewed assignments); no item/identifier/transaction rows are inserted or deleted. The migration aborts if its exact 56,575-item baseline differs from 3,720 canonical Groups, 52,792 recognized legacy categories, 63 unresolved items, or the 26 case variants.

**Impact:** A transaction updating roughly 52.9k rows will hold row locks and generate WAL. Schedule the eventual approved run in a controlled window, take/confirm a recoverable backup, and capture baseline counts. The migration does not change search indexes or receiving quantity data. Since this is a SQL package, its execution remains blocked pending explicit approval of this exact file.

**Recovery:** Any SQL error rolls the single transaction back. After commit, keep audit evidence. First roll back the client release if needed; do not remove the Group validator or loosen server enforcement. Before any data recovery, compare current rows to the audit table and restore only rows whose current Group still equals the migration's `new_group_name`; do not overwrite subsequent edits. A recovery SQL file must be reviewed against live rows at that time.

## Expiry integration contract

Expiry remains untouched and is not part of this Production release. Its future integration must read and validate canonical `group_name` first, accept a validated legacy `category` fallback only when it normalizes to one of the six main Groups, and never treat Hair Care/Skin Care/Makeup & Accessories as Groups. Require Group only for actual new Global Item creation; existing-item identifier linking and Needs Review submission remain Group-free.

## Runtime and release gates

No SQL package was executed, no Production data changed, and no Production deploy was made. Isolated SQL/RPC/authentication tests were blocked because supplied Staging project `tovkcakucyagvbzvlnks` returned permission denied for project details and read-only SQL. No Staging data was modified. The preferred release sequence is the reviewed SQL migration followed promptly by the app deploy, because the client uses `learn_pharmflow_identifier_v2`; during a migration/deploy gap, old clients fail closed for new Global Item creation but keep existing-item linking. See `PHASE2C1173_GLOBAL_MASTER_GROUP_INTEGRITY_RECOVERY.md` for the distinct data and RPC recovery rules.

See `PHARMFLOW_GLOBAL_GROUP_GATE_B_TEST_MATRIX.md`, `PHARMFLOW_GLOBAL_GROUP_GATE_B_DECISIONS.md`, and `PHARMFLOW_GLOBAL_GROUP_GATE_B_CHANGELOG.md` for detailed status.

## 2026-10-28 — consolidated security source candidate

Production NOT READY for security release; main6da2af6b unchanged. Branch security/source-hardening-staging-20261028 prepares SEC-008 patched lockfile (Vite8.2.4,nanoid3.3.20,source-map-js1.2.2; audit0), SEC-012 CI pins, SEC-005 active-script SRI and SEC-011 dormant CSV neutralization.17 focused tests/clean install/build/isolated browser SRI QR+PDF pass.4 additional existing Global/Expiry Group assertions also fail on untouched baseline; not hidden or repaired. No app Preview/alias/DB/Auth/Production change. Branch auto-Preview disabled; live stable URL remains unsafe for testing. SEC-002 BLOCKED; SEC-003 PARTIALLY VERIFIED; SEC-004 authenticated acceptance BLOCKED (prior16/401 evidence retained), Production legacyv3 still unpatched. Remaining findings stay OPEN/REQUIRES VERIFICATION; see docs/security/CONSOLIDATED_SECURITY_PROGRAM_20261028.md for all13 statuses, admin links, single acceptance checklist and separately authorized release plan. EXPIRY-SAVE-001 OPEN, no data correction.
