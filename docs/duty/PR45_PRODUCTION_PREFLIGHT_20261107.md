# Duty PR #45 Production release preflight — 7 November 2026

PRODUCTION RELEASE PREFLIGHT: BLOCKED. Read-only Production verification only; no migration, merge, deployment, activation or operational write performed.

## Pinned source and acceptance

- Production main: 7f0bcc1fe167415e38372b1db1d9c2f0c24858de (unchanged).
- Inspected PR #45 head: 20718a03efe3fce4315a2d59450339ff351472f1, open Draft. This preflight adds documentation only; the resulting PR head is the subsequent execution candidate and must be pinned separately.
- Accepted Staging runtime: f01c307e7e647dd564295aac07bb27776990c0a2. All five changed runtime files in the PR are byte-for-byte identical to that accepted runtime.
- Product Owner USER VERIFIED PASS: quiet sync, grouped Employees/status badges, position presets/durations, existing Select All + Ctrl exclusion, Apply/replacement/Undo/Redo and multi-session synchronization. Ctrl + Drag deferred explicitly; no implementation authorized here.
- Preserve previous 153 PASS / 0 FAIL / 1 optional SKIP. No acceptance rerun.
- Current inspected-head Actions: Duty/build 42312824838 PASS; required PharmFlow security checks 42312824826 PASS. Recheck checks on the documentation-only head before release.
- Active ruleset 26077274 protects the default main branch: PR required, strict up-to-date security status from integration 15368 required; deletion/force updates blocked. No bypass authorized.
- Vercel failure is a non-required provider status on release-preparation branches. Prior build evidence identifies the unchanged guard, "Production release requires main and Production configuration". This must not be bypassed. Official Production remains GitHub Pages via unchanged .github/workflows/deploy.yml; no deployment configuration or dependency changes.
- 81 protected Production/deployment files match their pinned Git blobs. Calculations, exports, Receiving, Expiry and authentication implementations unchanged.

## Gate results

| Gate | Result | Evidence / limit |
|---|---|---|
| Source integrity | PASS | Pinned SHAs, complete diff, accepted runtime identical, protected source hashes |
| CI/security | PASS for inspected head | Required security and Duty/build successful; non-required Vercel release-branch guard remains failed |
| Migration compatibility | PASS | Seven installed source hashes and existing function bodies match; only pending migration absent; unchanged signatures/dependencies |
| Pharmacy isolation and permissions | PASS | Live read-only grants/RLS/default and scoped RPC review; no live Production write tests |
| Production non-regression | PASS within inspected scope | Protected code unchanged; migration defines only Duty functions, no top-level operational DML; previous accepted behavior preserved |
| Backup/recovery readiness | BLOCKED | Current Dashboard redirects to Sign in; no current backup listing/status/retention available through configured connector |
| Release execution plan | PASS — prepared only | Controlled transaction/history/security checks and non-destructive recovery below |

## Complete PR scope

Existing sixteen changed paths (the only addition from this preflight is this document; CURRENT_CHECKPOINT is updated):
- css/duty.css
- docs/duty/CHANGELOG.md
- docs/duty/CURRENT_CHECKPOINT.md
- docs/duty/PRODUCTION_RELEASE.md
- docs/duty/RELEASE_MANIFEST.json
- docs/duty/WORKFLOW_TEST_MATRIX.md
- js/duty-model.js
- js/duty-schedule.js
- js/duty.js
- js/permissions.js
- supabase/migrations/20261106232443_duty_position_presets_staging.sql
- tests/duty-final-regression.test.cjs
- tests/duty-polish.test.cjs
- tests/duty-release-isolation.test.cjs
- tests/duty-workflow-database.test.cjs
- tests/duty-workflow.test.cjs

Runtime: css/duty.css, js/duty-model.js, js/duty-schedule.js, js/duty.js and the new Duty-only RPC mapping in js/permissions.js. Five test files; one migration; remaining paths documentation. No app/runtime changes in this preflight.

## Migration and current Production state

Only pending migration: supabase/migrations/20261106232443_duty_position_presets_staging.sql.
SHA-256: 5d78903e73f1e9f3b76826eb6dd2f3afcbf8769953b0e7582acbe568da1c9d5c — PASS against exact remote Git blob and local bytes.

Installed Production migrations and stored SQL source SHA-256:
- 20261103235030_duty_stage_a_foundation.sql — 63b407bd9f4bde20e522a5b538dc071bf15cdf978f80625e855972f562301447
- 20261103235335_duty_position_default_name_validation.sql — c0b946ceca851ee2dce2ecd55dadf0619fdee9e09f08b20c5d89f00349976cc4
- 20261104013200_duty_stage_b_scheduling.sql — ec7133695b21655e66a1e19e9bc252c8c6f06f892cbb0e8eb2c46037ae091bd4
- 20261105183357_duty_production_readiness_staging.sql — 8279998cdc6c7f222303faba38af45c61a1ac79f82cc989fd57f59726cb523b9
- 20261106001033_duty_final_directory_and_save_staging.sql — bb69687131cb6a7cea8491db623bf045708f2ddefab56d925d8e5ed500e29a3f
- 20261106010727_duty_directory_lifecycle_staging.sql — ebf5633e92f7e82185056f435a6cf2623ff60f8eef68ae3af4ffa131d70d2352
- 20261106134244_duty_shift_presets_staging.sql — 9c5f6aecc4a59439edccd90e08c4f03ec12145b7b51f2d97dc59fc2811cc4acb

Hosted history columns verified: version text PRIMARY KEY, statements text[], name text, created_by text, idempotency_key text, rollback text[]. Existing seven entries each contain one exact-source SQL string; new version/name has zero rows. New apply_pharmflow_duty_preset_v1(uuid,date,text,bigint,jsonb,text) does not exist.

Production PostgreSQL 17.6; existing allowed, directory-v2, presets-v1 and schedule-v2 function bodies match approved seven-migration source. Required settings/employee/position columns present. All seven Duty tables enforce RLS and give neither anon nor authenticated direct SELECT/INSERT/UPDATE/DELETE. Existing public Duty RPCs deny anon; authenticated execution remains guarded by pharmacy FULL access, active pharmacy, current authenticated context and administrator membership for writes. The new RPC uses the same guard/search_path and checks all selected positions plus settings revision under the existing pharmacy lock before the existing atomic save.

Migration replaces presets writer and directory-v2, adds one guarded Apply RPC; no table/column changes, no backfill or migration-time employee/preset/schedule/permission writes. Legacy missing/empty positions remains All Positions, actual/custom position keys remain pharmacy-scoped. Current Production has 10 employees, 3 persisted positions, 10 saved entries and 7 presets, all seven lacking positions. These must remain unchanged by migration.

Current activation/permissions — preserve exactly:
| Pharmacy | Duty | Receiving | Expiry | Account |
|---|---|---|---|---|
| DEV001 | DISABLED | FULL | FULL | suspended |
| HHP084 | FULL | FULL | FULL | active |
| HHP107 | DISABLED | FULL | FULL | suspended |
| TEST002 | DISABLED | FULL | FULL | active |
| TEST003 | DISABLED | DISABLED | FULL | active |

Default for newly created permission rows remains 'DISABLED'. Do not reset HHP084 to Disabled and do not activate another pharmacy.

Read-only fingerprint baseline (fresh capture must be repeated immediately before any separately authorized write):
- permissions_md5: cf2a1c6136d22ec90c74782532b056f9
- duty_entries_md5: 4f8e73e726039b983ea5e83edfe44975
- duty_settings_md5: 1bf99d579165b29fc6ae88d80add6527
- duty_employees_md5: b159c2667b7b7c1f95154a268d6ede85
- non_duty_policies_md5: 174467111a3337de2eb62ec51e863a83
- non_duty_functions_md5: 3f18185314c98b371a00ba8aa1ea4e06
- public_constraints_md5: 790c7ff26802693e83ffa201db237608
- public_schema_columns_md5: 5d6c3102c67667eb935cf733467e4ef8
- non_duty_table_security_md5: 116ac095b5b08a0304fb52695c767440

## Backup blocker — minimum evidence

Correct Production project verified as Pharmacy Receiving System, zznoshzcyxmtwfbznjyr, ACTIVE_HEALTHY. The requested scheduled-backups page redirected to Supabase Dashboard Sign in; no login attempt/retry, restore or bypass performed. Configured Supabase tools expose no current backup-list endpoint.

Historical screenshot: 2026-11-06 00:41:13 UTC with Restore available. It is historical evidence only, not confirmation of current recoverability. Current latest timestamp, completed/available state and retention/recovery window are NOT VERIFIED.

Minimum action: supply one fresh screenshot of this Production project's Database → Backups → Scheduled backups showing project identity, latest backup timestamp and Restore/availability status (and displayed retention/window if present). Restore availability supports a recovery route; it does not prove an actual successful restore. Do not restore. Reconfirm availability immediately before execution and record the backup plus fresh pre-change checkpoint as the recovery route.

## Exact future execution sequence — NOT authorized by this preflight

1. After backup gate closure and separate explicit Product Owner release authorization, pin the final Draft PR head (including this documentation-only commit), accepted runtime and unchanged main. Recheck required security/Duty checks, complete diff, branch protection, migration hash, current PostgreSQL/history/function dependencies and pharmacy activation values. Stop on unexpected drift. Confirm fresh available backup and recovery constraints.
2. Capture a timestamped pre-change recovery checkpoint: main/release SHAs, backup timestamp/route, seven history rows/exact SQL hashes, old replaced function definitions/ACL/search_path, all Duty data and permission row fingerprints, and protected non-Duty schema/constraints/policies/grants/function fingerprints. Protect checkpoint access; do not put credentials in files/logs.
3. Use one verified physical direct/session PostgreSQL connection and an authorized migration role; never use transaction-pooler hops or separately committed requests. Use stop-on-error, explicit BEGIN, bounded lock/statement timeouts. Acquire the existing Duty pharmacy advisory locks in deterministic pharmacy-ID order before baseline snapshots so concurrent authorized Duty writers wait briefly; leave Receiving/Expiry operational data alone. Recheck original seven history hashes, pending version/name absence and new RPC absence. Take the within-transaction pre-migration snapshots.
4. Execute the exact unchanged pending SQL source once, then insert its history in that SAME transaction with client parameters:
   INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
   VALUES ($1,$2,$3::text[]);
   parameters: version='20261106232443'; name='duty_position_presets_staging'; statements=[exact UTF-8 migration SQL source] (one text[] element, no reformatting). Never replay the seven installed migrations or change their history.
5. Before COMMIT, assert: exactly one new history row with correct version/name/cardinality=1/source SHA-256; expected final signatures and three pinned function bodies; old schedule-v2/allowed bodies unchanged; intended authenticated-only RPC grants, anon/PUBLIC denial, pinned SECURITY DEFINER search_path, all table RLS/direct-table denials unchanged; current pharmacy access/session/admin guard and every-target position validation intact. Compare employees/settings/presets/positions/entries/audit/month/holiday, pharmacy permission rows and protected non-Duty schema/security fingerprints to the within-transaction baseline. All existing presets/assignments/identities and activation values must be unchanged. No operational test writes. Any mismatch/error requires ROLLBACK of the complete transaction and STOP.
6. COMMIT once only after all assertions. Independently reconnect and verify all history/hash/function/security/data/activation invariants. If COMMIT acknowledgement is uncertain, do not retry blindly: inspect from a fresh session after the original transaction resolves. All expected objects/history with matching hashes means committed; neither new RPC nor new history with original bodies means rolled back. Any mixed state or unresolved original transaction is a STOP/escalation; do not invent repair SQL.
7. Only after independent DB PASS, recheck/freeze final PR head. Mark ready and merge through active branch protection with required checks satisfied; no bypass. Let official main-triggered GitHub Pages workflow deploy. Verify successful workflow, merge SHA, version.json/build identity and official URL https://ahmed-sh89.github.io/pharmacy-receiving-system/ . Vercel Preview is not Production.
8. Run the non-destructive smoke checks below, compare recorded Receiving/Expiry/Duty permission values, preserve each pharmacy's approved Duty state, and record final deployment and evidence.

## Rollback and recovery

Before COMMIT: rollback the entire transaction including new history and function/grant changes; independent verification must show no partial new migration.
After COMMIT: retain additive Duty functions, migration history, existing presets/schedules and current pharmacy activation values. For an application issue, prepare a protected application rollback PR restoring prior runtime behavior and deploy through official GitHub Pages. The additive schema is backward-compatible with old callers. Do not delete Duty objects/history/data, disable HHP084 automatically, or routinely restore the whole database. Any data recovery/full restore or other action outside the later authorization requires STOP and a separate explicit decision. The available backup is the emergency recovery route, not routine rollback.

## Non-destructive post-release smoke plan

- Existing authorized account login/Dashboard; open Receiving's existing orders and compare recorded totals without editing/scanning/saving; open Expiry and Administrator settings, compare permission values.
- HHP084 (current FULL): open Schedule, Employees, Positions, Preset library and existing All Positions presets. Inspect position filters/durations/context hours; open Apply preview and Cancel, verify no entries changed. Refresh and compare existing saved schedule/report totals; second authorized session displays the same authoritative records.
- Check position-aware Apply and Undo/Redo controls without executing writes against real records. Saved Apply/Undo/Redo writes remain covered by accepted Staging evidence; any new Production write test requires separately authorized disposable synthetic records/scope. Do not create operational test entries or activate a pharmacy.
- Open Duty Reports and download existing selected-period single/all exports; compare identification/dates/totals without changing records.
- Disabled pharmacies retain hidden/denied Duty access; foreign-scope data must not appear. Use only existing authorized sessions; do not change permissions to manufacture tests. Record any unavailable authenticated check as BLOCKED/NOT VERIFIED rather than implying completion.

Next action: obtain current backup availability screenshot; close only that missing gate, then issue a separately pinned Production authorization request. No Production execution under this document.
