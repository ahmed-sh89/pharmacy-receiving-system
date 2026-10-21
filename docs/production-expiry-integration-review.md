# Production/Expiry isolated integration review — 15 October 2026

Candidate branch: integration/production-expiry-20261015 (LOCAL ONLY).
Parents: Expiry93fba99a87c5c5a981cddbcef5555033e46ed5d8; Production26da5078163f69ca76a9169dd8d97365d7ba6c54.
Merge base036ff5c7de988e5db06de1a2ddf779daef814164. Complete true merge; no cherry-pick/ours/theirs strategy.

## Conflict resolutions
- index.html stylesheet conflict: new PROD_EXPIRY_INTEGRATION1 versions for merged shared CSS/identity; retain HANDHELD_VIEWPORT3 receiving surface and all accepted Expiry assets.
- index.html UI conflict: unified new cache version for merged ui.js; retain Production barcode/filter/quantity changes and Expiry review/idle behavior.
- index.html cloud/version conflict: unified new cloud cache version; app-version loaded exactly once after cloud and before app bootstrap; all Expiry scripts retained.
- cloud reset conflict: retain lastManifestResponseEmpty plus activeManifestReadSerial, lastManifestPullAt and lastManifestPullError resets.

## Proven integration corrections
The empty-manifest optimization can return synchronously before syncPromise initialization. Move promise cleanup to outer await/finally; retain busy/authority semantics and overlapping request sharing. Regression reproduced and corrected.
Production version-refresh guard originally checks Receiving only. Add conservative local Expiry capture/draft checks, including cross-tab scoped drafts and unreadable local queue; no network and no reload with uncertain capture. Ordinary version detection unchanged.
Cleanly merged ui.js and css/pharmflow-next.css reviewed; no blanket source replacement.

## Verification
Full npm test:755 tests,712 passed,42 failed,1 skipped. Build PASS. Diff check PASS.
Exact Expiry baseline:725 tests,681 passed,43 failed,1 skipped.
Exact Production baseline:90 tests,72 passed,18 failed.
Every remaining candidate failure name reproduced in one/both baseline suites; ZERO new failure names.
Focused operational suite:619 passed,0 failed (Expiry, Receiving safety/allocation/startup, barcode scope, version safety, empty-manifest/request tests, integration tests).
Eight Expiry runtime modules byte-identical to accepted Expiry head. Auth/config/Handheld/scanner/identifier/review/dashboard owners also byte-identical. Production-only app/reports/receiving-release/workflow/version/identity/style owners byte-identical to verified main.

## Gate
No push or deployment. No database/SQL/Supabase actions. Original main and Expiry branch untouched. Original dirty worktree and its index preserved; backup exists separately.
Candidate is prepared for review. Unconditional clean full-suite approval is NOT available:42 documented baseline failures remain; no unrelated test rewrites attempted.
Live startup/Receiving KPI and barcode override, idle/version refresh, multi-PC isolation/sync, Handheld scan, Expiry save/refresh/Edit/Delete and1366x768 visual behavior remain READY FOR USER TEST on a separately approved Staging deployment. Do not overwrite existing Preview without explicit approval.

## Remaining baseline failure names
- Desktop exposes Current Expiry workspace while Handheld keeps it out of shelf workflow
- Expiry Desktop uses explicit Desktop fallback operator while preserving Handheld selection
- Expiry Session Activity renders corrected current-state values after Edit
- Expiry cleared current state remains in Session Activity as Deleted
- Expiry desktop Scan Search uses authoritative V2 product and identifier services
- Expiry desktop correction is inline and no browser prompt patch remains
- Expiry desktop current list exposes Category filter and edit-delete controls
- Expiry desktop has one canonical visual owner with no stacked override layer
- Expiry desktop hides duplicate Last Scan surface without changing Handheld item card
- Expiry desktop keeps page fixed and scrolls only Current Expiry List
- Expiry desktop operations keep operator optional while Handheld remains guarded
- Expiry desktop paste routes barcode-like identifiers through scan resolution
- Expiry desktop search dropdown is not clipped by legacy scan-box overflow
- Expiry desktop separates recent operational work from full current state
- Expiry desktop session survives route navigation and resets only on sign out
- Expiry desktop table remains readable and visually structured
- Expiry edit action column has room for Save and Cancel in both desktop views
- Expiry inline edit exposes both Save and visible Cancel actions
- Expiry is reachable from both Desktop sidebar and Handheld workspace chooser
- Expiry known-item save uses additive V2 current-state RPC
- Expiry manual search reuses Receiving result hierarchy and authenticated Global V2 contract
- Expiry normalizes optional capture worker UUID and blocks unsafe legacy review writes
- Expiry session quantity is neutral and capture keeps authoritative state id
- Handheld multi-order Needs Review snapshots device scope and defers Order assignment to PC
- Manual search selection renders Active Item and save feedback is strongly visible
- Needs Review persists a durable intent and keeps original order scope
- Needs Review preserves the captured identifier and requires original Order attribution
- PC unknown-identifier review requires an explicit active Order and uses an allowed review reason
- Receiving search quantities and order picker have one desktop visual owner
- Reset applies an empty authoritative manifest to the active-order UI immediately
- Settings leads with simplified Barcode Management while preserving import compatibility
- Stage 2 loads one coherent cache-versioned startup asset set
- Stage 2 routes receiving identity and Needs Review through V2 contracts
- V2-resolved identifiers retain their exact display value through receiving state and queue upload
- authenticated manifest hydration loads UI globals before the application bootstrap
- completion archives each selected Order and offers a controlled Complete All action
- desktop manual receiving keeps selection and quantity controls prominent without changing handlers
- desktop receiving polish keeps toasts above modals and uses click-only sidebar state
- fresh startup can parse the complete production ui script
- performance correction is applied to active root runtime
- tests/settings-account-access.test.cjs
- visible Settings Barcode Management route exposes the V2 controls before legacy import compatibility
