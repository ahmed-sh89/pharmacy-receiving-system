# 2026-10-27 — Manage Orders import event-loss fix (Staging)

READY FOR TEST; authenticated Product Owner import/persistence acceptance pending. Branch `fix/manage-orders-import-staging-20261027`, baseline SEC-001 `cad393449889410c326e2b3ea71d90cfede2d5ca`; Staging only`tovkcakucyagvbzvlnks`. Production main/Pages remain`b618af9e0e55f30a616fd7e09eec9392ca6764c1`. No database/migration/alias/Auth/RLS changes.

Confirmed isolated-browser failure: native picker return focus starts existing permission revalidation; document capture guard silently stops order input/change during loading before bindCoreFileInputs. Handler0/Worker0/orders0/no toast; later recovery cannot replay selection. Preserve the normal ~1-second revalidation. Deliver selection to the async importer, wait for current permissions and require RECEIVING write access; fence pending work to original identity/pharmacy through parsing/Manifest/registry/source boundaries. Denied/readonly/scope changes fail visibly; no stale grants or extra permission polling. Prior parser-only test missed the real capture guard.

Evidence:81 focused Node tests PASS; Chromium old-guard event loss reproduced then fixed; real originals total12/62 with both2 source lines preserved. Negative readonly/403/identity and mid-Manifest refresh cases PASS in isolated fixtures. SEC-001 parser/Worker/SRI/date/mapping/export tests remain green. Existing Receiving Chromium regression PASS. Persistence/permissions mocked in browser fixtures; no live authenticated import, refresh or navigation PASS claimed. No available signed-in browser session; no operational data touched. Original private workbooks not committed.

Next: verify new Preview served SHA/config/artifact, then Product Owner runs one isolated Staging import→export→refresh→Expiry/Receiving scenario. Keep READY FOR TEST until accepted; do not merge Production. Details: `docs/manage-orders-import-20261027.md`.

---

# 2026-10-27 — SEC-001 Excel security remediation (isolated Staging)

Status: READY FOR TEST after exact Preview verification; NOT USER VERIFIED / DONE. Branch `fix/sec001-excel-parser-staging-20261027` from `50ef357c36c31269e7f209db27595215ab61c816`. Production main remains `b618af9e0e55f30a616fd7e09eec9392ca6764c1`; Production/database/aliases unchanged.

Replace xlsx0.18.5 with official vendored SheetJS CE0.20.3, SHA256 `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`, SHA384 SRI and Apache-2.0 attribution. Both current/nested entries select the patched artifact. Order/mapping/Master file reads share a dedicated worker with 32MiB input/128MiB declared expanded ZIP/64 sheets/250k rows per sheet/500k total rows/256 columns/4M cells/30s deadline. Reject rather than truncate. Exports retain XLSX API. Existing numeric Item Code canonicalization and all business/auth/Receiving rules unchanged.

Verification: 12 security/parser tests (both actual supplier files) plus44 existing Receiving/Handheld tests PASS; isolated actual Chromium file selection/Worker/Active Orders renderer/duplicate/invalid feedback PASS with persistence mocked and external network blocked; existing Receiving Chromium regression PASS; Staging build/diff checks PASS. Originals: TO-000529235 two lines/two items/total12; TO-000528294 two lines27+35/one item/total62; dates2026-10-26; old/new matrices identical. No real files committed. No authenticated Staging or Production writes; physical TC26/cross-PC persistence not newly verified. Separate signed-in Manage Orders blocker remains unclosed by fixture tests.

Next: verify the exact delivered Preview SHA, parser version0.20.3 and Staging ref`tovkcakucyagvbzvlnks`; Product Owner performs the minimal two-file/import/export/refresh acceptance. Do not use default pharmflow-test alias (Production), merge main, change routing or promote before separate approval. Details and exact commands: `docs/sec001-excel-parser-20261027.md`.

---

# 2026-10-26 — Receiving consolidation / captured Order resolution — Staging only

One operational row per pharmacy/Order/Item Code, original lines preserved. Corrected capacity allocation and direct scan path; queue retains every split receipt until acknowledged. Unique provable original Review Order no longer depends on unrelated selections; multiple/missing/conflicting cases remain guarded. Existing durable server intents retained; pinned retry plans and exact receipt matching prevent replay. Added explicit Order identity to live/Excel/PDF/saved full reports. No migrations or Production/Expiry writes. 44 focused tests, isolated Chromium, authenticated Staging SQL rollback checks and Preview build PASS. Physical/committed browser acceptance pending. See current checkpoint and docs/receiving-consolidation-20261026/README.md. Not USER VERIFIED/DONE.

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
