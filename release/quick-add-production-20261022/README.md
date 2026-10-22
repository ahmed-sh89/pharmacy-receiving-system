# Quick Add — Production promotion candidate (NOT RELEASED)

Production main verified: 4b3fe2e03d438ba5d462d5eabae0a6446884e125.
Accepted Quick Add Staging parent: 8dd9a3c2fe2ccc322db4a05ea3afe09e30a05ad5; Product Owner PASS.
This package is a candidate for separate Production review/approval. No Production SQL, writes, main commits, deployments or operational tests were executed.

## Exact frontend scope

`frontend.patch` is the feature-scoped diff against the above Production main. `frontend/` contains the complete corresponding runtime files plus Production's unchanged `js/supabase.js` (zznoshzcyxmtwfbznjyr and its browser-safe publishable key). The live Staging branch retains tovkcakucyagvbzvlnks. Never merge/copy the Staging configuration into main. No secret/service-role keys are included.

Quick Add changes: js/receiving.js, js/identifier-service.js, cloud-workspace.js, js/needs-review.js, ui.js, index.html. Master V2 cache/metrics: js/master-gtin.js plus Orders labels in index.html/ui.js. Consolidated Group display: js/receiving-release.js, Receiving-only paths in ui.js/js/reports.js; Quick Add control CSS: css/pharmflow-next.css. Report quantity/allocation calculations are unchanged. Expiry scripts, storage, cleanup workflow, auth, order lifecycle, archives and transfer sources are not replaced.

Group precedence: nonblank uploaded Group is retained; absent Group uses approved canonical V2 group_name by canonical Item Code; approved legacy fallback remains last. Unapproved nonblank source values are not silently replaced. The in-memory display projection is scoped to pharmacy/user and Master version, bounded to 1000 codes/request, shared across equivalent requests, ignored after context change, and never serialized into sourceRows, order items, history or transactions. Numeric identifiers are not required. Equivalent Receiving tables, filters and reports share this display projection. Base/Expiry Group normalization remains unchanged.

Metrics: total V2 items = all rows in pharmflow_global_items_v2; identifier mappings = all rows in pharmflow_global_item_identifiers_v2; numeric cache records remain separate. There is no active/inactive item field in the inspected V2 schema, so no Active Items metric is invented. Items Loaded/GTIN Matched/Missing GTIN retain current-workspace calculations, not a single selected Order's raw Excel count. Old legacy cache metadata is never labelled as a verified V2 total. Historical Production 52792 versus October15 56576 remains a current-data question; prepared metrics-production-read-only.sql was NOT executed. No HHP084 operational rows were read.

## Database candidates and order

1. Run preflight-read-only.sql only after separate Production authorization and explicit project identity verification.
2. Review every dependency hash, signature, owner/search_path/ACL, table column, RLS policy and uniqueness constraint against expected-production-dependencies.json and archived authoritative evidence.
3. Register/apply candidate 01, then 02, then 05, then 07. These are additive: 01 adds canonical identity/learned receipt/atomic Quick Add entrypoints; 02 adds nullable receiving_capture_request and capture v6/quantity v3; 05 adds read-only V2 cache metadata/pages; 07 adds the read-only Item Code Group projection required by this batch.
4. DO NOT replay Staging recovery 00/04/06 or the Staging-only canonical migration 20261022151445 on Production. Production already had source rows/action v4/manifest v4/register/get contracts in recovered evidence. No historical RPC body, table grant, policy or original data should be replaced.
5. 03 stays DEFERRED. No deferred Extra resolution is included.

Each candidate is transactional with bounded locks; new functions use CREATE, not speculative replacement. Existing same-name contracts/columns must cause review and a skip-only revised migration if proven identical. Do not blindly rerun a successful migration. New authenticated entrypoints still enforce identity and appropriate pharmacy/global authorization; the Group/cache read projections expose only shared Global Master data, no pharmacy/order/transaction data. No direct table privileges or RLS weakening.

Required preflight gates: pharmacy/admin and Global-creation helpers match; Settings creation and identifier APIs match; source rows and receipt columns exist; UNIQUE(pharmacy_id,order_number) and receipt identity uniqueness remain; Needs Review operation/intent constraints exist; expected generation+revision manifest v4 is present; browser direct-table privileges have not expanded; new names/column are absent or exact reviewed matches. Compare all constraints/policies, do not approve from object names alone. Function signatures, ACLs and required dependency hashes are supplied; historical catalog evidence is not a substitute for this future live check.

## Deployment and release gates

- Recheck actual main SHA before preparing the release commit. Stop/rebase selectively if it changed; preserve every Production hotfix.
- Obtain explicit Production migration and deployment approval. This task does not grant it.
- Apply/verify approved DB additions before frontend activation. Verify new functions' exact signatures, authenticated EXECUTE, no anon/PUBLIC entry EXECUTE, locked helper, body auth guards and unchanged table RLS/ACLs. Read-only Group projection should be checked for a known Global Item Code without numeric identifiers and ambiguous-code refusal. Do not use HHP084 for operational tests.
- Retain prior Quick Add backend authorization/concurrency/quantity/rollback results. Do not repeat the full suite for a CSS/display patch. Run supplied Group/UI/cache tests and focused report/Expiry boundary checks; production build; SQL/PLpgSQL parse. Verify accepted Quick Add receipt semantics unchanged.
- Release only frontend.patch plus the explicit unchanged Production configuration on an isolated promotion branch based on current main. No Staging recovery, fixture or package contents belong in the browser release artifact. Main push triggers the existing GitHub Pages Production workflow; do not dispatch it in this task.
- Verify GitHub Pages success, live version.json SHA, live js/supabase.js Production ref and absence of the Staging ref, loaded asset keys, login and authorized non-mutating UI checks. Confirm Expiry/cleanup schedule unchanged. Pause activation on any browser security warning; never bypass it.
- Product Owner visual check on Staging: missing uploaded Group + known Global V2 item shows Home Health; original uploaded Group is preserved; Quick Add Group select aligns and keeps values; totals/mappings/workspace labels are clear.

## Recovery

If a migration transaction fails, it rolls back; investigate before retry. If DB succeeds and frontend deployment fails, keep additive DB contracts and retry the verified frontend. A frontend rollback must retain new functions/column while queued learned receipts or review captures depend on them. Never drop columns, delete mappings/receipts, restore database snapshots, reset tables or alter historical quantities for rollback. Preserve archived source and migration checksums.

## Verification limits and remaining gates

New Group display/cache tests and isolated PostgreSQL role tests are recorded under verification/group-batch-*. No accepted Quick Add backend suite was rerun. The legacy Expiry inventory tests have four failures reproduced unchanged on the accepted parent (including old Uncategorized label expectations); they are documented, not fixed or claimed passing by this batch.

During this task, Supabase initially exposed Staging and accepted a migration explicitly addressed to tovkcakucyagvbzvlnks. Subsequent metadata exposed only Production and rejected Staging read access. Independent Staging REST returned 401/42501 permission denied for get_pharmflow_receiving_groups_v1, proving endpoint existence/anon denial, but live authenticated result, actual migration history ID and independent definition hash remain unverified. No query or migration was redirected to Production. Restore Staging connector scope before those final live reads. Do not reapply 07 until inspecting migration history and exact existing body.

Cleanup unchanged: exact fixture ownership and IDs remain in verification/resume-cleanup-before.json and resume-cleanup-verification.json. Existing three synthetic actors had no password/email/phone/identities/sessions at the last verified read. No DELETE was retried through the expired requestState channel; no fresh authorized Staging cleanup connection is available. Leave all records untouched. When available, independently recheck exact UUID/operation/order/actor links and external references, use a bounded transaction in FK order, and independently verify results. No name/time matching or broad reset.

Overall Production readiness remains CONDITIONAL: source package prepared; future live Production preflight, explicit promotion approval, and new-batch Staging visual acceptance are still required.

## Selected Item UX correction — 22 October 2026

The approved narrow follow-up collapses the Quick Add search/results wrapper after native result-button selection, shows only the existing selected-item details, and focuses Group. Compact Change Item restores the original results/query and search focus, clears item/code/name/source/Group/error state and preserves scanned identifier and quantity. Changing selection is blocked while submission or a frozen receipt retry is pending; no operation IDs, authorization, quantity, receipt, Needs Review or backend logic changed. The existing Group control CSS is unchanged. 16 focused UI tests and build PASS. New follow-up awaits Product Owner visual test. Previous Quick Add/Group/metrics acceptance remains PASS.

Current verification supersedes older notes: Group migration 20261022190759 and read-only authenticated no-numeric-identifier lookup/metrics were verified. Production compatibility remains CONDITIONAL pending the separate read-only Production catalog gate. No SQL/migration/configuration changes, Production execution, or cleanup are included in this follow-up.
