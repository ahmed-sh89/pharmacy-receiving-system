# PHARMFLOW_CURRENT_CHECKPOINT

## 2026-10-11 — Final Expiry acceptance candidate in progress

**Status:** Candidate code deployed to Staging Preview. Code commit `10af4f27c48d323d51dd6f4b819fca3416c855fd`; Vercel deployment `dpl_8fXEzLivCJi9MrniMykmRaMLUpe8`, **READY**, target Preview (`null`), immutable URL `https://pharmflow-test-ozwsd2e2d-fhyh2xtskz-3504.vercel.app/`. The existing feature-branch Preview URL also loaded the updated behavior after reload.

- Current browser session is `tc26-expiry@example.invalid`, role `staff`, on Preview project `pharmflow-test`. The app shows HHP084 / Synthetic pharmacy A / ONLINE / SYNCED. Read-only Staging query confirms the HHP084 test pharmacy is `11111111-1111-4111-8111-111111111111` and the account has active membership there. This is Staging, not Production HHP084. No existing HHP084 case has been changed.
- Reproduced the photo symptom on the old Preview: opening a pending case left a red tile and “Loading evidence photo…” visible. Read-only Staging aggregation shows 2 pending Expiry cases, 4 registered photos, 4 corresponding private Storage objects, no deleted registrations; all four are `image/png` objects of 73 bytes. These are existing synthetic fixtures, not new representative product photos. The client did not expose whether the authenticated fetch stalled or the fetched image failed to decode; the new bounded request/decode/error path addresses both outcomes without asserting which was the original cause.
- On the updated Preview, the same existing HHP pending photo now exits loading and the Open Photo action opens the image viewer. The test image itself visibly contains a solid red placeholder; therefore this is a **client state-handling PASS**, not a real camera-photo acceptance. No HHP case or Storage object was mutated.
- The Needs Review tab now remains available during same-pharmacy auth-context refreshes; transient refresh failure preserves the last verified contract state. Every list and write RPC continues to enforce current authentication and pharmacy membership server-side.
- Private photo retrieval now has a 15-second request timeout. UI success waits for image decode with a 10-second bound; failed/missing/corrupt photos show an unavailable state and a retry control instead of an indefinite loading placeholder. Bucket privacy and authenticated Storage URL are unchanged.
- Tab keyboard movement and Needs Review close focus now use `preventScroll` to avoid focus-induced viewport jumps. No structural layout redesign was made. Existing Export uses the same server search result and local inventory filters as the visible table; Excel contains pharmacy, identifier, product, batch, expiry, quantity, operator, and last-updated values. The approved source docs do not specify an Expiry PDF/report format, so none was invented.
- The app commit is not yet deployed. The cleanup scheduler remains paused. Live HHP photo retrieval and synthetic Resolve/Delete cleanup acceptance remain pending; no HHP case, inventory state, or Storage object has been modified.

**Verification:** HHP Preview reload reached **ONLINE / READY / ● SYNCED**. Needs Review remained enabled with pending count 2 after 30 seconds idle. The image viewer opened without changing the cases. Build and syntax checks pass. Focused Expiry review/photo/cleanup, scanner/operation/session/navigation tests pass (9 files). Full suite is 31 passed / 10 failed, matching the previously documented base-`c62a25a` failures. No physical Desktop or Zebra acceptance is claimed.

**Remaining acceptance gate:** The existing fixtures are red 73-byte PNG placeholders, and the camera/file input is Handheld-only; no representative new photo was uploaded in this desktop browser session. Run the short Product Owner Desktop/Zebra acceptance with a newly captured synthetic image, then perform Resolve/Delete, retake cleanup, pharmacy isolation, retry-fencing, and unchanged-inventory checks while the scheduler stays paused. Enable the approved Staging scheduler only after those live cleanup tests pass. Current Staging data counts and queue remain unchanged; this candidate added no database migration.

---

## 2026-10-11 — Staging connectivity and Expiry candidate

**Status:** Staging connectivity recovery verified in the updated Preview. Cleanup scheduler remains paused.

- Staging project `tovkcakucyagvbzvlnks` now has the previously absent auth/registration and Active Order Manifest startup read contracts. Their signatures and role grants match the recovered repository/Production-approved contracts. Authenticated smoke on the existing branch Preview showed **ONLINE / SYNCED** for synthetic pharmacy `SYNTHETIC-B`; the initial four RPC 404s were not present in the authenticated console. `get_public_setup_status` remains anon-callable by design; member RPCs are authenticated-only.
- Applied Staging migrations this turn: `20261011014658` (`pharmflow_expiry_review_local_resolution_20261011`), `20261011021546` (`staging_cloud_workspace_save_rpc_compat_20261011`), and `20261011021809` (`staging_startup_write_rpc_compat_20261011`). Startup migrations already present: `20261011002717` (`20261011090000_staging_startup_compatibility`) and `20261011003843` (`20261011090100_staging_startup_read_compatibility`). All new write RPCs are `SECURITY DEFINER`, tenant-scoped, authenticated-only, and direct table writes remain revoked.
- Expiry resolution is now pharmacy-local: the authorized Global Master item is linked only to the current pharmacy; current Expiry state, event, review resolution, audit, and existing photo-cleanup queue are committed atomically. Existing Global Master V2 elevated write authorization is unchanged.
- Staging counts remained 5 review rows, 18 Expiry current-state rows, 25 Expiry events, 37 Expiry operations, 12 registered photos, and 0 cleanup jobs. No Receiving transaction rows were written. The two existing Global Master V2 rows were not changed. Cleanup scheduler is inactive.
- Exact startup/read and safe Receiving write RPC contracts are installed. Destructive `clear_pharmflow_active_order_manifest_v2` and `atomic_reset_pharmflow_current_workspace_v4` remain absent: reset dependencies (`pharmflow_order_source_items` and the legacy cloud-transaction table) are missing, and this recovery did not install or invoke data-clearing behavior. This does not block sign-in, startup reads, or the tested empty-workspace synchronization.
- Fixed the Needs Review template parse error in `ui.js` and cache-busted only the changed Expiry scripts. The reviewed candidate is commit `e95583ed48313866d0bf271b5aecdc3b2e2f2812` on `feature/expiry-stage1-visual-gate`, fast-forwarded from remote `9746ecd3f4e9251f8042ec279b0a2225f15dbda3` and deployed by Vercel as Preview `dpl_Bcvo88o11kx1oCdXi6CSofMaeDeh` (**READY**, target Preview/null), immutable URL `https://pharmflow-test-965j6c830-fhyh2xtskz-3504.vercel.app/`.
- Existing authenticated Preview alias `https://pharmflow-test-git-feature-expiry-stage1-115007-fhyh2xtskz-3504.vercel.app/` reached **ONLINE**, **READY**, and **● SYNCED** for existing account/pharmacy `SYNTHETIC-B`. Startup exited the loading overlay; Expiry loaded; Needs Review opened and showed 0 pending for this pharmacy; Receiving and Settings navigation loaded and remained synced. Read-only PostgREST/Postgres log scan for the prior startup RPC 404/signature errors over the latest 30 minutes returned no matches. Vercel deployment listing confirms the new Preview is from the exact candidate SHA; the separate deployment-detail/alias API was denied by team-scope authorization.
- Global GTIN v1 still displays **UNAVAILABLE** because that Staging dataset is not loaded; Global Master V2 remains a separate dataset. Empty SYNTHETIC-B Active Order Manifest produces no active manifest row, as expected for this workspace.

**Verification:** Focused PGlite backend 25 passed / 0 failed / 1 skipped; review contract 9/9; coordinated Expiry regression 5/5; startup write fixture 1/1. Build and changed-script syntax checks pass. Full suite 31 passed / 10 failed; these are the same 10 known baseline failures recorded at `c62a25a` (backend-static, handheld-input, stage1-identity, high-priority-persistence, order-item-browser-layout, project-a-ui-polish, receiving-performance-root, settings-account-access, settings-barcode-management, stage2-identifier-cutover). Browser verification is authenticated UI evidence for SYNTHETIC-B, not a physical device, HHP084 account, or photo-cleanup acceptance test.

**Production boundary:** Production was inspected only for read-only catalog contract metadata as explicitly allowed; no Production data, schema, deployment, configuration, or code was changed.

**Next:** run the separately approved Expiry photo Resolve/Delete acceptance using existing authorized HHP084 and SYNTHETIC-B sessions and synthetic cases, while keeping the cleanup scheduler paused until those tests pass. Do not claim device acceptance or real Storage cleanup yet.

---

## 2026-10-10 — Expiry photo cleanup final corrections

**Status:** Local implementation/test candidate; not deployed. No Staging writes or Production access.

- Preserved the approved Pending-only Needs Review UI, one-confirmation pharmacy-scoped Delete, private photo access, and elevated Global Master resolution permissions.
- Resolve/Delete enqueue every registered photo for the exact pharmacy and committed operation, including unused retakes. Pending photos remain available and unqueued.
- Cleanup claims now carry unique fencing tokens. Complete/fail require the current, unexpired token; stale claims cannot modify a reclaimed job. The worker limits claims to four, applies 10-second request timeouts, uses a 110-second invocation budget and 3-minute leases, and returns 503 for partial work. Lost Storage responses retry safely through 404-as-already-removed handling.
- Read-only queue-health queries report outstanding age, attempts, failures, and expired leases. Alert/escalate on repeated worker 503s, an oldest outstanding job above 10 minutes, or 8+ attempts; HTTP 200 alone is not a deletion receipt.
- Corrected Staging-only proposal: [20261010_expiry_needs_review_member_delete.sql](proposals/staging/20261010_expiry_needs_review_member_delete.sql). SHA-256: 6badaee544ad58f2c894d996b7caa9110b99a9bb52809c15b937efdce606ea56.
- Worker files: supabase/functions/pharmflow-expiry-photo-cleanup/index.ts and cleanup-core.js. Existing supabase/config.toml keeps verify_jwt = false; the function independently checks its private cron token. The service-role key remains runtime-only.
- Staging remains untouched. From the completed read-only audit: the bucket is private and pharmacy-member read-scoped; Vault is installed, while pg_cron/pg_net, the three cleanup Vault entries, migration contract, and deployed Edge Function are absent. Actual Storage cleanup by the new worker remains unverified.

**Verification:** isolated PGlite SQL suite 25 passed, 0 failed, 1 skipped (native independent-connection concurrency unavailable); review contract 9/9; worker unit suite 6/6; Edge Function and cleanup core syntax checks passed. Storage HTTP and scheduled runtime are not simulated as live Staging verification.

**Next approval gate:** review this migration and worker. After separate approval, configure Staging Vault URL/publishable key/cron token, set the matching Edge Function secret and deploy the function, enable pg_cron/pg_net, then apply the SQL and verify schedule plus real Storage deletion/retry in an authorized Staging session. Do not treat this local candidate as Staging-accepted.

---

## 2026-10-10 — Coordinated Expiry Correction Candidate

**Status:** Implemented locally for review; **not deployed**. Staging still serves the earlier candidate documented below.
**Repository/branch:** `ahmed-sh89/pharmacy-receiving-system` / `feature/expiry-stage1-visual-gate`.
**HEAD:** `02fef0f814740b341b86a644c472d0bd753f7b12`; all 10 restored commits and inherited workspace edits are preserved. No commit, push, merge, deployment, or Staging/Production SQL execution occurred in this task.
**Target Staging Supabase:** `tovkcakucyagvbzvlnks`. Production `zznoshzcyxmtwfbznjyr` was not accessed.

### Implemented
- Desktop capture drafts now use the durable draft store and route activation recovery. Uncertain operations keep their durable operation ID/payload; retries reuse that operation, while a received definitive server rejection permits correction under the same ID. Save, failure, uncertain result, blocked Clear/scan, and blocked navigation have visible explanations. The request timeout covers response-body reads as well as headers.
- The reported original physical Save failure remains **unproven**; no Staging server trace or physical reproduction established its cause.
- GS1 parsing remains strict and separator-based. Client canonicalization now aligns separator/AIM normalization across scan resolution and the server-bound scan frame. Home-laptop and Zebra raw frames are still unavailable. An opt-in bounded Staging-only diagnostic captures event/separator/AIM metadata in memory, with no raw payload retention, storage, logging, transmission, or inventory writes. Physical compatibility remains **BLOCKED FOR PHYSICAL EVIDENCE**.
- Desktop workspace tabs are connected and ordered Session Activity (default), Expiry Inventory, Needs Review. Session/Inventory data semantics and capture/KPI controls remain separate. The main workspace uses the existing `index.html`, `css/dashboard.css`, and `js/expiry-desktop-v2.js` owners.
- Expiry review now has a single-open accordion, adjacent Copy Barcode, private-photo loading/error and thumbnail/enlarge behavior, accurate Batch/optional Serial/Expiry/Quantity, a PharmFlow Global Master V2 result, concise Pending/History controls, and simple Close/Delete actions. Resolution authorization stays elevated.
- Prepared, but did not apply, `proposals/staging/20261010_expiry_needs_review_member_delete.sql`. It adds only pharmacy-member-scoped `EXPIRY` tombstoning using `DELETED`, retaining rows and photos. The frontend leaves the case in place and reports the missing RPC until separate migration approval/application.

### Verification
- Focused Expiry scanner, save/recovery, review-contract, diagnostic, navigation, and local database tests pass. Local PGlite backend suite: **23 passed, 0 failed, 1 skipped** (native multi-connection PostgreSQL unavailable).
- Full suite: **28 passed, 10 failed**. The exact HEAD baseline suite: **23 passed, the same 10 failed**. Failures are pre-existing checks in backend-static, handheld-input, stage1-identity, high-priority-persistence, order-item-browser-layout, project-a-ui-polish, receiving-performance-root, settings-account-access, settings-barcode-management, and stage2-identifier-cutover.
- `npm run build` and `node --check` on changed JavaScript passed. Vite emitted its existing notices about classic scripts not being bundled.
- Migration SHA-256: `5c3ca7ab7326583618d1039288bce20331c94328419c86a0c7a362dd95285b80`.

### Required review and physical acceptance
1. Separately approve the SQL file before any migration runner applies it; then verify authorized member deletion, cross-pharmacy/Receiving rejection, retained photo, and unchanged inventory/event/Global Master/Receiving counts.
2. On Staging Desktop and Zebra, perform the checklist in the corrective task: FLUTAB and Dompy input, Batch/Serial/Expiry fields, Save success/rejection/timeout/lost response and same-operation recovery, Clear/scan feedback, tabs/session persistence, photo retrieval, search, and deletion after the separately approved migration.
3. Do not describe scanner compatibility or physical end-to-end behavior as accepted until the Product Owner performs those tests.

### Existing earlier Staging deployment
- Vercel project: `pharmflow-test` (`prj_SLUdsr7jh2gWtOQYj44jaKxAl1Lw`), preview deployment `dpl_EJKHaKu9f7c1drWC8Y1teWtj57TG`, state **READY**.
- URL: https://pharmflow-test-impg1mqlt-fhyh2xtskz-3504.vercel.app/ . This is the prior candidate; this local correction has not been deployed.

**Release boundary:** local Staging development candidate only. No Production or live Staging writes, deployment, commit, or push.

**Date:** 2026-10-01  
**Track:** Production — Settings complete  
**Production branch:** `main`  
**Settings release PR:** #22 — squash merged  
**Settings production release commit:** `35a2588a158a8fc52613cb01f64d19e1f0842278`  
**Production startup syntax fix:** `73acdfecde3232f5fbb30ae7b54aeafe32e61f7f`  
**Production asset refresh commit:** `65743f05b34ab467aa99b0a4d33238508c0c4d6b`

## STATUS
Settings is **DONE**. The Product Owner verified the final Production smoke test after the startup regression was corrected.

## USER VERIFIED / DONE
- Barcode Control duplicate/cross-item recovery and recognized Receiving behavior.
- TEST003 Current Workspace reset with pharmacy barcode preservation.
- Historical delete confirmation using `DELETE`.
- Pharmacy-context receipt isolation.
- Pharmacies & Access KPI/search/edit/admin-email prefill behavior exercised during Settings acceptance.
- System Owner Reset Admin flow.
- Forced temporary-password gate and mandatory replacement before application access.
- New password completion, old temporary-password rejection, sign-out/sign-in cleanup.
- Normal Change Password validation, wrong-current-password handling, success and re-login.
- Settings account header.
- Session Paused PharmFlow identity presentation.
- Preparing PharmFlow loading presentation remains the accepted/frozen design.
- Production hard-refresh/startup smoke: **PASS**; Receiving opened normally after the syntax correction.

## DEFERRED / NON-BLOCKING
- Live Reset Admin attempt using a non-System-Owner account remains deferred by Product Owner. Security/authority code path was reviewed, but this exact runtime acceptance case is not USER VERIFIED.
- Other optional Settings acceptance passes explicitly deferred by Product Owner.

## SETTINGS RELEASE / CLEANUP
- Settings was promoted through the frozen release branch and PR #22 using **Squash Merge**.
- Temporary Session Paused preview hook removed.
- Obsolete Session Paused capsule paths removed.
- Hidden legacy Settings Workspace card and dead handlers removed.
- Production client uses canonical `pharmflow-password-admin`; no runtime client reference to the RC endpoint remains.
- Canonical password-admin is ACTIVE v2 with JWT verification enabled.
- RC Edge Function remains temporarily deployed as an inactive-by-client rollback artifact; do not use it for normal runtime. Removal can be performed later when a supported deletion path is available.
- No destructive production-data migration was performed.

## PRODUCTION REGRESSION + ROOT-CAUSE FIX
Immediately after release, Production remained on **Preparing PharmFlow**. Browser Console exposed:
`Uncaught SyntaxError: Unexpected token '}' — app.js:1390`.

Root cause: removal of the legacy Settings workspace handlers left an extra closing-brace block in `js/app.js`, preventing the application bootstrap script from parsing.

Correction:
1. Removed only the malformed extra closing block in `js/app.js`.
2. Refreshed the `js/app.js` asset version in `index.html` so GitHub Pages clients receive the corrected bundle.
3. Product Owner performed the Production refresh and reported **PASS**.

Classification: **deployment/release code regression — JavaScript parse/startup**, not Supabase, Receiving data, Active Order Manifest, or workspace synchronization.

## DATABASE / SUPABASE
Shared Supabase project: `zznoshzcyxmtwfbznjyr`.
Applied migration history includes PHASE2C1168 through PHASE2C1171. Current database definition of `owner_update_pharmacy_identity_v1` already contains the PHASE2C1172 HHP084 protected-code guard although PHASE2C1172 is not listed in migration history.
Do not blindly reapply PHASE2C1172 merely to reconcile migration bookkeeping.

## CRITICAL NON-REGRESSION
Preserve Receiving ledger/transaction semantics, Active Order Manifest, durable queue, authentication/tenant isolation, Global GTIN boundaries, multi-PC synchronization, reports/exports, Expiry behavior, and the accepted Preparing PharmFlow loading presentation.

## EXACT NEXT ACTION
Settings is closed. Begin the next approved PharmFlow development phase from current Production `main`. Before new implementation, classify the requested change and protect the non-regression boundaries above.


## 2026-10-02 — Receiving History Reports RC
Status: IN DEVELOPMENT → READY FOR PRODUCT OWNER TEST (not Production frontend).
Baseline: main 6af859c2800c73ce3e5f69cc2d7744dec0bfcf36.
Branch: feature/receiving-history-reports-20261002.
Implemented: lightweight workspace completion history; discrepancy-only detail grouped by Order Number; NEW High Priority history only (SHORT excluded); PharmFlow-styled History Report UI; Excel/PDF exports; atomic workspace history + multi-order finalize RPC.
Supabase: additive migrations receiving_workspace_history_v1 + receiving_history_hardening applied. New tables are RLS protected; authenticated table grants are SELECT-only; writes occur through authenticated admin RPC. Existing Archive remains untouched for compatibility during rollout.
Non-regression: current email HTML/design unchanged; zero-discrepancy email guard unchanged; existing Archive/Item Transfer retained; Needs Review branch not mixed.
Next action: Product Owner test on preview: multi-order Receive All with discrepancies + NEW item, zero-discrepancy completion, date-range history grouping, Excel/PDF, and existing email/Item Transfer smoke checks. Do not promote until USER VERIFIED.
