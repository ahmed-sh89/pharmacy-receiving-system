# Staging Receiving security checkpoint — 2026-10-25

Scope: approved legacy transport retirement and Receiving authorization compatibility only. Production main remains `bd20065f0a2c7bb44861df88e1d021225e7c9725`; Production database read only.

Staging source baseline `644f541c1aa2889cf5ae2f1ce02489da8ff17a0d`. Current task changes `js/supabase.js`, focused tests, 15 applied Staging migrations and `release/authorization-20261025`.

PASS: 47 Disabled and 47 cross-pharmacy denials; 11 legacy RPCs blocked for both anon/authenticated; Enabled manifest, history and receipt; Delete/Finalize/Reset compatibility, retry idempotency and injected-failure rollback; historical data preservation; Read Only and RLS. All SQL fixtures rolled back. Forty-seven original Production operational bodies remain unchanged after removing the inserted authorization guards; signatures, return contracts and ACLs match.

PASS: 22 focused Node tests, Staging build, 22 Receiving DDL replay units, isolated Production candidate patch application/build with Production-only metadata. Two pre-existing test assumptions were corrected (missing window mock; expanded report cache version), without application behavior changes. Physical Handheld/deployed browser smoke not tested.

NOT READY for Production: original-Production full guard rehearsal failed on `count_pharmflow_needs_review_v2(uuid,text)` return type: Production integer vs Staging bigint. No DROP or return-contract change performed. Full rehearsal stopped. Rehearse the complete release on a disposable Production-matched database before promotion. Candidate SQL, source patch, preflight, recovery and smoke plan are recorded in the release package; no Production promotion was executed.


## Final Production contract rehearsal — 2026-10-25

Resolved the prior rehearsal setup mismatch by restoring Production's integer count contract in an empty local Production-schema baseline. No changes to the live Staging bigint contract, Production schema or 46 historical sessions. Updated only release-package SQL, rehearsal/evidence and checkpoint files.

All 13 numbered candidate SQL files PASS, including commit/post-commit assertions, full rollback and injected late-failure rollback. PASS: 227 original public signatures/results retained, 137 operational bodies unchanged after authorization guards removed, RPC ACL preservation except intentional retirement, 99 original table row fingerprints unchanged, Receiving/Expiry grouped counts and separate module enforcement, cross-pharmacy isolation, permission RLS, HHP084 Global bootstrap, password replacement gate and missing identity denial. Production read-only preflight PASS (150 definition hashes plus account/dependency checks).

Package fixes: private own-account password helper SECURITY DEFINER matches verified Staging; optional Staging-only rls_auto_enable revoke is conditional. No count function DROP, public return-contract change or Receiving redesign. Existing passing Receiving tests were not repeated.

SQL compatibility readiness: READY for controlled Production promotion process, with mandatory release-time deployment/environment checks and authenticated smoke; not USER VERIFIED. Rehearsal engine is local PostgreSQL 17.5/PGlite 0.3.10, target Supabase PostgreSQL 17.6; only Storage policy and pgrst setting DDL privilege support is adapted. Native managed service/deployed-client integration NOT TESTED. Hosted Staging branch creation was unavailable on the current plan and created no resource. See release README and rehearsal/result.json for exact limits.


## Final Admin assignment blocker — resolved on Staging

20261025112556_secure_admin_assignment_claim applied on Staging only. Email-confirmed timestamps cannot distinguish automatic confirmation from ownership proof. The claim RPC is now a read-only projection of an existing active Admin membership plus claimed assignment bound to the authenticated user ID, gated by password replacement. It cannot create/reactivate/reassign membership or consume pending email-only assignments. Trusted owner assignment after account creation, existing provisioning and self-registration approval remain the supported grant paths. No Auth config or frontend change.

PASS: focused local claim scenarios and native Staging existing-account provisioning/assignment/default-deny/retry/suspension tests (disposable fixtures rolled back). All 14 numbered release files pass complete Production-schema commit/rollback/failure-recovery rehearsal with the previously documented local engine/platform limitations. No separate Receiving/Expiry test cycle. Production main/database and historical sessions unchanged. READY for controlled promotion, with release-time environment checks and authenticated smoke required; not USER VERIFIED.
