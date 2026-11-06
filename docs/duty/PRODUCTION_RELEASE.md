# Duty release preparation — 6 November 2026

**BLOCKED — NOT READY FOR PRODUCTION; final security/visual acceptance open. No merge, deployment, Production SQL or activation authorized.**

Production source: `2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f`.
Duty runtime source: `766d3e632f8861a26f6d8ba0fa177159aa99ba40`; release runtime `aef6dbdfe8836fb9c4e99a53e7ca10b8f8876cff`. Authoritative current evidence: `CURRENT_CHECKPOINT.md`.
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
- Database: the six Duty migration files listed below.
- Tests: `tests/duty-*.test.cjs`, `tests/duty-xlsx-validation.py`, the focused Duty case in `tests/sleep-wake-permissions.test.cjs`, and `.github/workflows/duty-readiness.yml`.
- Documentation: `docs/duty` mapping/checkpoint/history, this runbook and `RELEASE_MANIFEST.json`.

The main `vite.config.js`, deployment workflows, connection configuration, authentication, Receiving, Expiry and Handheld business files stay byte-identical. `RELEASE_MANIFEST.json` protects 81 existing runtime/tooling files by Git blob hash. The release excludes Staging preview plugin/build exceptions, synthetic HTML, live-fixture SQL, obsolete manual-hours SQL proposal and old global checkpoint additions. No SQL execution or deployment is wired into the new test workflow.

## Migrations — future Production approval required

Already applied to **Staging only** (`tovkcakucyagvbzvlnks`):

1. `20261103235030_duty_stage_a_foundation.sql`
2. `20261103235335_duty_position_default_name_validation.sql`
3. `20261104013200_duty_stage_b_scheduling.sql`
4. `20261105183357_duty_production_readiness_staging.sql`
5. `20261106001033_duty_final_directory_and_save_staging.sql`
6. `20261106010727_duty_directory_lifecycle_staging.sql`

The fourth filename records the actual hosted Staging migration version. Its additive definitions are the proposed Production contract, subject to a separate approval. Do not also apply `STAGING_MANUAL_HOURS.sql`; it is superseded and excluded. None of these scripts is an instruction to run Production SQL now.

Before approval, inspect Production migration history, schemas and dependencies read-only. Confirm `pharmacies`, `pharmacy_members`, the existing permission/audit tables, `is_system_owner()` and the strict `pharmflow_auth_private.password_change_complete()` contract. Confirm no existing Duty tables/history conflict with the six migrations. If they exist, stop and reconcile instead of rerunning CREATE/ALTER statements. Production database state has not been queried in this continuation.

After all acceptance gates pass, obtain explicit approval covering the exact release SHA, migration checksums/order and automatic official Pages deployment triggered by a main merge. Back up schema and record before/after permission values and relevant non-Duty schema signatures. Apply only the missing approved Duty migrations in order; never reset schemas, backfill real employees or change existing Receiving/Expiry permissions. Verify RLS/ACLs, default-denial and the v2 Permissions RPC before merging the UI. Keep every Production pharmacy Duty Disabled. Then merge through the normal protected PR workflow, check official Pages success and served identity, and perform the approved smoke checks. Enabling a Production pharmacy requires separate explicit authorization.

## Final acceptance gates

The owner has accepted the prior save/refresh, synchronization, conflict, access, Excel opening and single-employee paste cycles. See the updated CURRENT_CHECKPOINT for the four focused checks on the final changes. No repeated authentication flows are authorized. The supplied A(3).xlsx contains inconsistent underlying dates; verify the actual destination employee/month/date before pasting a partial range. The generated Standard Timesheet provides correct selected-period dates. Full legacy baseline failures remain separately documented; the full suite is not green.

## Rollback

Disable Duty using the existing Administrator Permissions form with current revision, preserving all other module values. Revert the focused UI release through a protected PR and the normal Pages deployment. Retain the additive Duty schema, history and manual-aware readers; do not drop tables, restore a database or revert to the legacy calculator after Manual records exist. A failed Staging test is not permission to alter Production. No irreversible rollback or data deletion is part of this task.

Final Staging migration adds two sort_order columns and guarded directory/save-read RPCs. Default values preserve the prior neutral/name ordering; the new reader field is backward-compatible. Updated clients need the final migration before release. Rollback should retain sort_order/data and both manual-aware readers; old clients ignore ordering. No automatic SQL execution is part of CI.

Final UI continuation adds an independent archived state, schedule-only optional display names, aligned merged footer rows and fixed toolbar tracks. See CURRENT_CHECKPOINT for exact QA evidence. The directory-v1 authenticated grant is revoked by migration 6; older clients cannot manage the directory. Safe rollback is disable Duty and retain additive schema/history; keep the directory-v2 adapter for any scoped UI revert. The reported Chrome Dangerous badge is unresolved: one read-only prior-preview check reached sign-in without an interstitial but could not inspect Chrome chrome/security state. Do not bypass it or claim clean security.

The four final UX corrections retain the scoped roster during month reads, constrain Reports to an internal table scroller, refine editor presentation and auto-update searchable report controls. No new migrations or backend calls. Final local checks: 76 development / 78 release / 124 non-regression PASS; runtime CI SUCCESS. Synthetic browser month/range-copy/layout checks PASS; CSS-scaled 75/80 diagnostics are not native Windows zoom acceptance. Keep the Chrome Dangerous, fresh authenticated-session and native acceptance gates open as detailed in CURRENT_CHECKPOINT. No Production promotion is authorized.
