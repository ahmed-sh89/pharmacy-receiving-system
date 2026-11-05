# Duty release preparation — 5 November 2026

**BLOCKED — NOT READY FOR PRODUCTION. No merge, deployment, Production SQL or activation authorized.**

Production source: `2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f`.
Duty source: `76288141aad46469e6a3f838525550757f602324` (runtime `d89296b8fa44bbb1bfe5de0ca7e9ba0158d9f98a`).
Release branch: `release/duty-production-prep-20261105`, created directly from that Production commit. The existing feature-branch PR #43 is a Staging candidate, not the clean release branch.

## Scope and access

Duty reuses `pharmflow_pharmacy_permissions_v1`, Administrator → Permissions, policy revisions and `pharmflow_permission_audit_v1`. Its only module setting is Enabled/Disabled. The new field defaults to Disabled for existing and newly created pharmacies. Duty access also requires an active pharmacy, a valid non-revoked authenticated session, completed password requirements, and an active membership or the existing System Administrator role. The existing pharmacy-admin write restriction is reused; no new role is introduced. The System Administrator cannot bypass a Disabled Duty policy, but can configure it through the existing permissions dialog.

Navigation visibility, direct route checks and RPC authorization all deny Disabled Duty. Missing Duty permission fails closed. Receiving/Expiry authorization functions and the original v1 permission writer remain unchanged. The v2 writer saves all permission fields atomically with expected revision and audit. Consequently **the readiness migration must precede the new Administrator UI**; deploying that UI without its v2 RPC would prevent saving the Permissions form.

## Persistence

Employees, positions, daily schedules, months, holidays, effective Basic histories and working-hour settings live in dedicated pharmacy-scoped Supabase tables. Clients have no direct table grants; RLS defaults to deny and narrow authenticated RPCs check access. Reads and writes use the selected pharmacy identity. Internal employee keys remain immutable; display-code edits do not reassign historical schedules. Settings and employee changes use expected revisions. Schedule batches retain the original per-pharmacy transaction lock, final overlap check, audit and conflict-safe compensating Undo/Redo.

Existing visible-Duty 15-second/focus reads provide bounded synchronization. Schedule data is not persisted in browser storage. Custom staff preferences use account/pharmacy-scoped session storage. The isolated Staging synthetic page remains memory-only and is **excluded from the release**.

The server and browser resolve Basic allowances using the same documented precedence: explicit nondefault legacy cell limit, matching employee-specific timestamp rule, matching general timestamp rule, dated employee default, employee base. Latest saved matching rule wins within a scope. Rules use shift start; overnight shifts are never split across rules/dates. Holiday takes precedence over Friday. Manual categories replace their corresponding automatic categories; explicit zeros are retained. Completed-month allocation changes are rejected. Reports share the Schedule projection and expose only saved Notes, never automatic Working text.

## Exact release files

- Runtime: `index.html`, `js/config.js`, `js/permissions.js`, `js/settings-workspace.js`, `css/permissions.css`, the four `js/duty*.js` files and `css/duty.css`.
- Database: the four Duty migration files listed below.
- Tests: `tests/duty-*.test.cjs`, `tests/duty-xlsx-validation.py`, the focused Duty case in `tests/sleep-wake-permissions.test.cjs`, and `.github/workflows/duty-readiness.yml`.
- Documentation: `docs/duty` mapping/checkpoint/history, this runbook and `RELEASE_MANIFEST.json`.

The main `vite.config.js`, deployment workflows, connection configuration, authentication, Receiving, Expiry and Handheld business files stay byte-identical. `RELEASE_MANIFEST.json` protects 81 existing runtime/tooling files by Git blob hash. The release excludes Staging preview plugin/build exceptions, synthetic HTML, live-fixture SQL, obsolete manual-hours SQL proposal and old global checkpoint additions. No SQL execution or deployment is wired into the new test workflow.

## Migrations — future Production approval required

Already applied to **Staging only** (`tovkcakucyagvbzvlnks`):

1. `20261103235030_duty_stage_a_foundation.sql`
2. `20261103235335_duty_position_default_name_validation.sql`
3. `20261104013200_duty_stage_b_scheduling.sql`
4. `20261105183357_duty_production_readiness_staging.sql`

The fourth filename records the actual hosted Staging migration version. Its additive definitions are the proposed Production contract, subject to a separate approval. Do not also apply `STAGING_MANUAL_HOURS.sql`; it is superseded and excluded. None of these scripts is an instruction to run Production SQL now.

Before approval, inspect Production migration history, schemas and dependencies read-only. Confirm `pharmacies`, `pharmacy_members`, the existing permission/audit tables, `is_system_owner()` and the strict `pharmflow_auth_private.password_change_complete()` contract. Confirm no existing Duty tables/history conflict with the four migrations. If they exist, stop and reconcile instead of rerunning CREATE/ALTER statements. Production database state has not been queried in this continuation.

After all acceptance gates pass, obtain explicit approval covering the exact release SHA, migration checksums/order and automatic official Pages deployment triggered by a main merge. Back up schema and record before/after permission values and relevant non-Duty schema signatures. Apply only the missing approved Duty migrations in order; never reset schemas, backfill real employees or change existing Receiving/Expiry permissions. Verify RLS/ACLs, default-denial and the v2 Permissions RPC before merging the UI. Keep every Production pharmacy Duty Disabled. Then merge through the normal protected PR workflow, check official Pages success and served identity, and perform the approved smoke checks. Enabling a Production pharmacy requires separate explicit authorization.

## Open acceptance gates

- Authenticated synthetic Staging browser save → refresh → second independent session read, settings/calendar propagation and stale-write rejection.
- Administrator browser disable/hide/direct-route denial and enable restoration; Receiving/Expiry browser smoke under the same existing grants.
- Full legacy-suite failures must be reconciled against the exact Production baseline; do not relabel a failing full suite as PASS.
- Native Microsoft Excel 2016/2019 must open both downloads without repair warnings. ZIP/XML validation and a third-party reader are not native Excel acceptance.
- Actual E:L paste in a disposable live-template copy and native Windows Chrome 80% acceptance remain Product Owner checks. Values-only paste can replace formulas within the destination range.

## Rollback

Disable Duty using the existing Administrator Permissions form with current revision, preserving all other module values. Revert the focused UI release through a protected PR and the normal Pages deployment. Retain the additive Duty schema, history and manual-aware readers; do not drop tables, restore a database or revert to the legacy calculator after Manual records exist. A failed Staging test is not permission to alter Production. No irreversible rollback or data deletion is part of this task.
