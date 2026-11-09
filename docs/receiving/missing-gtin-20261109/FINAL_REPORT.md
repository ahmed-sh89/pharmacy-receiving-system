# Receiving bulk mapping and saved-review Quick Add

**Status: STAGING FUNCTIONAL PASS — ZOOM VERIFICATION BLOCKED.**

Both features are implemented and authenticated functional flows passed. Do not label the release READY FOR USER ACCEPTANCE until the requested 75–80% visual check is completed. No unresolved critical functional defect was observed in the executed scope.

## Development and release identity

- Branch: `feature/missing-gtin-bulk-staging-20261109`.
- Exact delivery HEAD and Draft PR are pinned in the PR/final delivery message; this report is part of that same commit.
- Stable Preview: https://pharmflow-test-git-feature-missing-gtin-7570d6-fhyh2xtskz-3504.vercel.app/
- Verified Production main remains `7e9cad2177131e80735016fde35014deb3c5a390`.
- Production was not merged, deployed, queried for pharmacy data, or modified. No Production SQL or Edge Function changes.

| Files | Responsibility |
|---|---|
| `ui.js` | Existing Missing GTIN panel, saved-review resolver tabs, confirmation states and synchronized summaries |
| `js/identifier-service.js` | Sole browser RPC boundary, identity fences, shared projection reads, durable uncertain-operation payloads |
| `js/pharmflow-next.js` | Hydrate authoritative identifier health after Manage Orders manifest loading |
| `js/excel.js` | Missing GTIN uses the matching server projection, with existing local fallback |
| `js/receiving.js` | Shared captured-order search/Group rendering and saved-review allocation preparation |
| `js/permissions.js` | Register the new RPC rules without changing grants |
| `css/pharmflow-next.css` | Scoped Receiving panel/control styles |
| `vite.config.js` | Exact dedicated branch allowlist and isolated Staging build configuration |
| Two new SQL migrations | Atomic server contracts, private operation results and canonical lookup index |
| `tests/receiving-admin-*.test.cjs`, fixtures | Executable client/SQL fault, quantity and authorization tests; isolated browser orders |
| This directory | Checkpoint, comparison results, live database evidence and screenshots |

## Root causes and resulting behavior

Missing GTIN previously derived its meaning solely from workspace mappingData. The existing V2 IndexedDB compatibility cache intentionally includes numeric identifiers only; it cannot establish whether an item has any authoritative identifier. The new server projection reads the current Active Order Manifest, canonical Global item identity, Global identifiers and pharmacy override precedence. Manage Orders loads it once after manifest authority; overlapping requests join one in-flight read. Matched and missing counts now use the same pharmacy/workspace-bound projection, including after Refresh. Failed reads show Checking/Unavailable instead of a false authoritative number. No new polling or alternative identifier authority was introduced.

Bulk mapping shows one row per canonical Item Code, including codes shared by Orders. Item Code/Name are reused, existing approved Global attributes are retained, and only genuinely new items require Group. One Save All submits filled rows in a single transaction. Canonical ambiguity, duplicate barcodes, cross-item conflicts, unavailable source Orders, authorization and request replay are enforced on the server. A failed row rolls back the entire submitted batch. Confirmed rows remain Saved if a later projection/cache refresh fails, and cannot be accidentally resubmitted.

Saved-review Quick Add uses the original saved identifier, quantity and order evidence. It never invokes the immediate receiving Quick Add transaction. The new atomic wrapper composes the existing resolution intent v5, learned receipt v4 and canonical review finalizer, retaining `NEEDS_REVIEW_V2:<review-id>[:An]` receipt IDs. The review closes only after its exact ledger evidence is confirmed. Five pending units remain five received units.

The actual UI also exposed stale review Items/Units badges and inconsistent Data Health counts. Both were corrected at their rendering/authority boundaries and tested.

## Staging database

Only project `tovkcakucyagvbzvlnks` was modified, through its named Staging connection.

| Migration | Additive changes |
|---|---|
| `20261109135921_receiving_bulk_mapping_review_quick_add.sql` | Private `requests` table and shared mapping helper; three public RPCs below |
| `20261109140305_receiving_canonical_item_lookup_index.sql` | Non-unique expression index for canonical Global Item Code lookup; existing collisions remain detectable |

Public RPCs:

- `get_pharmflow_workspace_identifiers_v1`: scoped read projection.
- `map_pharmflow_workspace_identifiers_v1`: transactional bulk mappings.
- `quick_add_pharmflow_saved_review_v1`: transactional saved-review create/link/resolve.

Existing contracts/signatures are unchanged. New writes require Receiving FULL, Global write access, authenticated valid-session authorization and pharmacy-admin scope. Existing audited Global creation/add contracts remain responsible for item/mapping writes. No direct frontend table writes or permission elevation were added.

Request/result replay is scoped to pharmacy, operation ID and actor, with exact payload equality. Short locks serialize concurrent compatible administration writers. Identifier uniqueness remains enforced; a conflicting mapping is never overwritten. RLS is enabled on the private operation table; schema/table/helper access is revoked from clients. Authenticated users can execute only the guarded public contracts. Actual unauthenticated calls were denied; anon EXECUTE and private client access were verified absent. The canonical index is valid.

The existing test account `tc26-expiry@example.invalid` was verified as an active Admin in synthetic pharmacy A, Receiving FULL and PHARMACY_GLOBAL. Its permissions were not changed. Owner passwords were entered directly in Cloud Browser and were not read or retained.

## Executed tests

Latest targeted run: **52 PASS / 0 FAIL** across the new client/SQL tests, pharmacy identifier tests, receiving recovery SQL, active-order authority and import authority.

Related regression comparison against the exact main checkout: **10 files PASS in both; 2 files FAIL in both** (`receiving-master-resolution`, `needs-review-auto-allocation`). The historical failures refer to superseded expectations already failing on main. The comparison was rerun after the changes; see `regression-comparison.json`. Broad full-suite attempts exposed inherited failures/retained handles and were interrupted. This is not a whole-suite-green claim.

Production-equivalent build, isolated Preview build, JavaScript syntax and whitespace checks passed. Emitted Preview version/configuration/CSP were checked against the Staging ref; Production source configuration is retained for normal builds.

| Scenario | Evidence/result |
|---|---|
| New and existing Global items in one Save All | Actual UI saved 3 mappings; created A1/A2 once; existing 1053331 retained original name and HomeHealth Group |
| Multi-order duplicate Item Code | A1/A2 appeared once each, Ordered 15 across Orders A and B; memberships/source rows preserved |
| Empty barcode / missing Group / duplicate submission barcode | Actual UI rejected each; no write success shown |
| Cross-item identifier conflict | Actual server rejected the 3-row batch; verified zero new item/mapping/operation rows before correction: complete rollback |
| Repeated Save All | Confirmed rows skipped; no additional mapping/receipt was created |
| Save for Review quantity 5 | Actual scan, original Order A and saved pending quantity verified on server |
| New-item saved-review Quick Add | Actual code search/selection, Group gate, create/link/resolve completed |
| Exact quantity safety | One receipt totaling 5 on original Order A, review RESOLVED; report displays Received 5 |
| Refresh persistence | Session retained; review count 0 and same ledger total after reload |
| Existing-item Quick Add | Existing A1 reused, Group read-only Medicine, no duplicate Global item |
| Simultaneous resolution | Two authenticated browser windows submitted the same quantity-2 review; one receipt totaling 2, correct original Order A |
| Summary corrections | Actual final build showed 7 loaded = 6 matched + 1 missing; winning review pane showed 0 Items / 0 Units |
| Network uncertainty / response mismatch / changed identity | Executed local service tests retain the original operation and reject false confirmation |
| Post-commit projection failure | Executed real-panel handler locally; confirmed rows remain Saved and cannot resend |
| Unauthorized/cross-pharmacy calls | Executed SQL/client authorization tests; live unauthenticated denial and ACL/RLS inspection; no live second-pharmacy credential was available |

The local SQL tests use canonical Staging item/mapping/intent/finalizer definitions, with simulated auth and receipt transport. They are not represented as live browser tests. The actual end-to-end quantity/ledger results above are separately recorded in `browser-database-evidence.json`.

All writes used isolated Staging fixtures. Original receiving receipt fingerprint remained unchanged. Two synthetic orders, three synthetic new Global items, their mapping/audit evidence and resolved test reviews remain on Staging for inspection. No cleanup of historical/real records was performed.

## Visual and security limits

Actual screenshots were inspected at the available 1363×936 desktop viewport: readable long names, consistent controls/spacing, separated actions, no overlapping click targets or horizontal overflow in the new panels. Final images are `bulk-final.jpg`, `review-existing-final.jpg`, `review-closed-final.jpg`, and `receiving-five-final.jpg`. The two round-1 `*-100.jpg` captures predate the summary fixes.

**75–80% zoom: BLOCKED.** Chrome zoom key attempts did not change measured viewport width (1363 CSS px) or modal width (1040 CSS px). They must not be described as successful 75/80% tests. Owner visual verification at actual Chrome 75–80% remains required.

Live browser network fault injection and physical Zebra testing were unavailable. Network failure semantics were tested locally; handheld scanning architecture was preserved, but this is not a new physical TC26 certification. No broad security certification or exhaustive live account-matrix claim is made.

Security advisors were reviewed for the new objects. The private table's no-policy INFO is intentional deny-all client access. Authenticated SECURITY DEFINER warnings identify the three intended guarded RPCs; public/anon execution is revoked and the existing server authorization checks execute first. No new anon-executable function finding was reported. Broader inherited Staging notices were left outside this feature scope. Scoped findings and provider explanation links are in `security-advisors-scoped.json`.

## Minimal owner acceptance

1. At actual Chrome 75–80%, visually inspect Missing GTIN and a selected saved-review Quick Add card for readable controls/spacing.
2. Confirm the design is accepted, or identify the specific visual issue.

No SQL, code edits, test troubleshooting or Production action is requested. Keep the PR Draft; promotion requires separate explicit authorization.

Provider advisory references:

- [rls_enabled_no_policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [authenticated_security_definer_function_executable](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
