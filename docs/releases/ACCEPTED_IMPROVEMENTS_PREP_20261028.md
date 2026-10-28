# Consolidated Production preparation — resumed export blocker fix, 28 October 2026

PREPARED — NOT DEPLOYED. Export schema/concurrency blockers resolved within the verified boundaries below. Full-size Windows Chrome/Excel result remains OPEN; overall Production approval is not yet requested.

## Current evidence / correction of previous connection diagnosis

Resume base8260f59cf47ff48cb621abcb72e24e7555a9605e on verify/release-blockers-20261028; prepared release base7551a7e8c1ace5d71b9bc01c227053dae53cb3c6. Accepted runtime remains unchanged through97c7385. Previous Unknown tool failures used a malformed Production link identifier (omitted91). Plugin discovery showed Supabase installed/enabled; Staging list_projects worked. Correct connection identifier from declared tools restored Production SQL access. No reconnect, credentials, auth settings or access-control workaround was needed. Earlier connector-unavailable claims are superseded by these successful live reads.

## Production read-only compatibility — PASS

Projectzznoshzcyxmtwfbznjyr: required Master columns text, identifierid UUID, item_code/id PKs; item_code lookup index and identifier uniqueness/FK/check constraints present. Both tables RLS enabled, no direct policies (default deny); existing privileged RPC boundary and BEFORE ROW global_guard preserved. Owner helper uses system_owners+auth.uid and is stable security definer. SEC007 source99bda52f1b8577ac07f5c0d81bdbd8f7, postgres owner, ACLpostgres/authenticated execute and search_path pg_catalog,auth match apply guard. V2 RPC/private schema absent. No incompatible drift found among consumed dependencies. No Production writes, migrations, Auth/Edge changes, merges or deployment.

## Staging correction — APPLIED / verified

Targettovkcakucyagvbzvlnks, migration20261028141551_owner_export_revision_before_statement. Exact guarded correction already tested on real PostgreSQL changes two AFTER STATEMENT triggers to BEFORE STATEMENT. Export RPC and bump function bodies/permissions unchanged. Actual trigger definitions verified BEFORE; SEC007 and RPC hashes unchanged. No Master data rewrite.

Staging rollback-only fixture: item insert, identifier insert and update increment revision3 times. Separate authenticated SQL role test: Owner readPASS, non-ownerDENIED, revoked sessionDENIED, anon executeDENIED, private revision accessDENIED, export invalidation after mutationPASS. Initial fixture's hardcoded old Owner session was absent; selected an existing live Owner/session inside SQL without exposing tokens, creating sessions or modifying Auth. All fixture data rolled back. Final counts17Items/22Identifiers/revision1, same as before migration.

## Concurrency and rollback evidence — focused scope

No completed concurrency investigation repeated. Real PostgreSQL16.15 evidence retained from https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/40696747351 atf415d95451fe0d8dba0579f1db4f6264d5cab61b:56588Items/78164Identifiers;8writers/320transactions298ms;1000-row batch5.74ms; ordinary writes0.409ms without trigger/0.431ms AFTER/0.423ms BEFORE. AFTER reproduced40P01; same opposing-write schedule with exact now-applied BEFORE correction completed. Concurrent export old snapshot valid before commit, invalidated after commit; rollback preserves revision. BEFORE obtains revision before DML row locks, eliminating that demonstrated inversion. Singleton still serializes writers; long transactions can wait until commit. Explicit row locks before DML/unusual application lock orders are not proven deadlock-free.

Updated Production proposal uses BEFORE; rollback now requires BEFORE timing as well as exact function hashes/expected triggers, removes only V2/private revision objects without CASCADE. Six affected testsPASS: consistency mutations/rollback, per-page Owner/session guard, workbook/text/fallback, guarded apply/rollback and security/config preservation. Existing51 accepted checks were not rerun or altered; their prior PASS retained. No UI/export client changes, dependency changes or full-size performance rerun.

Apply SHA256444b119262c7965a7a1c9fcb20337dcf5b8fb7c69c5d3359a591ed0f0ab60a02.
Rollback SHA25664efec8f3d3d374d5b881a256e2e655ce1284755420f980e9eec90d8f013b9e4.
Paths: proposals/accepted-improvements-release/owner-export-apply.sql and owner-export-rollback.sql. Staging timing change archived separately in staging-revision-before-statement.sql. Never replay all Staging migrations.

## Accepted inventory / exclusions retained

Includes Reports performance/equivalence; session Refresh/navigation/same-pharmacy revalidation; accepted optional CDN startup and error retry; unchanged capsule Loading...; revision streaming two-sheet Owner Export Data with text/counts/associations and compact KPI/table layout; Administrator presentation/compact Access; final toolbar500Item Name/600SHORT-NEW; canonical Group/Home Health/no Category substitution and no invented missing data. ExcludesDATA001/Azinc/Pharmacy Code/SEC009/unrelated work/Stage bindings/debug runtime/fixtures. Production Supabase/CSP/password handlers/SEC007/Expiry/identifiers/Pages workflow/Vercel main=false remain exact.

## Remaining gate and release sequence

Only full-size Windows Chrome/Excel measurement remains unverified from prior task; no result was supplied and none is claimed. Standalone synthetic test and short procedure remain on verify/release-blockers-20261028 in tests/release-blockers/windows-export-check.html. No full Staging smoke test needed. It tests client writer/Excel, excludes network/auth and cannot certify Production network timing.

After recording that result and resolving failures: Product Owner explicitly approves exact reviewed release SHA and SQL hashes plus Production migration/main merge/Pages deployment. Recheck main08843e42399b8830af6f0eb0773f04e0269cf0b6 and live dependencies; stop on drift. Apply only guarded SQL to Production, verify Owner and non-owner/revoked denials. Merge only selective branch; existing Pages workflow publishes, Vercelmain stays blocked. Non-destructive smoke: login/Refresh, Reports selected orders/Group/quantities, Order Items normal/priority layout, Account Administrator/Owner Export, workbook two sheets/counts/leading zeros/associations. No scans, quantities, deletion or Azinc changes.

Rollback after explicit approval: code revert first via reviewed main commit/Pages; verify UI no longer callsV2; then guarded SQL rollback only if separately approved. No Master/history/Auth data restore needed. No Production operation is authorized by this preparation.

Focused CI/build SUCCESS on SQL implementatione1e5cb4e894dc7ef6c983b33c852b8d36827d915: https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/40704739791 . Follow-up evidence commit changes documentation/READINESS only.
