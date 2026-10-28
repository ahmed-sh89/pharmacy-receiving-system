## Final focused Staging refinements — 28 October 2026

READY FOR USER TEST — PRODUCTION UNCHANGED. Repeated-fingerprint blocker replaced with transactional V2 revision/count-once export and chunked XLSX Worker. Export Data moved beside Create; normal Loading text simplified with capsule unchanged; System Owner display Administrator only. 35 focused tests/builds and full-size 56,588/78,164 SQL/XLSX integrity checks PASS. Windows/browser-scale acceptance remains pending. Staging migration `20261028022820_owner_export_revision_stream_v2` only; actual Master 17/22 preserved, fixtures rolled back, SEC-007 unchanged. Production proposals/rollback refreshed, no promotion. Full evidence: `docs/staging-final-20261028/IMPLEMENTATION.md`.

## Accepted improvements selective release preparation — 28 October 2026

PREPARED FOR PRODUCTION APPROVAL — NOT DEPLOYED. HOLD: accepted Owner export has a Production-scale performance blocker; do not approve the full five-feature bundle yet. Product Owner marks Reports/search/filters/performance, Refresh/navigation, capsule/Reconnecting behavior, Owner Excel and compact Access actions USER VERIFIED — PASS on Staging. Production main stays `08843e42399b8830af6f0eb0773f04e0269cf0b6`.

Branch `release/accepted-improvements-prep-20261028` starts from Production and selectively carries accepted runtime only. Staging Vite binding/exception is excluded; Production config, Pages workflow, SEC-007, password handlers and Vercel main block unchanged. One export RPC apply/rollback is PREPARED ONLY under `proposals/accepted-improvements-release/`, not applied migrations. No Production database/Auth/Edge/business-data or main/deployment change.

Actual Global Master 56,588/78,164; current exporter makes 183 pages with repeated full-data hashing. Read-only fingerprint sample 2,321.66ms → estimated 7.1min hashing per complete export, not a full-run timing. Synthetic full-size workbook/count/text test PASS; server scalability remains a blocker. Exact gate, tests, deployment/rollback sequence and next approval decision: [release preparation](docs/releases/ACCEPTED_IMPROVEMENTS_PREP_20261028.md). Next: approve focused Staging export optimization or explicitly exclude export from this bundle. DATA-001, Azinc, Pharmacy Code and SEC-009 remain excluded.

## Production selective security release — 28 October 2026

Status: DEPLOYED — READY FOR USER VERIFICATION. Security program NOT CLOSED.
Approved source e7c53750ebc6eedf07c4fa11db5543e1578f13cf plus approved main-only Vercel Git block 7a4d33398ca2c1a6a5cbc6d2ec2198695443ead2 merged via PR #31. Runtime release merge c7000c6065cbaf7b5e72cb5051d055bc9f3e7c26; Pages run 40608374725 successful. Later documentation-only commits retain identical runtime files except the deployed SHA stamp; exact final served SHA belongs in the execution result.
Vercel root config contains only git.deploymentEnabled.main=false; unspecified Preview branches remain enabled. No automatic Vercel deployment exists for the release main merge. Existing retired aliases/routing unchanged.
Production backend from previous authorized phase: password-admin v6 and settings-rc v4; exact approved source, SDK2.118.0, JWT true; unauthenticated requests401. SEC-007 migration20261028001737 applied; fixed body MD5 99bda52f1b8577ac07f5c0d81bdbd8f7, postgres owner, ACL and execution settings unchanged. Neither backend deployment nor migration repeated during continuation.
Production Pro confirmed; Leaked Password Protection DISABLED per Supabase advisory and unchanged. SEC-006 remains OPEN pending separate policy approval/verification. SEC-009 unapplied.
Focused push CI40608264523 and PR CI40608269505 successful; 41 tests/build/audit zero. Local build and41 tests PASS. Live official Pages HTML SHA/Production binding/SRI/scripts/CSS/Worker/parser/font and source-artifact exclusions checked; exact counts recorded in execution report. Signed-out browser startup reaches Sign in; no application-origin error observed (one browser-extension metadata error is unrelated).
NO authenticated Production browser session available: actual login/session restoration, Receiving/existing orders/Manage Orders, Reports/export flows, Expiry/Needs Review, Settings and cross-pharmacy/isolation acceptance NOT newly performed. No operational writes/password changes/test identities. Physical Zebra and actual multi-PC sync remain pending. Prior owner Staging smoke PASS retained only for tested scope.
SEC-002/003/005/006/009/012/013 remain outstanding; no whole-audit closure. EXPIRY-SAVE-001 OPEN; PERF-001/UX-001 deferred. Production runtime business logic/config and operational data preserved. Exact next action: Product Owner non-destructive signed-in Production smoke; report PASS or failing screen. No repeated password test or database administration requested.

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

# 2026-10-22 — Authorized Production Quick Add release

Accepted source: `7510cbcdb73a9f2a53d2b615db858e3036f91ffe`. Selective runtime promotion on Production baseline `4b3fe2e03d438ba5d462d5eabae0a6446884e125`; Production Supabase configuration preserved. Quick Add, Group display/style, V2 metrics and selected-item UX only. No Expiry/Handheld source changes.

Production migrations applied and catalog/data gate PASS: 01 `20261022203926`, 02 `20261022204003`, 05 `20261022204234`, 07 `20261022204251`. Current hardened RPCs, RLS, ACLs, constraints and aggregate operational counts unchanged. No operational records created or modified. 00/03/04/06 excluded.

Nine new RPC bodies match accepted Staging tokens; signatures and grants verified. Previously accepted focused tests remain valid. Final deployment SHA, Pages workflow and read-only smoke evidence are recorded in the accompanying Production release report; this source checkpoint does not claim deployment success before activation. Recovery: restore baseline frontend only, retaining additive database contracts and data.

# 2026-10-20 — Report Quantity alignment

Centered Quantity header/data in Excel, PDF and Browser Print. Preserved report geometry, data/scope, date hierarchy and real mm/yyyy expiry cells. Generated artifact, Chromium and focused regression/build checks PASS. Staging only; no SQL.

# 2026-10-20 — Final Expiry acceptance fixes

Real Excel expiry dates and compact landscape reports; anchored row menus, canonical Group tables, original-Operator filter and durable selected Clear/Restore. Staging migration 20261020045631_expiry_acceptance_reports_filters_v1 changes read contracts only. 252 focused tests/build plus authenticated rollback SQL and Chromium/artifact checks PASS; original data fingerprints unchanged. See docs/expiry-final-acceptance-verification.md. Physical/Excel/two-PC acceptance pending. Production untouched.

# PharmFlow Changelog

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


## 2026-10-11 — Expiry final acceptance preparation
- Bounded private evidence-photo fetches and image decode. Failed, missing, or corrupt photos now exit loading and expose a retry control; the bucket and authenticated access path remain private.
- Same-pharmacy auth-context refresh no longer disables a previously verified Needs Review tab during transient network failures. RPC authorization remains server-enforced.
- Keyboard tab movement and closing Needs Review avoid focus-driven scroll changes.
- Confirmed current Excel export uses the same server-side search results and local filters as the Inventory table. No approved Expiry PDF/report format was found in the source records; no substitute format was added.
- Deployed candidate code commit `10af4f27c48d323d51dd6f4b819fca3416c855fd` to Staging Preview `dpl_8fXEzLivCJi9MrniMykmRaMLUpe8` (READY, Preview). HHP084 authenticated Staging membership was positively matched to synthetic pharmacy `11111111-1111-4111-8111-111111111111`.
- Updated Preview reached ONLINE / READY / SYNCED; Needs Review stayed enabled after 30 seconds idle. Existing private test image loaded and opened, but the stored fixture is a solid red placeholder rather than a representative camera photo. No HHP review case or Storage object changed; scheduler remains paused.
- Focused Expiry tests pass. Full suite remains 31 passed / 10 known baseline failures.

## 2026-10-11 — Staging connectivity recovery and Expiry local resolution
- Recovered Staging startup/read compatibility for auth setup, pharmacy registration/assignment, application context, Active Order Manifest, workspace generation, and Receiving delta reads.
- Applied additive Staging migrations for pharmacy-local Expiry review resolution and missing authenticated, tenant-scoped workspace/manifest/Receiving ledger writes. No data backfill or operational test transaction was performed; the photo cleanup scheduler remains paused.
- Preserved Global Master elevated write authorization. Expiry review resolution now creates only a pharmacy-local identifier mapping and commits the review, current inventory state, event, and audit atomically.
- Fixed the modified Needs Review template syntax and cache-busted the affected Expiry scripts.
- Authenticated existing Preview smoke showed ONLINE / SYNCED on SYNTHETIC-B. Final corrected candidate Preview is pending branch deployment.
- Full test suite: 31 passed, 10 known baseline failures unchanged. Focused Expiry and startup fixture tests pass; build and syntax checks pass.
- Destructive manifest clear/reset RPCs remain absent due missing source dependencies and are outside this non-destructive connectivity step.

## B10 Clean22
- Removed generic files:updated ownership of full cloud-workspace writes.
- Preserved structural manifest dirty sync and explicit lifecycle workspace persistence.
- Added cache-bust for cloud-workspace.js.


## 2026-10-13 — Expiry Round 2 — local candidate, not deployed

Saved two top-level tabs, current-session batch projection, summary/status and canonical scoped UI refinements. Group dialogs preview only; missing atomic grouped RPC blocks writes. No live data/schema changes. Browser authentication blocks rendered verification and release. See docs/expiry-round2-verification.md.


## 2026-10-14 — Approved Enterprise Expiry refinement

Canonical compact toolbar/enterprise navigation, unified scanning workspace, readable scan/search identification and six-column session table. Removed unused grouped preview dialog; grouped actions disabled. Prepared proposed atomic SQL and local tests, NOT applied to Supabase. Inventory/Receiving/Handheld protected.


Verified runtime de845b5c0e813747054495a07de68af3e61b8201 READY on pharmflow-test Preview. New browser login wall prevents authenticated visual QA;1363x936 available,1366x768/larger UNVERIFIED. No Supabase changes.


## 2026-10-14 — Final focused polish / Serial-safe group review

RenameTotalItems, larger distinct metric values; remove scanning-purple emphasis; blue/neutral search hover distinct from keyboard selection; grouped Expiry controls. Correct proposed group quantity increase via serial-free contribution using existing signed save RPC. No liveDBmigration/RPC/data change; group controls disabled.

## 2026-10-17 — Global Master Group Gate B preparation
- Added mandatory six-value Group controls only for verified new Global Item creation paths; existing-item barcode linking remains prompt-free.
- Added versioned authenticated Receiving-learning RPC contract and server-side Group validation package with a restricted before-image audit.
- Prepared safe legacy normalization and the 61 Product Owner classifications in `PHASE2C1173_GLOBAL_MASTER_GROUP_INTEGRITY.sql`.
- Corrected Receiving/report Group derivation to use validated main Groups; Hair Care and other subordinate categories cannot become Groups.
- Production SQL and deployment remain unapproved and unexecuted. Expiry remains untouched.

## 2026-10-18 — Expiry Needs Review V2 (Staging)
- Added Desktop Resolve Now after durable UNKNOWN capture, and a shared Existing Item / Create New Item resolution experience for Pending cases.
- Added transactional authorized Global linking/creation plus existing pharmacy-local Expiry resolution; retained original capture, audit, identifier lists and retry identity.
- Applied Staging migration 20261018185307_expiry_review_transactional_resolution_v2: six canonical Groups enforced on creation; seven Receiving mutators reject Expiry records. No role, policy, or operational-data migration.
- SQL fixtures, live rollback-only SQL verification, UI fixtures and build pass. Full-suite historical failures are compared against ce877ddd, not treated as new failures. Browser/physical-device acceptance tracked separately.


## 2026-10-28 — Consolidated selective Production preparation

All Staging improvements through97c7385 are Product Owner USER VERIFIED within tested scenarios. Production main/served08843e4 unchanged. Production-based release includes accepted startup, ExportV2, labels/Loading/Access, Reports, final Receiving toolbar and canonical Group.51 focusedPASS/buildPASS; final guarded SQL apply/rollback2PASS; full-size56588/78164 XLSX183requests. Live Supabase preflight unavailable (Unknown tool); concurrent writer lock impact and full-size Windows/Excel limits remain OPEN gates. No deployment or migration. Authoritative inventory, hashes, limitations, release/rollback/smoke sequence: docs/releases/ACCEPTED_IMPROVEMENTS_PREP_20261028.md. PREPARED FOR PRODUCTION APPROVAL — NOT DEPLOYED; final approval blocked pending gates.


## 2026-10-28 — Resumed export blocker correction

Production read-only schema/RLS/SEC007 compatibilityPASS after correcting malformed connection identifier. Staging migration20261028141551 switches revision triggers to BEFORE STATEMENT;17Items/22Identifiers/revision1 preserved. Owner/non-owner/revoked/session/mutation/rollback checksPASS. Existing real PostgreSQL concurrency proof reused;6 affected testsPASS,51 priorPASS retained. Production apply/rollback revised to BEFORE, no runtime/UI changes. Windows Chrome/Excel full-size result remainsOPEN. Details/hashes: docs/releases/ACCEPTED_IMPROVEMENTS_PREP_20261028.md. No Production writes/merges/deployments.
