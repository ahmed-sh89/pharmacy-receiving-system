## Consolidated Staging work — 28 October 2026

Partial delivery on `feature/consolidated-staging-20261028`, baseline `08843e4`. Production unchanged. PERF/UX, Owner Excel export and compact Access actions implemented; Pharmacy Code edit already supported, UUID preserved, HHP084 protected. DATA-001 and EXPIRY-SAVE-001 remain OPEN. One Staging migration `20261028012722_owner_global_items_export_v1`; no operational writes retained. See [implementation/test evidence](docs/staging-20261028/IMPLEMENTATION.md) and [deployment](docs/staging-20261028/DEPLOYMENT.md) for exact verification and limits. Prior security-release acceptance is USER VERIFIED per Product Owner for the workflows tested; outstanding security findings remain outstanding.

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

# B10 Clean17 Test Matrix

## 2026-10-11 Final Expiry candidate — Staging Preview

- [x] Candidate code commit `10af4f27c48d323d51dd6f4b819fca3416c855fd` deployed to Vercel Preview `dpl_8fXEzLivCJi9MrniMykmRaMLUpe8` (READY, target Preview/null); Staging project URL remains `https://tovkcakucyagvbzvlnks.supabase.co`.
- [x] HHP084 account `tc26-expiry@example.invalid` (staff) matched by read-only Staging membership to synthetic pharmacy ID `11111111-1111-4111-8111-111111111111`; Preview reached ONLINE / READY / SYNCED.
- [x] Needs Review stayed enabled with count 2 after 30 seconds idle.
- [x] Existing authorized private Storage image fetched, decoded, and opened in viewer. Its content is a solid red placeholder fixture; this is not a representative camera-photo PASS. Two pending cases/four photos/four Storage object rows were unchanged.
- [x] Same-pharmacy transient refresh handling, private URL/auth/timeout, image decode success/failure/timeout, pharmacy-local Resolve contract, delete/cleanup contract, worker fencing, and retry fixtures pass.
- [x] Desktop tab keyboard focus uses `preventScroll`; Excel export reuses server-side search results and local Inventory filters.
- [x] Focused GS1, scanner, operation retry, session recovery, and Desktop/Handheld-path tests pass.
- [ ] Real new camera-photo display and automatic Resolve/Delete/retake Storage cleanup remain for synthetic live acceptance. Existing HHP cases are unchanged; scheduler stays paused.
- [ ] Synthetic Staging Resolve/Delete, retake photo cleanup, retry fencing, isolation, and unchanged Receiving/Global Master/Expiry side-effect counts remain to verify. Scheduler stays paused until pass.
- [ ] Physical Zebra acceptance remains with Product Owner.
- [ ] No approved Expiry PDF/report specification found in supplied source records; current Excel export verified only by implementation and regression fixtures.

## 2026-10-11 Staging connectivity recovery

- [x] Startup compatibility RPC signatures and role grants inspected in Staging.
- [x] Active Order Manifest/workspace/Receiving delta read contracts verified present and pharmacy-scoped.
- [x] Authenticated branch Preview smoke: Synthetic-B reaches ONLINE / SYNCED; initial RPC 404s absent.
- [x] Pharmacy-local Expiry review resolution fixture: one mapping, state, event, and audit; retry does not duplicate; conflicting mapping stays pending.
- [x] Staging write RPC fixture: membership isolation, authenticated-only grants, no direct table write, idempotent transaction append.
- [x] Staging pre/post read-only counts show no changes to review, current state, events, operations, photos, cleanup jobs, or Receiving transactions.
- [x] The connectivity-only Preview `e95583ed48313866d0bf271b5aecdc3b2e2f2812` was verified at that checkpoint; it is superseded by final acceptance candidate `10af4f27c48d323d51dd6f4b819fca3416c855fd` above.
- [x] Existing SYNTHETIC-B account rechecked after final Preview deployment: Expiry, Needs Review, Receiving, and Settings load; HHP084 account still requires a separate authorized session.
- [ ] Physical Desktop/Zebra acceptance remains with Product Owner.
- [ ] Real private Storage Resolve/Delete cleanup remains a separate acceptance gate; scheduler stays paused.

**Known full-suite baseline:** 31 passed / 10 failed; the same 10 known failures were present at base `c62a25a`.

- [ ] Sign in reaches correct pharmacy workspace.
- [ ] Refresh shows Preparing PharmFlow then returns to workspace without Complete Access/sign-in regression.
- [ ] One visible idle tab for 30 seconds shows no startup RPC burst pattern.
- [ ] save_pharmflow_cloud_workspace_guarded does not repeat from unchanged local autosave.
- [ ] PC receiving transaction remains immediate and quantities remain correct.
- [ ] Handheld receiving remains synchronized.
- [ ] Active Order Manifest remains correct after refresh.
- [ ] Hidden tab produces no periodic cloud reads.


## 2026-10-13 — Expiry Round 2

Focused 157/0/1; full 606/43/1 versus recovered baseline 601/44/1, no new failing names; build PASS. Local single-capture history 5→7→9→5 PASS; complete group contract BLOCKED. Actual requested visual sizes UNVERIFIED. See docs/expiry-round2-verification.md.


## 2026-10-14 — Approved Enterprise Expiry refinement

Enterprise round focused161PASS/0FAIL/1SKIP; full610PASS/43existingFAIL/1SKIP, identical failure names against606/43/1; buildPASS. Local SQL proposal validates atomic5+2→7→9→5 and rollback/idempotence/scope only; native independent concurrency and requested visual size remain unverified.


Verified runtime de845b5c0e813747054495a07de68af3e61b8201 READY on pharmflow-test Preview. New browser login wall prevents authenticated visual QA;1363x936 available,1366x768/larger UNVERIFIED. No Supabase changes.


## Authenticated visual follow-up — 2026-10-14

Login blocker cleared. Actual1363x936 inspected with8screenshots, tabs/hover/search/recognized/warning/GS1Serial/Inventory verified at that size. Exact1366x768/larger and populated session actions remainUNVERIFIED. No source/deployment/database change; liveSHAcd3fbafcce6dc8102500787a7c7141e42c11aa3d. Backend approval stillpending. See docs/expiry-enterprise-visual-qa.md.


## 2026-10-14 — Final focused polish / Serial-safe group review

Fast final round: focusedUI72PASS/0FAIL; localDB34PASS/0FAIL/1nativeconcurrencySKIP; buildPASS. Latest fullbaseline610/43/1 not rerun. Serial-safe group increase and same-pharmacy different owner checks added. Actualnewvisual check pending.


## 2026-10-14 — Four final Desktop visual corrections

Start remote/deployed09371ceab10d9da5cd7e6c2afa775a436c07f2f6 confirmed; Product Owner has verified prior grouping/Edit/Delete/search/synchronization. Outer3px brand accent, restrained table separation, success→READY after2500ms with version guard, fixed center350–420px search. Persistent Active Item/errors/Review unaffected; no search/group/business/backend changes.93focusedPASS/0FAIL/buildPASS. Candidate deploy and actual viewport evidence in delivery report; exact1366x768 remains UNVERIFIED if browser cannot resize. Staging only; Production untouched.


## 2026-10-14 — Expiry Desktop final closure candidate

Starting verified remote/Staging5949bd8275bfc949f014bc01789947af811a6c3f. Local8ba95280111731a8ddd6edae35a8d5f9d9e14afa preserved. Serial→Batch→Expiry→Year→Quantity, separate Year label, neutral editable Serial. Old Inventory row selector replaced with confirmed ACK state identity in canonical Session renderer;1000ms per-group flash, guarded timers, search preservation, reduced motion.98 focused tests PASS/0FAIL/0SKIP; production build PASS. Manual+GS1 payload mapping, grouped actions, metrics, search, scanner and2500ms success guards covered. No SQL/RPC/Supabase changes. Browser verification/release evidence recorded separately after deployment; exact1366×768 and populated-session flash screenshots pending availability. READY FOR USER TEST.


### Final closure actual verification

99 focused PASS / 0 FAIL / 0 SKIP; build PASS. Confirmed-session and loaded operation-membership guards prevent late ACK from flashing another session or stale projection. Actual authenticated Staging browser1363×936: Serial→Batch→Expiry→Year→Quantity verified, Year visible, Serial editable with normal focus, neutral Serial247/249/251 vs white Batch, input values distinct, Clear restores scanner focus. Search420×36 centered inside existing card1099×251.796875; no clipping/overlap/height increase. Global input theme precedence corrected only for unfocused Desktop Serial. Exact1366×768 UNVERIFIED: no supported viewport resize. Populated-session new/incremented row flash screenshots UNVERIFIED: authenticated current session has0 rows and this task prohibits Supabase modifications. Unit coverage verifies both groups, repeated timers, same-batch distinct identities, filtering and unchanged metrics; no browser saves performed. No Production, database, RPC, migration, or other workstream changes. READY FOR USER TEST. Final deployed SHA is recorded in the delivery report.

## 2026-10-17 — Global Master Group Gate B
See `PHARMFLOW_GLOBAL_GROUP_GATE_B_TEST_MATRIX.md` for the detailed 17-case status. Automated focused checks and build are recorded there. Live Supabase behavior, Production migration/deployment, handheld acceptance, and Product Owner acceptance remain NOT RUN.

## 2026-10-18 — Expiry Needs Review V2
- [x] Local PostgreSQL-engine tests: six Groups, authorized Global link/create, local-only resolve, retry, conflict rollback, cross-pharmacy denial, seven Receiving boundaries.
- [x] Live Staging rollback-only tests: six Groups, original capture metadata/quantity, retry, local-only B, unauthorized creation, cross-pharmacy denial. All synthetic writes rolled back.
- [x] DOM tests: existing selection, original barcode, exact Group dropdown, no creation for local-only account, frozen uncertain retry.
- [x] Existing Desktop/Handheld capture and operation tests; build. Historical baseline failures remain separately recorded.
- [x] Desktop candidate browser: Resolve Now -> existing item, code/name lookup, original barcode, required-field validation, existing-code conflict retains Pending, Save for Review -> Create & Resolve, inventory rows and preserved old identifier. 1363x936 viewport.
- [x] Handheld mode rendered existing scan/photo/save actions without Resolve Now; source and automated capture/photo regression verified.
- [ ] Physical TC26 scan/camera/throughput and native Handheld/1366x768 viewports remain Product Owner acceptance; desktop-sized emulation is not device verification.
