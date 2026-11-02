# PharmFlow P1 Handheld/Auth hotfix — 2 November 2026

Status: VERIFIED AUTOMATED / RELEASE GATES IN PROGRESS; physical Zebra acceptance NOT USER VERIFIED.
Owner explicitly authorizes guarded Production merge and official GitHub Pages deployment after passing gates; no backend/schema/operational-data changes.
Baseline main and served Pages: `0d548037e21eeba25fb362356cf658b91cb02573`.
Branch: `hotfix/handheld-auth-production-20261102`.

## Confirmed causes

HANDHELD-RECEIVING-001: loaded `js/handheld-runtime.js:hhReceivingSessionReady` read `window.PharmFlowCloudWorkspace.startupAuthorityReady`. Actual root `cloud-workspace.js` declares `const PharmFlowCloudWorkspace`, which is a global lexical binding, not a window property. Thus every Zebra scan returns the reported warning before queue/resolver/save, despite scoped Desktop authority being READY. Reproduced using the actual Production declaration and readiness functions in a classic-script VM with window equal to the global object. New tests fail on original Production and pass after the fix. The served handheld/auth files matched main byte-for-byte. No service-worker registration in the loaded entry/runtime paths; stale cached code is not needed to reproduce this defect.

AUTH-SESSION-001: live Production function definitions rechecked read-only. SEC-007 password_change_complete also tests JWT expiry and exact auth.sessions existence/expiry; its request guard raises PASSWORD_CHANGE_REQUIRED for every false result. The frontend previously interpreted this ambiguous denial as a mandatory-password requirement. The false UI route is confirmed. The incident-time reason that a particular session was rejected remains unobserved; do not claim token refresh or browser cache independently caused it. A rejected persisted session can recur after reload; removing site data removes that session. Tests now verify rejected saved credentials recover to login without deleting pending Receiving state or clearing unrelated storage.

The causes are independent: fixing Auth alone cannot repair the Zebra lexical/window mismatch.

## Exact changes

- `js/handheld-runtime.js`: use shared getReceivingHydrationState (READY/EMPTY), with active session, pharmacy context and existing Receiving write permission. Canonical authority already checks identity epoch, pharmacy, manifest and ledger scope. EMPTY retains approved Unassigned capture. No change to scanner transport, parsing, allocation, queue IDs or server saves.
- `js/auth.js`: reuse the runtime correction from PR #39 / 1fe07f9. Auth user endpoint verifies the server-owned mandatory-password boolean. Ordinary ambiguous denials get one existing single-flight refresh/RPC retry; continued denial returns to login. Genuine password requirements remain gated. Late results cannot overwrite a changed identity. Restore revalidates stored mandatory metadata. Backend revocation/security gates unchanged.
- `index.html`: version both changed scripts to P1_HANDHELD_AUTH_20261102.
- Focused tests for both incidents; existing protected PR CI includes them.
- No Staging builder/config or unrelated PR #39 documentation included in this Production hotfix.

## Executed evidence

Initial combined relevant regression run: 219 total, 217 PASS, 0 FAIL, 2 SKIP (two unavailable real supplier files). Includes exact existing protected CI test commands plus Auth viewport/order authority tests. Final incident suite after adding 3 extra Auth cases: 37 PASS, 0 FAIL. These test groups overlap; do not add their counts.
Build PASS; syntax checks PASS; git diff --check PASS; npm audit: 0 vulnerabilities.
Tests cover actual canonical Desktop/Zebra authority, selected order/scans, scoped initialization, EMPTY/Unassigned, logout, password required, account/pharmacy changes, session expiry/revocation, persisted rejection without cache clearing, refresh races, pending-state retention, fixed operation ID and one simulated commit after a pre-request denial. Existing queue/idempotency and isolated PGlite session-security tests also executed.
These are automated fixtures, not physical Zebra scans or authenticated live pharmacy writes. No operational writes, password changes, account creation or credential rotation performed. No production login available for live authenticated smoke yet. Do not claim USER VERIFIED.
Known unrelated `settings-account-access.test.cjs` failure from PR #39 remains a baseline static-contract issue; it is outside these changes/required CI commands. No assertion that the full historical suite is green.

## Safety and rollback

No migration required or performed. Supabase URLs/public config, RLS, ACLs, password Edge handlers and Leaked Password Protection are unchanged. Production is GitHub Pages; vercel.json continues to disable main automatic Vercel deployment. Only normal protected-PR merge is permitted; never bypass a failed check.
Rollback: revert this hotfix PR's merge through a dedicated revert PR and the same protected checks, then verify official Pages version/assets. Restore only index.html, js/auth.js and js/handheld-runtime.js runtime changes; no DB rollback/data edits/storage clearing. This restores the prior known defects, so use only for a new regression. Do not auto-refresh an active device or discard pending queue items.

Next: record PR/head, await required GitHub CI, recheck main baseline and exact diff, merge only if green, verify Pages workflow/version/auth/handheld bytes and non-destructive public page load. After deployment, owner acceptance: on real Zebra select the order, scan one known item, verify Ordered/Received/Remaining and one intended quantity update, check Desktop synchronization; verify no spurious forced-password screen during refresh/resume. Legitimate temporary-password/recovery acceptance needs a separately approved disposable account; do not reset Production accounts as smoke testing.
