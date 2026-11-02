# AUTH-SESSION-001 — 2 November 2026

Status: READY FOR STAGING PREVIEW / NOT USER VERIFIED. No Production release authorized.

Production baseline: `0d548037e21eeba25fb362356cf658b91cb02573` (PR #38).
Branch: `fix/auth-session-001-staging-20261102`.
Production Supabase: `zznoshzcyxmtwfbznjyr` (read-only definitions inspected).
Staging Supabase: `tovkcakucyagvbzvlnks`.

## Confirmed cause and remaining uncertainty

The current runtime uses custom REST Auth, not supabase-js/onAuthStateChange. No PASSWORD_RECOVERY/SIGNED_IN/INITIAL_SESSION/TOKEN_REFRESHED/USER_UPDATED SDK listener drives this UI. Refresh, storage notifications, startup restoration, recovery URL parsing and RPC errors were traced in the loaded `js/auth.js`.

Live read-only Production definitions confirmed that SEC-007 `pharmflow_auth_private.password_change_complete()` combines the server-owned mandatory-password flag with JWT expiry and existence/expiry of the exact auth.sessions row. `public.pharmflow_password_change_request_guard()` emits PASSWORD_CHANGE_REQUIRED whenever that combined test is false. The frontend previously set mustChangePassword=true and rendered the forced-password form immediately on that RPC error, without checking the actual flag. Thus an expired/revoked session can be mislabeled as a temporary-password session. This classification defect is CONFIRMED; the historical trigger for the owner's two interruptions is UNCONFIRMED because incident-time browser/network evidence was not available. Clearing cache is a reported recovery action, not established causation. SEC-006 Edge handlers are untouched; no evidence points to leaked-password screening as the cause.

## Changes

- `js/auth.js`: classify the ambiguous rejection through authenticated GET /auth/v1/user. Only boolean true in server-returned app_metadata opens mandatory-password UI. A normal user gets at most one existing single-flight refresh and RPC retry. Continued denial fails closed to sign-in. Network failures do not invent password requirements. Identity epoch and session checks discard late results after logout/account change.
- Session restoration now goes through persistAuthSession so the existing startup revalidation actually sees a stored mandatory-password flag. A completed reset can clear stale metadata only after Auth confirms it.
- `index.html`: auth script version changed for cache invalidation.
- `tests/auth-session-001.test.cjs`: 17 isolated automated lifecycle scenarios.
- `staging/build-auth-session-001.cjs`: exact-branch Preview-only output builder; unchanged Production build gate and config remain the default. Overrides only dist configuration, CSP and version identity to Staging. Vercel deployment must explicitly use this build command. Never promote this Preview artifact to Production.

No DB/schema/RLS/grants/Edge changes. No reset, credential rotation, security disabling or operational data writes. Server authorization remains authoritative. No changes to transaction allocation/idempotency, permissions or module business rules.

## Verification actually executed

80/80 focused Node tests PASS: new lifecycle tests, restored-session validation, Auth request deadlines, both password Edge handler security tests, SEC-007 session gate/rollback tests (isolated PGlite), sleep/wake permission/account isolation, order import authority, source security and Auth viewport checks.

Production-default Vite build PASS. Preview-output build PASS; CSP and client URL use Staging only, version metadata identifies Staging. git diff --check PASS.

Existing `tests/settings-account-access.test.cjs` FAILS at 'Owner approval must assign official identity'. Reproduced the same failure on pristine verified Production HEAD in a separate temporary directory. This is a pre-existing static-contract test failure; no unrelated fix attempted. Do not claim the entire repository test suite is green.

Real browser suite was attempted but could not launch because Chromium is absent. Browser download returned truncated archives; no browser PASS claim. Live account login, live multi-PC receiving and real reset/temporary-password acceptance remain NOT RUN. New concurrency tests use independent simulated device stores, not physical PCs. Recovery tests cover routing; existing Edge tests mock Auth and do not reset real passwords.

Next: inspect exact Preview deployment SHA, Staging URL/key/CSP, open Preview for owner acceptance. Verify normal login/reload, Receiving continuity through refresh, and genuine approved password flows with disposable Staging accounts when available. No Production merge/deploy approval requested before Staging acceptance.
