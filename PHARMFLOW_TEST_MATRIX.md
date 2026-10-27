# 2026-10-27 — Assignment stability/compact Staging section

99 focused Node tests PASS (zero failures/skips), including nine fresh-authority delta/rollback/identity/compatibility tests. Expanded real Chromium modal monitors untouched rows on every mutation/frame; check/color/node stability, per-row Saving, serialized rapid changes, failures/queued recovery, complete/partial bulk readback, refresh/second local fixture session PASS.18 desktop count/CSS-zoom layouts (1,2,4,5,10,20 ×1/.8/.75), long IDs, bounded176px/internal-only overflow PASS. Original supplier Worker/picker race and Receiving/Search/Dashboard/saved-report Chromium regressions PASS. Actual originals12/62/provenance and SEC-001 unchanged. Build/syntax/diff PASS; Production target rejects. Live authenticated Staging/second-device/actual Windows zoom UNVERIFIED; no available signed-in session. Product Owner prior fast restore/direct assignment/success PASS recorded. New release READY FOR TEST. Details: `docs/handheld-assignment-stability-20261027.md`.

---

# 2026-10-27 — Active Orders restoration and instant Handheld assignment

90 focused Node tests PASS (zero failures/skips), including nine new scoped-authority/concurrency/cooldown tests. Three isolated Chromium suites PASS: new actual modal+Manifest/assignment function flow against shared local RPC fixture; prior real-file Worker/permission-race regression; Receiving/Search/Dashboard/saved report regression. Loading/failed-read Retry/genuine empty, restored checkboxes, direct check/uncheck-last, Select All, pending/rapid conflicting events, no premature success, rollback, readonly, assignment-only events, refresh/second-page and identity fencing covered in isolation. Both originals parser totals12/62 and provenance PASS. Build/syntax/diff PASS; Production target rejected. No live Staging persistence/refresh-latency/second-device or physical TC26 PASS claimed; authenticated session unavailable. Product Owner's prior two-order import/persistence/assignment acceptance recorded. Current release remains READY FOR TEST. Commands/limits: `docs/active-orders-instant-assignment-20261027.md`.

---

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

# 2026-10-26 — Receiving focused Staging verification

- PASS (44 Node tests): `receiving-consolidation-review`, `receiving-duplicate-line-allocation`, `receiving-order-attribution`, `work-orders-scope`, `handheld-scanner-rearm`, `receiving-split-queue`, `receiving-startup-hydration`, `receiving-safety-gates`.
- PASS: Daroxime27+35=>one62/62 Completed; one/two/three Orders; source immutability; correction/undo; allocation70=>60/10; priority and over boundary; unique/multiple/missing/conflicting provenance; repeated Resolve/receipt and cross-pharmacy rejection; real scan route; Search/Dashboard/live/Excel/PDF identity; saved full-report isolation; repeated two-PC ledger hydration; durable split queue reload/all-child acknowledgement; Handheld parser/rearm; authority readiness.
- PASS: isolated Chromium actual Receiving table/Search, Dashboard and immutable saved report. HTTP aborted; no live auth claim.
- PASS: actual Staging authenticated SQL role under existing admin: capture3 Orders, accepted resolution intent, two-device IDs60/10, RESOLVED, repeated receipt inserted=false, repeated Resolve, foreign-pharmacy denied, count2/sum70. Subtransaction fully rolled back; independent zero-fixture query PASS. `tests/receiving-staging-rollback.sql`.
- PASS: build, syntax/diff, guarded Staging configuration. Preview readiness/served SHA and endpoint verified in delivery.
- NOT VERIFIED HERE: physical TC26 speed, signed-in browser save/refresh, real parallel two-PC synchronization, committed operational persistence, full legacy archive reconstruction. Product Owner checks, not USER VERIFIED/DONE. Older partial snapshots remain immutable; no guessed quantities.
- Full suite NOT claimed. Exploratory pre-existing static/cache/v4-v5 fixture failures/timeouts remain documented in current checkpoint.

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
