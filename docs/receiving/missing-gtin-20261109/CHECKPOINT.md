# Missing GTIN bulk mapping and saved-review Quick Add — Staging checkpoint

Status: IMPLEMENTED — AUTHENTICATED BROWSER AND VISUAL ACCEPTANCE PENDING.
Production base verified: `7e9cad2177131e80735016fde35014deb3c5a390`.
Branch: `feature/missing-gtin-bulk-staging-20261109`.
Production main, database, Edge Functions and operational records were not modified.

## Responsible paths and implementation

Root `index.html` selects root `ui.js`, `js/excel.js`, `js/master-gtin.js`, `js/identifier-service.js`, `js/receiving.js`, `js/needs-review.js`, and the shared ledger runtime. Duplicate `js/ui.js` is not edited.
Excel imports retain durable `pharmflow_order_source_items` and the shared Active Order Manifest. The manifest aggregates canonical Item Codes and memberships. Local `mappingData` / IndexedDB are projections, while Global V2 items/identifiers and pharmacy overrides are authoritative. Previously `getItemsWithoutMapping()` could report a local projection gap as a missing identifier.

The panel now reads a workspace-bound authoritative projection, one entry per canonical Item Code. This projection supplies the Missing GTIN KPI when it matches the current pharmacy and workspace content. No new polling, source snapshot mutation or local-authority store is introduced. Existing cache synchronization remains single-flight.

Save All calls an atomic server batch. The shared private mapping helper proves the selection against durable source rows AND the active manifest, detects canonical ambiguity, preserves existing Global attributes, and invokes existing audited create/add contracts. Global permission and pharmacy-admin access are mandatory. Cross-item identifiers are never reassigned. Short locks serialize compatible legacy administration writers; canonical lookup has a non-unique expression index.

Saved-review Quick Add shares the existing Active Order search, selected-item presentation, Group options and allocation planner. It never calls immediate `quick_add_pharmflow_order_item_v1`. A distinct transaction uses the saved scan/quantity/provenance, existing resolution intent v5, learned receipt v4 and the canonical finalizer. Receipt IDs remain `NEEDS_REVIEW_V2:<review-id>[:An]`; the server closes a review only after exact ledger confirmation. Five saved units are five received units.

Both operations persist actor/request/result in a private RLS-enabled table. Same-operation retries compare the full request. Browser sessionStorage retains pending operation payloads for uncertain responses; it does not authorize or resolve identifiers. Account/pharmacy changes reject late responses. Definitive server rejection permits correction; uncertain outcomes retain the original request.

## Staging database

Only `tovkcakucyagvbzvlnks` through the named Staging connection:

- `20261109135921_receiving_bulk_mapping_review_quick_add.sql`: additive private schema/table/helper and three public RPCs.
- `20261109140305_receiving_canonical_item_lookup_index.sql`: additive non-unique canonical code index.
- Existing public signatures unchanged. No migrations applied to Production.
- Live verification: anonymous EXECUTE absent, unauthenticated calls denied, private table SELECT and helper EXECUTE denied to authenticated, RLS enabled, index valid, zero new operation rows before browser testing.
- Test account `tc26-expiry@example.invalid` exists; active admin membership in synthetic test pharmacy `11111111-1111-4111-8111-111111111111`, Receiving FULL and PHARMACY_GLOBAL. No account permissions changed.

## Executed checks

- 29 targeted tests PASS: 16 new tests + existing pharmacy-identifier and receiving-recovery SQL tests.
- Local SQL tests use actual canonical item/mapping/intent/finalizer definitions captured from Staging; receipt transport and auth context are simulated. These are NOT authenticated live database or browser tests.
- Twelve related test files compared independently against exact Production-base checkout: 10 PASS in both, 2 FAIL in both (`receiving-master-resolution`, `needs-review-auto-allocation`). See regression-comparison.json. No newly failing file in that comparison.
- Broad whole-suite attempts exposed many historical failures and retained handles; interrupted and replaced by bounded file comparisons. No whole-suite PASS claim. Historical `needs-review-quantity` Save-for-Review tests also hung/failed; immediate resolver body is unchanged by this feature.
- JavaScript syntax and diff whitespace PASS. Production-equivalent Vite build PASS. Dedicated Staging Preview build PASS; emitted Supabase configuration and CSP contain only Staging ref.

## Remaining verification and handoff

The existing Staging page was opened in Cloud Browser and reached its login screen. Internal screen visual comparison is blocked by authentication; source style inspection does not count as screenshot acceptance. After isolated Preview deployment, enter the specified test account email and ask the owner to enter only the password in Cloud Browser. Do not request or retain credentials in chat. Continue actual UI and ledger checks with isolated synthetic records, then screenshot review at desktop 100%, 80%, 75%, regression fixes and final diff review. Create the dedicated Draft PR after these checks, per requested execution order.

Required browser scenarios include: new/existing item bulk mappings, Group/empty/duplicate/conflict feedback, saved-review capture with quantity 5, original-order Quick Add, exact ledger total 5, refresh persistence, restricted states, no clipped/overlapping controls. Network uncertainty and concurrent submissions require explicit exercised evidence; local simulation alone does not establish live PASS.

Do not label READY FOR USER ACCEPTANCE before authenticated end-to-end and visual checks complete. Production release is not authorized.
