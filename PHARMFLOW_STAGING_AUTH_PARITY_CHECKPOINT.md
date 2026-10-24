# PharmFlow Staging Auth & Access — 24 October 2026
Status: READY FOR PRODUCT OWNER TEST. Not USER VERIFIED / DONE.
Branch: staging/auth-access-parity-20261024.
Task 01B parent: f1afebc4b5fc791194281419bcc097b67e64c448.
Staging Supabase: tovkcakucyagvbzvlnks.
Preview: https://pharmflow-test-git-staging-auth-access-p-ea871d-fhyh2xtskz-3504.vercel.app
Exact current deployed SHA is stamped in Preview version.json.
Production zznoshzcyxmtwfbznjyr and main were not modified.

## Preserved parity
Task 01 restored missing Auth/Access invitation, registration, assignment and password dependencies. Existing roles, tenant isolation and operational code remain intact.
Task 01 migrations: 20261024145354, 20261024145829, 20261024145926.
Password Edge Function remains byte-identical to the Production baseline, with JWT verification enabled.
Task 01 code: 215499883cb8178d9c0d5805546deff55615e31f; closure: f1afebc4b5fc791194281419bcc097b67e64c448.

## Task 01B security gate
Migration: 20261024154211_staging_password_change_security_gate.sql.
Root cause: mandatory password replacement was a browser flag; business RPC authorization did not check it.
The reusable private guard reads current auth.users.raw_app_meta_data for auth.uid(), ignoring user-editable metadata and stale JWT flag values.
PostgREST pre-request enforcement denies business REST/RPC routes while mandatory replacement is active. Exact exceptions cover public setup, own identity/context/registration status, and signed Expiry session cleanup. Auth password/logout endpoints and the existing password Edge completion remain usable.
Restrictive RLS policies protect the directly granted Expiry tables and Storage objects outside the Data API hook. Existing RLS, membership, role checks and idempotency logic were not weakened.
The client locks on PASSWORD_CHANGE_REQUIRED, blocks resumed workspace boot/pending assignments, and obtains a fresh Auth session after password replacement before reopening session-bound Expiry operations. If reauthentication fails, it stays at login using the new password.

Changed Task 01B files: js/auth.js; the migration above; tests/password-change-gate.test.cjs; this checkpoint.

## Verification
PASS: build and 36 focused automated tests, including lock/resume, server-rejection handling, fresh-session completion and failed-reauthentication recovery.
PASS with real Staging sessions: ordinary Receiving order write; Expiry capture write and idempotent retry.
PASS: System Administrator reset; pre-reset old JWT and temporary-password JWT denied business Receiving/Expiry reads and writes and Access Management RPCs; GET RPC and direct REST table variants denied.
PASS: current-user identity context and Sign Out remain available; changing user_metadata cannot bypass the server-owned flag.
PASS: forced Storage upload rejected by RLS; a rollback-only authenticated SQL/RLS probe sees zero Expiry rows while password replacement is required.
PASS: password replacement through existing Edge Function; same stale flag JWT accepted by the current-state gate after completion; Receiving write restored; fresh valid Auth session restores signed Expiry capture; final password login.
PASS: another normal user remains unaffected, cross-pharmacy membership is denied, and a Pharmacy Admin cannot become System Administrator.
Denied order registrations left no rows. Only isolated QA data was used. Credentials, tokens and temporary passwords are excluded from Git and reports.
The prior Task 01 server-gate FAIL is now resolved on Staging only.

## Limits and next action
A previously issued signed Storage URL remains usable until its existing expiry; cached/downloaded data cannot be recalled by this gate.
Physical Handheld and complete signed-in browser acceptance remain unverified. Do not claim a complete suite run.
Product Owner: Reset a Parity QA Admin in the Preview, verify forced replacement, then save isolated Receiving/Expiry entries and sign out/in. No Phase 1 development or Production promotion is authorized.
