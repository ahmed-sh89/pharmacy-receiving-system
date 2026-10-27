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
