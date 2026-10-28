# Accepted improvements — selective Production preparation

**PREPARED FOR PRODUCTION APPROVAL — NOT DEPLOYED.** Release is on hold: the accepted Owner export has a demonstrated Production-scale performance blocker. Do not approve deployment of the five-feature bundle until that blocker is resolved or the export is explicitly removed from scope.

Product Owner explicitly marks the five improvements USER VERIFIED — PASS on Staging. No repeat Staging acceptance run was requested or performed. This preparation does not close DATA-001, EXPIRY-SAVE-001, SEC-009 or unrelated security findings.

## Source and environment

Production main independently rechecked at `08843e42399b8830af6f0eb0773f04e0269cf0b6`. Latest Pages workflow run `40608849036` succeeded for that exact SHA. A fresh served Pages response/parity check is unavailable; deployment evidence here is GitHub's successful run, not a newly retrieved live artifact. Production database `zznoshzcyxmtwfbznjyr` was only queried using SELECT and EXPLAIN ANALYZE SELECT inside READ ONLY; no business data/schema/Auth/Edge changes.

Accepted implementation `87be759e28c7bcc912c6cf8097d40955b10bcf6b`; Staging branch HEAD `f63d0b299b2f023ad88513ccdc7b6a0f580bd4d7` differs only in four documentation files. Both Vercel deployments READY, Preview target null. Accepted immutable deployment `dpl_41jE7bJgdu27poEQCJMcjH8P4Scu` live version.json still confirms implementation SHA, environment staging, Supabase `tovkcakucyagvbzvlnks`. No Staging database/Edge/Auth changes in this preparation.

Release branch: `release/accepted-improvements-prep-20261028`, created directly from Production. The exact branch commit is recorded by Git; the final response identifies it. No merge or release deployment is authorized. Root `vite.config.js`, `js/supabase.js`, `js/config.js`, `vercel.json`, Pages workflow and password handlers remain byte-identical to Production. In particular `git.deploymentEnabled.main=false` remains unchanged. The Staging Vite exception, CSP/backend rebinding, diagnostic activation and badge are excluded. Automatic release-branch Vercel Preview attempts are expected to fail the unchanged Production-only build guard; no Preview workaround or environment weakening is part of this preparation.

## Included and excluded

Included exactly from accepted runtime: Receiving Report invariant classification/index work, historical Reports search, restored-auth redundant public setup request removal, same-scope permission revalidation with synchronous fail-closed behavior, simplified Reconnecting message, Owner-only two-sheet Excel exporter/Worker, compact Access action CSS, and their HTML/cache references. Capsule design/markup/styles/animation unchanged. No calculation, aggregation, selected-order/filter/export business rule change.

Unchanged/excluded: `js/expiry.js` and all Azinc logic/data; `js/identifier-service.js` and deletion semantics; existing Pharmacy Code logic (only the already-approved startup/revalidation/export-button hunks from auth.js are included); SEC-009; other security work; operational tables/data/migrations; Staging-specific build code and Staging fixture SQL. Added tests/CI and release proposals/records only support the accepted scope.

## Required proposed migration and authorization

`proposals/accepted-improvements-release/owner-export-apply.sql` is PREPARED ONLY, not in the applied migrations directory, and has NOT been executed on Production. It adds only `public.owner_export_global_items_page_v1(text,text,integer)` with the accepted body unchanged. Transactional preflight refuses an existing export function or drift in SEC-007 body/owner/ACL/search_path. Production has no export function yet; both Master schemas and required PK/item_code indexes were inspected and are compatible.

The function runs as definer with a pinned search_path. Every page requires non-null auth.uid(), membership in server-owned `system_owners` through `is_system_owner()`, and `password_change_complete()` (including SEC-007 expiry/session revocation and forced-password gate). EXECUTE is explicitly removed from PUBLIC/anon/authenticated and then granted to authenticated; signed-in pharmacy accounts still fail the internal Owner check. No service-role credential or unrestricted direct-table path is added to the browser. Existing table policies/grants are unchanged. Export data contains master fields only, no credentials or pharmacy transactions.

Production SEC-007 matches expected MD5 `99bda52f1b8577ac07f5c0d81bdbd8f7`, owner postgres, ACL `{postgres=X/postgres,authenticated=X/postgres}`, search_path pg_catalog/auth. It is not modified by apply/rollback. In-memory PostgreSQL executed the proposed apply, proved Owner success, non-owner and anonymous denial, revoked-session Owner denial, executed the guarded rollback and verified master data and SEC-007 unchanged. This is isolated SQL verification, not a claim that the proposed RPC was installed/called on Production.

## Production-scale export assessment — BLOCKER

Actual Production snapshot: **56,588 items and 78,164 identifiers**, not the 16/21 Staging dataset. At page size 750, collector needs **183 requests** including terminal empty pages. Each invocation recomputes a full JSON/MD5 fingerprint across both Master tables before returning one page. This causes about **24,659,616 row fingerprints** for a single export.

One read-only Production EXPLAIN ANALYZE of the identical pair of full-content fingerprint subqueries took **2,321.66ms**, excluding authorization, page selection/counting, HTTP/network, client validation and Excel creation. This is one observed sample, not a full-export benchmark or percentile. Straight-line extrapolation is **424.9 seconds (~7.1 minutes)** for fingerprint work alone if repeated at that sample cost; warm-cache and concurrent conditions can vary. A 12-second per-request client deadline does not bound this overall repeated work. The current request-local fingerprint approach also aborts the whole download if Master content changes between pages.

Production-dimension synthetic collector + actual SheetJS workbook round-trip passed: 56,588/78,164 rows, 183 page requests, two sheets, exact counts/text identifiers. One isolated run: workbook generation 5.89s; total 10.13s; XLSX 10,714,964 bytes; Node process peak RSS ~817MiB. This is not a Windows Chrome/Worker heap measurement; it highlights a memory margin that still needs target-browser verification. It excludes database/network and does not remove the server blocker.

Assessment: file capacity, pagination, associations and text fidelity are proven at actual dimensions; efficient complete Production export is NOT established. Do not infer readiness from Staging acceptance or passing synthetic workbook tests. Stop Production release authorization for Owner export. No speculative index or fingerprint redesign was introduced. A separately approved narrow Staging optimization should avoid full Master rehash on every page while retaining consistent-version detection and exact associations/counts; it requires review and renewed export-specific acceptance. The four independent accepted improvements can be split into another bundle only with explicit Product Owner scope approval.

## Verification

Local focused selective-release tests: 77/77 passed in the combined run; the subsequent added apply/rollback/authorization test also passed in the 3-test export-preparation file. Production/default build PASS. New `Accepted improvements release preparation` workflow runs the final 78-test set and build on this isolated branch only, with read-only GitHub permissions, pinned Actions, no secrets, no connected-database mutation and no deploy step. Hosted results must be green for the exact commit; final response records the observed CI result/link. No broad audit or full repository suite certification is claimed.

Report-equivalence/Receiving allocation, revalidation denial/scope/revocation, startup request, full-size export/text/count/association, guarded SQL apply/rollback, exact security/config/runtime exclusions and runtime Pages allowlist tests cover the changed boundaries. Prior unrelated baseline failures are not part of this focused gate and are not claimed fixed. Product Owner's Staging USER VERIFIED acceptance is retained; no repeated UI, device or operational acceptance is claimed.

## Exact deployment sequence — all future, approval required

1. Resolve the export scalability blocker under separately approved Staging work and accept the exact replacement, or explicitly authorize excluding export. Refresh this preparation; do not deploy the currently blocked five-feature bundle.
2. Obtain explicit approval naming the final reviewed release commit, SQL file/hash, Production project and main/Pages deployment. Recheck main is the reviewed baseline, dependencies/gate unchanged, no export function already exists, and latest CI successful. Stop on drift.
3. Only after that approval, apply the one guarded export SQL transaction through the Production connection, explicitly project `zznoshzcyxmtwfbznjyr`. Record the actual migration version/hash returned. Do not replay Staging fixtures or any other migration. Verify grants/Owner and live-session checks using read-only export/denial checks with authorized sessions; no password reset or operational write.
4. Merge only the reviewed selective release to main after its PR checks pass. This deliberately triggers the existing GitHub Pages workflow; Vercel main deployment remains disabled. Do not manually deploy/promote Vercel, dispatch unrelated workflows or alter Auth/Edge settings.
5. Wait for Pages success; verify exact served commit, Production CSP/Supabase binding, export JS/Worker/vendor assets and unchanged capsule. Perform focused non-destructive report/search/filter/Refresh checks and actual Owner export count/text/association validation. Confirm pharmacy accounts cannot invoke export. Do not test deletion or edit Azinc.
6. Record results and final checkpoint. Promotion remains NOT AUTHORIZED by this preparation request.

## Exact rollback sequence — prepared, not executed

1. Stop acceptance and record the failing release/deployment. If only additive RPC was installed and UI was not promoted, leave baseline UI in place; decide separately whether RPC rollback is necessary.
2. After explicit rollback approval, revert only this accepted-improvements runtime release through a reviewed main commit and existing Pages deployment. Never revert the October 28 security release, SEC-007, password handlers or Vercel main block. Recheck the current main for intervening changes before reverting; do not force-reset main.
3. Confirm served baseline behavior and that the Owner export button is absent. Then, only if approved, execute `proposals/accepted-improvements-release/owner-export-rollback.sql` against Production. It checks exact new function body/owner/definer/search_path before dropping that one RPC without CASCADE. It cannot change master/history/auth data or SEC-007. Stop on drift or dependencies.
4. Verify baseline served SHA/security bindings and record rollback. No data restore or quantity correction is required for this read-only export feature.

## Approval needed / current disposition

No Production operation is authorized. The immediate decision is approval for narrow export scalability work on Staging, or explicit scope reduction to the other four accepted improvements. Any later Production SQL application, main merge/Pages deployment and rollback require separate explicit approval for the final reviewed artifacts. Preparation artifacts are reviewable; full five-feature Production readiness is withheld.
