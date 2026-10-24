# Staging Auth & Access parity — 24 October 2026
Status: IMPLEMENTED / PRODUCT OWNER ACCEPTANCE PENDING. Not USER VERIFIED or DONE.

Production baseline, rechecked after implementation: bd20065f0a2c7bb44861df88e1d021225e7c9725.
Staging branch: staging/auth-access-parity-20261024.
Runtime code commit: 215499883cb8178d9c0d5805546deff55615e31f.
Verified runtime Preview: https://pharmflow-test-cllrlsndc-fhyh2xtskz-3504.vercel.app
Stable branch Preview: https://pharmflow-test-git-staging-auth-access-p-ea871d-fhyh2xtskz-3504.vercel.app
Supabase: tovkcakucyagvbzvlnks ONLY. Production received no source, DB, Auth, data or deployment mutations.

## Change scope
Added only required invitation/registration/Admin-assignment/profile-trigger dependencies from live Production definitions. Added pharmacy ID/status defaults and nullable approved_by FK. Preserved existing Staging membership, RLS and operational guards; no broad schema sync and no Phase 1 permissions.
Adapted membership conflict targets to Staging's existing composite PK and qualified invitation output names. No existing pharmacy IDs, roles, users or operational records were copied or replaced.
Deployed pharmflow-password-admin with the exact Production source and verify_jwt=true. Browser configuration is pinned to Staging; connect-src excludes Production. Build guard rejects Production targets and any unrelated branch. Existing Account/Access/Receiving/Expiry/Handheld runtime retained.

Applied Staging migrations:
- 20261024145354 staging_auth_access_production_parity
- 20261024145829 staging_auth_membership_contract_adapters
- 20261024145926 staging_claim_admin_conflict_target

Changed runtime/config files: index.html, js/auth.js (same-origin recovery redirect only), js/supabase.js, vite.config.js, supabase/config.toml.
Added migrations above and tests/staging-auth-parity.test.cjs.
The password Edge Function source already exists unchanged in the baseline repository.

## Verification
PASS: build; 53 focused automated tests (42 Auth/Receiving/Expiry/Handheld checks, 8 Access DOM behavior checks, 3 Staging isolation/forced-password UI/build-guard checks).
PASS with real isolated Staging Auth sessions: email/password login; pharmacy creation; Admin assignment/claim/context; owner pharmacy listing; non-owner owner-list/reset denial; identity Edit; suspension/reactivation; Change Password and subsequent login; owner Reset Password; temporary-password login/required-change flag; completion and subsequent final-password login.
PASS: current Receiving and Expiry read smoke for all three isolated identities.
PASS with rollback-only DB fixtures: self-registration request/owner approval; invitation redemption; cross-pharmacy read of an existing fixture order; no test operational orders remain.
PASS: live Preview HTTP 200, exact SHA stamp, Staging Supabase URL and Production-blocking CSP; deployed password Edge source byte-matches Production.
New invitation table: RLS enabled, no direct anon/authenticated data grants. Advisor comparison: no increase in anonymous SECURITY DEFINER endpoints; additional authenticated RPC notices are expected for the restored guarded contracts. Invitation table has intentionally no direct-access policy.

## Open limitations — not fixed by parity
FAIL: mandatory password-change server enforcement. In an isolated rollback-only probe, an authenticated fixture with pharmflow_must_change_password=true could register an order through the existing RPC. The UI gate passes, but must not be represented as a server guarantee. This is inherited from the current Production design; adding a new global authorization gate is outside this parity task.
NOT TESTED: complete signed-in browser/device acceptance (Chromium download unavailable); public signup email delivery/confirmation (synthetic example.com addresses rejected by Auth). Submission/approval RPCs and unchanged signup UI were checked separately.
No physical Handheld verification. No claim that all operational writes or the complete suite were tested.

Isolated QA identities/pharmacies are distinguishable by the pf-parity- / Parity QA prefix. Credentials, temporary passwords, tokens and session state are excluded from Git and this checkpoint. No Production users, credentials, secrets or operational data were copied.

## Next action
Product Owner accepts the branch Preview with existing Staging credentials, then exercises a Parity QA Admin reset/forced-change flow and opens Receiving/Expiry. Keep the server forced-password gap explicit and obtain separate scope before modifying business authorization. Do not start Phase 1 automatically.
