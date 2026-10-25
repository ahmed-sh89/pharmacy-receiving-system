# Authorization release package — SQL compatibility rehearsal passed

Staging-only security work. No Production write, migration, source update or deployment was performed.

Production baseline: `bd20065f0a2c7bb44861df88e1d021225e7c9725`, Supabase `zznoshzcyxmtwfbznjyr`.
Approved source baseline: `644f541c1aa2889cf5ae2f1ce02489da8ff17a0d` on `staging/auth-access-parity-20261024`, Supabase `tovkcakucyagvbzvlnks`.

## Resolved contract blocker — 2026-10-25

The previous rehearsal incorrectly overlaid Production definitions on the Staging schema, where `count_pharmflow_needs_review_v2(uuid,text)` returns bigint. The disposable baseline now restores the verified Production **integer** definition and all relevant schema metadata. No live function was dropped or changed; Production SQL `03` still returns integer. Live Staging remains compatible with its existing bigint definition.

Two additional authorization-package omissions were corrected during the complete rehearsal: `01` now gives the private own-account password flag helper SECURITY DEFINER, exactly matching the verified working Staging helper and its fixed search_path; `02` conditionally revokes the optional Staging-only `rls_auto_enable()` function, which does not exist in Production. No operational function bodies were rewritten.

All **14 numbered SQL files** passed with body validation enabled, including a complete commit and post-commit assertions, whole-release rollback and injected late migration failure rollback. The read-only Production preflight passed (150 definition hashes, required tables, HHP084 membership/bootstrap conditions and legacy table grants). Re-run it immediately before any separately authorized promotion.

`rehearsal/` contains a checksum-verified, empty Production application schema baseline, synthetic fixtures, runner and exact migration checksums. It restores 99 tables, 227 existing public functions, Auth/Storage helpers and required private Expiry dependencies, constraints, role memberships, table/function ACLs, policies and triggers. All 227 captured public definitions matched the live Production catalog before restoration. No account or operational rows were copied; sealed import data and managed net/cron/vault service internals were excluded.

**Scope and platform limitation:** this is a Production-schema/contract-matched SQL rehearsal on local PostgreSQL 17.5 (PGlite 0.3.10); Production runs Supabase PostgreSQL 17.6. The local upstream engine lacks Supabase privileged DDL support, so the runner executes only Storage policy DDL and the pgrst role setting with isolated bootstrap privileges. Application function ownership remains postgres, and authenticated runtime assertions have neither superuser nor BYPASSRLS. This is not a native Supabase/PostgREST/Auth/Storage service or deployed-client rehearsal. Hosted Staging branching was attempted but unavailable on the current plan; no branch or paid resource was created. These limits are recorded, not silently treated as tested platform integration.

PASS evidence: all 227 existing public signatures/return contracts retained, RPC ACLs retained except intentional legacy/superseded APIs, 137 Receiving/Expiry operational bodies unchanged after guard removal, all 99 original table row fingerprints retained (including synthetic legacy history), Receiving/Expiry grouped counts, disabled-module separation, cross-pharmacy denial, permission RLS, HHP084 Global bootstrap, forced-password gate, missing identity denial, all 11 legacy denial ACLs, commit/retry from clean baseline and injected-failure recovery.

The SQL compatibility blocker is resolved. The package is ready for the separately authorized controlled Production promotion process, subject to its release-time environment/deployment gate and authenticated smoke tests; it is not USER VERIFIED.

## Final Admin assignment security correction

Production preflight confirmed public signup with automatic email confirmation. Therefore email_confirmed_at is not an independent ownership signal. New file `09_secure_admin_assignment_claim.sql` uses trusted administrator binding instead: the existing claim RPC returns only a claimed assignment bound to auth.uid(), with an already active Admin membership and active pharmacy, after the password gate. It performs no profile, membership or assignment writes and never grants/reactivates/reassigns an Admin. Anonymous execution is revoked. Signatures and return contracts are unchanged.

Pending email-only assignments remain pending. After the intended account exists, the System Administrator must explicitly use the existing Admin Assignment action to bind that account. Even a confirmed email timestamp alone does not bypass this requirement. Existing direct provisioning and self-registration approval already bind the approved user ID through trusted owner-only RPCs and remain unchanged. Existing administrators and System Administrators retain access. No Auth settings, passwords, email sending, frontend or operational logic changed.

Focused local tests PASS: auto-confirmed and unverified account states, confirmed timestamps, forged user metadata, unauthorized reassignment, pending retries, existing trusted accounts, owner assignment, other-UID isolation, inactive membership, missing identity, anonymous denial and forced-password gate. Native Staging rollback test PASS: initial-permission provisioning/default deny, trusted existing-account claims, retries, email-only pending denial, owner reassignment and suspended pharmacy. No live accounts were created; native tests used existing QA identities and disposable pharmacy fixtures, with rollback.

All 14 numbered release files PASS the same complete Production-schema rehearsal with commit, explicit rollback and injected late-error rollback. The engine/managed-platform qualifications above still apply. Staging migration: 20261025112556_secure_admin_assignment_claim. Production remains unchanged. Recovery must retain this read-only claim guard; never restore email-only granting as a rollback.

## Implemented and verified on Staging

- Eleven legacy session RPCs retain their signatures but always deny with `42501 / LEGACY_RECEIVING_RETIRED`; PUBLIC, anon and authenticated execution is revoked. Automatic startup/reconnect, URL join and legacy polling are dormant. Historical session data and local queues are retained.
- Forty-seven additional Production Receiving definitions received authorization guards. Original operational bodies, signatures, return values and execution privileges were compared with the inspected Production snapshot. Two review paths additionally require Item & Barcode write permission. Manifest/history reads are protected; mixed workflow reads require the applicable module, or both modules when unfiltered.
- Three missing Staging dependency tables were created empty, with RLS and guarded write triggers. Existing history read policies are constrained by restrictive module policies. Production already has these dependencies; its legacy tables have no anon/authenticated table privileges.
- Disposable fixtures were enclosed in BEGIN/ROLLBACK. PASS: 47 Disabled denials, 47 cross-pharmacy denials, 11 legacy RPC denials for both anon and authenticated, Enabled manifest/receipt/history, receipt and completion retry idempotency, Delete confirmation/data removal, Finalize validation, Reset success and injected-failure atomic rollback, historical preservation, Read Only and direct history RLS.
- PASS: 22 focused source tests; Staging build; 22 rolled-back dependency/guard/retirement replay units; Production source patch clean application/build and Production-only connection metadata.
- NOT TESTED: physical Handheld/PC synchronization, authenticated deployed browser/Production smoke, actual Production deployment configuration and native Supabase service rehearsal. Full Production-schema SQL rehearsal and read-only Production preflight now PASS as qualified above.

## Candidate contents and dependency order

`source.patch` is based on the verified Production source, includes the approved authorization/Access Management changes plus session retirement, and adapts the Supabase URL/public key, CSP, Edge environment assertion and build metadata to Production. It excludes Staging-only migrations and diagnostics. It applied and built successfully in an isolated local candidate; no source ref was promoted. The build supports Vercel main/production or GitHub Pages with `GITHUB_SHA` metadata.

The numbered SQL files are **candidate release inputs, not an instruction to execute now**. The complete numbered sequence was rehearsed in one transaction against the disposable Production-schema baseline:

1. `00_account_contract_qualification.sql`, `01_password_gate.sql`, `02_permissions_foundation.sql`.
2. `03_production_existing_rpc_guards.sql`: 91 existing Production bodies with only approved authorization guards. Five Staging-only Expiry APIs are explicitly excluded in `verification.json`.
3. `04a` through `04e`: UUID permissions cutover, password read policies, safe Read Only generation bootstrap, idempotent provisioning and explicitly selected initial permissions. New pharmacies default deny; existing UUIDs and HHP084 Global bootstrap are preserved.
4. `05_receiving_compatibility_helper.sql`, `06_legacy_retirement.sql`, `07_receiving_compatibility_guards.sql`, `08_receiving_compatibility_rls.sql`.

Never run `STAGING_ONLY_receiving_dependencies.sql` on Production. Never blanket-push the root Staging migration directory to Production. The one-time authorization foundation is not replayable after commit; use recorded migration history and forward recovery. The Receiving guard/helper/retirement DDL was separately replayed safely.

## Release-time preflight and gate

Re-read main/Staging heads and inspect `source.patch`; require the approved exact SHAs. Run `production-preflight.sql` read-only against the Production project. It checks 150 exact function definitions, required operational tables, HHP084 active admin membership, no exposed legacy table API and absence of an existing request hook/private authorization installation. Stop on drift or partial installation. Verify constraints, RLS/policy snapshots and account totals against the rehearsal. Verify the actual deployment project, Production domain, branch main, Production Supabase URL/public key, Auth redirect allowlist, Edge secrets and JWT verification; do not print secret values. Review the completed schema/contract rehearsal and its platform limits before writes; verify the actual Supabase privileged migration executor and deployment configuration at release time. Take schema/function/ACL/policy and deployment snapshots immediately before the separately authorized promotion.

## Recovery

Before database commit, any error must ROLLBACK the complete release transaction; do not leave a partial foundation. Injected Reset failure already proved operational statements roll back together. After commit, retain authorization policies, permission rows, review capture and legacy denial. Correct a failed guarded definition forward with its original Production body plus the verified guard, in a transaction; re-run the exact failed test and contract checks. Do not re-grant legacy access, drop permission/review tables or reset operational records. If frontend regression occurs, roll back to the recorded previous Production deployment while retaining database security and correct forward; old legacy clients will remain denied. The original function signatures and return contracts remain compatible with the previous source; deployed-client rollback must be checked during controlled promotion.

## Focused Production smoke plan (separate authorization required)

Use existing authenticated accounts and read-only screens only: System Administrator Access Management and saved permissions; existing HHP084/another Pharmacy Admin account context and isolation; Receiving/Expiry screen availability; active manifest and history reads; hidden/denied modules and anonymous legacy denial; password-change gate and sign out. Confirm deployed SHA and Production Supabase via version metadata and network requests. Do not run create/join, delete/finalize/reset or create test accounts/operational records in Production. Stop and recover on any error; report USER VERIFICATION pending.
