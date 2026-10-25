# Handheld Receiving header and History release

Production parent / rollback reference: `e98e83a6ab4c7e92089a704a9bf5a76c2f008d8d`.
Deployment: existing GitHub Pages `Deploy Pharmacy Receiving to GitHub Pages` workflow, main, https://ahmed-sh89.github.io/pharmacy-receiving-system/ . Production Supabase remains `zznoshzcyxmtwfbznjyr`.

## Scope and behavior

- Remove Account only from Handheld workspace selection; preserve Receiving, Near Expiry, Sign Out and its pending-sync gate.
- Receiving: Back / Receiving / History, followed by one live connection and assigned-orders dropdown. Back retains the old Mode navigation to workspace selection.
- Assignment remains entirely computer-controlled: the dropdown lists every currently selected Handheld order, never changes the order scope, and explains empty state. No new assignment/selection state.
- One newest-first list, capped at 10 recorded actions/review cases from this device. Recognized records use the existing current-workspace ledger. Unknown records use the existing authenticated `nrV3ListHistory` API. Missing/invalid timestamps are not fabricated. Read failures are explicit. No extra polling or persistent history store.
- Each row expands inline with persisted information. Needs Review case creation time is shown; current case quantity/status can include later updates. Per-scan revisions of a case are not available and are not invented. Pending cases open only that case through the existing resolution workflow; closing returns to the same History with its expansion and scroll position.
- No historical edits or item/order deletion. Existing latest-scan Undo is exposed only in a single currently assigned order with an existing current item, matching original transaction order, latest active scan and current write permission; eligibility is rechecked after confirmation and the existing order-read API must confirm uploaded status before Undo; missing/failed/completed checks deny the correction. The existing undo/compensating-ledger path is retained. Multi-order, unavailable/immutable and older actions are view-only with an explanation. Quantity changes remain available in the existing main controls as new adjustments.
- Escape, backdrop, X, Done, keyboard trapping, scanner focus restoration and account-context cancellation. Orders also suspend scanner refocus while open. Scanner input-value capture, no-Enter processing, inputmode and numeric quantity controls remain unchanged.
- Only scoped Handheld Receiving styling; Expiry implementation, Desktop presentation/business logic, Auth, RPC/RLS, persistence and sync unchanged. Cache versions updated for affected assets only. No migrations and no Production test records.

## Verification

- New isolated Chromium browser suite: **8 PASS / 0 FAIL**, including exact baseline pixel equality for synthetic Desktop and Handheld Expiry surfaces; network blocked.
- Canonical TC26 viewport fixture: **PASS** at 360px width / visible heights 480, 520, 640, plus browser-chrome resizing, reduced keyboard height, main controls, internally scrolling long Orders and History. No page-level Receiving scroll at supported fixture sizes. Content remains internally reachable at smaller heights.
- Selected existing Node tests: **75 PASS / 3 baseline FAIL**, identical before and after this patch. Baseline failures: missing historical Git object `09640864` in scanner negative-control test; missing `window` stub in duplicate-item adjustment harness; stale reports.js cache-version expectation. These are not new runtime regressions and were not changed by this UI release.
- Old receiving-ui.browser.cjs harness: **3 baseline FAIL**, identical baseline/candidate (missing fixture normalization dependency in two Needs Review tests; stale topBarPharmacyCode selector in Desktop test). New source-matched UI fixtures and pixel comparison pass. No claim that the entire historical test suite is green.
- Build, JavaScript syntax and git diff whitespace checks: **PASS**.
- Unchanged backend/Receiving/Expiry/auth/sync source boundaries verified by complete scoped diff against the Production parent.

## Recovery and acceptance

Rollback is a single source revert of this release commit followed by the same Pages workflow; no database recovery or data reset required. Preserve later commits if reverting in a future session. No recovery executed.

Physical TC26 DataWedge speed, soft keyboard/quantity keypad, real device browser chrome, live PC-to-Handheld synchronization and authenticated pharmacy workflows remain **NOT TESTED on device**. No Production transactions, orders, permissions, accounts or Global Master data were changed during verification. Product Owner device acceptance is required; do not mark USER VERIFIED.
