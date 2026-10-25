# Authorization release package — BLOCKED

Staging-only security work. No Production write, migration, source update or deployment was performed.

Production baseline: `bd20065f0a2c7bb44861df88e1d021225e7c9725`, Supabase `zznoshzcyxmtwfbznjyr`.
Approved source baseline: `644f541c1aa2889cf5ae2f1ce02489da8ff17a0d` on `staging/auth-access-parity-20261024`, Supabase `tovkcakucyagvbzvlnks`.

## Blocking evidence

The original-Production guard rehearsal stopped with PostgreSQL `42P13`: `count_pharmflow_needs_review_v2(uuid,text)` returns **integer in Production** and **bigint in Staging**. No DROP, contract conversion or further compatibility development was attempted. The first 22 compilation units passed inside rolled-back transactions; the next failed atomically. Full release rehearsal is incomplete. Do not promote this package until it passes against a disposable Production-matched database preserving the integer contract. Do not replace Production RPCs with Staging operational bodies.

## Implemented and verified on Staging

- Eleven legacy session RPCs retain their signatures but always deny with `42501 / LEGACY_RECEIVING_RETIRED`; PUBLIC, anon and authenticated execution is revoked. Automatic startup/reconnect, URL join and legacy polling are dormant. Historical session data and local queues are retained.
- Forty-seven additional Production Receiving definitions received authorization guards. Original operational bodies, signatures, return values and execution privileges were compared with the inspected Production snapshot. Two review paths additionally require Item & Barcode write permission. Manifest/history reads are protected; mixed workflow reads require the applicable module, or both modules when unfiltered.
- Three missing Staging dependency tables were created empty, with RLS and guarded write triggers. Existing history read policies are constrained by restrictive module policies. Production already has these dependencies; its legacy tables have no anon/authenticated table privileges.
- Disposable fixtures were enclosed in BEGIN/ROLLBACK. PASS: 47 Disabled denials, 47 cross-pharmacy denials, 11 legacy RPC denials for both anon and authenticated, Enabled manifest/receipt/history, receipt and completion retry idempotency, Delete confirmation/data removal, Finalize validation, Reset success and injected-failure atomic rollback, historical preservation, Read Only and direct history RLS.
- PASS: 22 focused source tests; Staging build; 22 rolled-back dependency/guard/retirement replay units; Production source patch clean application/build and Production-only connection metadata.
- NOT TESTED: physical Handheld/PC synchronization, authenticated deployed browser smoke, full Production-matched release rehearsal, actual Production deployment configuration and Production smoke tests. The Production preflight SQL is prepared but has not fully passed.

## Candidate contents and dependency order

`source.patch` is based on the verified Production source, includes the approved authorization/Access Management changes plus session retirement, and adapts the Supabase URL/public key, CSP, Edge environment assertion and build metadata to Production. It excludes Staging-only migrations and diagnostics. It applied and built successfully in an isolated local candidate; no source ref was promoted. The build supports Vercel main/production or GitHub Pages with `GITHUB_SHA` metadata.

The numbered SQL files are **candidate release inputs, not an instruction to execute now**. After the blocker is resolved, rehearse the complete numbered sequence in one transaction against a disposable Production-matched database:

1. `00_account_contract_qualification.sql`, `01_password_gate.sql`, `02_permissions_foundation.sql`.
2. `03_production_existing_rpc_guards.sql`: 91 existing Production bodies with only approved authorization guards. Five Staging-only Expiry APIs are explicitly excluded in `verification.json`.
3. `04a` through `04e`: UUID permissions cutover, password read policies, safe Read Only generation bootstrap, idempotent provisioning and explicitly selected initial permissions. New pharmacies default deny; existing UUIDs and HHP084 Global bootstrap are preserved.
4. `05_receiving_compatibility_helper.sql`, `06_legacy_retirement.sql`, `07_receiving_compatibility_guards.sql`, `08_receiving_compatibility_rls.sql`.

Never run `STAGING_ONLY_receiving_dependencies.sql` on Production. Never blanket-push the root Staging migration directory to Production. The one-time authorization foundation is not replayable after commit; use recorded migration history and forward recovery. The Receiving guard/helper/retirement DDL was separately replayed safely.

## Release-time preflight and gate

Re-read main/Staging heads and inspect `source.patch`; require the approved exact SHAs. Run `production-preflight.sql` read-only against the Production project. It checks 150 exact function definitions, required operational tables, HHP084 active admin membership, no exposed legacy table API and absence of an existing request hook/private authorization installation. Stop on drift or partial installation. Verify constraints, RLS/policy snapshots and account totals against the rehearsal. Verify the actual deployment project, Production domain, branch main, Production Supabase URL/public key, Auth redirect allowlist, Edge secrets and JWT verification; do not print secret values. Require a completed, passing Production-matched rehearsal before writes. Take schema/function/ACL/policy and deployment snapshots immediately before the separately authorized promotion.

## Recovery

Before database commit, any error must ROLLBACK the complete release transaction; do not leave a partial foundation. Injected Reset failure already proved operational statements roll back together. After commit, retain authorization policies, permission rows, review capture and legacy denial. Correct a failed guarded definition forward with its original Production body plus the verified guard, in a transaction; re-run the exact failed test and contract checks. Do not re-grant legacy access, drop permission/review tables or reset operational records. If frontend regression occurs, roll back to the recorded previous Production deployment while retaining database security and correct forward; old legacy clients will remain denied. Full source rollback plus new database compatibility must be rehearsed before promotion.

## Focused Production smoke plan (separate authorization required)

Use existing authenticated accounts and read-only screens only: System Administrator Access Management and saved permissions; existing HHP084/another Pharmacy Admin account context and isolation; Receiving/Expiry screen availability; active manifest and history reads; hidden/denied modules and anonymous legacy denial; password-change gate and sign out. Confirm deployed SHA and Production Supabase via version metadata and network requests. Do not run create/join, delete/finalize/reset or create test accounts/operational records in Production. Stop and recover on any error; report USER VERIFICATION pending.
