# Duty Production Readiness · 5 November 2026

**BLOCKED — NOT READY FOR PRODUCTION. No merge, Production SQL, deployment or activation.**

## Authoritative state

Production main verified unchanged: `2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f`.
Duty feature source: `76288141aad46469e6a3f838525550757f602324`; runtime implementation `d89296b8fa44bbb1bfe5de0ca7e9ba0158d9f98a`. Existing Staging draft PR #43 remains unmerged.
Clean release branch: `release/duty-production-prep-20261105`, based directly on verified main. It retains the approved Duty runtime and necessary integration, excluding Staging build exceptions, synthetic HTML/live-fixture scripts, obsolete manual-hours proposal and unrelated global checkpoint edits. See `PRODUCTION_RELEASE.md` and the exact protected-file hashes in `RELEASE_MANIFEST.json`.

Working implementation preview: https://pharmflow-test-qq5ur5108-fhyh2xtskz-3504.vercel.app/ — Vercel READY, runtime d89296b. Synthetic `/duty-demo.html` is available on this Staging deployment only; it is not part of the clean release. Later feature commits only changed documentation. No Production connection or operational record was used for browser testing.

## Implemented architecture

Duty is registered in normal PharmFlow navigation and the existing Administrator Permissions dialog. Its policy field defaults Disabled, including Administrator module access. Disabled Duty is hidden; routes and server RPCs deny access. Existing Receiving/Expiry authorization and the v1 permission writer are unchanged. The new atomic v2 writer uses existing policy revisions and audit.

Supabase is authoritative for Duty employees, positions, entries, holidays, months and settings. Effective Basic defaults, timestamp/employee rules, Manual allocations and holiday metadata are durable. Internal employee keys remain stable. RLS defaults deny, direct client table access is revoked, and RPCs validate live session, password policy, pharmacy scope and existing member/admin authority. Schedule operations retain audit, row revisions, atomic batches, overlap checks and safe Undo/Redo. Existing bounded refresh/focus reads are reused; no browser schedule persistence or parallel authorization system.

Four Duty migrations have already been applied to Staging `tovkcakucyagvbzvlnks`, including `20261105183357_duty_production_readiness_staging.sql`. No migration was applied in this continuation. The manual-hours SQL proposal is superseded. Production migration application is not authorized. Deploying the new Permissions UI requires the v2 RPC first; the runbook specifies that cutover dependency.

## Actual verification

- Local Production-target build PASS (build only).
- Duty, access and release-isolation: **63/63 PASS**. New checks cover permitted Production runtime loading/revocation and 81 byte-identical protected main files. Build assertions verify either exact isolated Staging output or exact Production output, without relaxing the Vercel Production guard.
- Focused security, Receiving/email, authentication, Handheld and Expiry capture/session regression: **300 PASS, 2 optional SKIP, 0 FAIL**.
- Complete serial legacy suite: candidate **1270 PASS, 140 FAIL, 4 cancelled, 3 SKIP** (1417 total). Exact main fixture: **1227 PASS, 141 FAIL, 4 cancelled, 3 SKIP** (1375 total). All candidate failing/cancelled test names also fail/cancel on main; no new failure name. Full command used `--test-concurrency=1 --test-timeout=10000`; the full suite is NOT green. Historical Git objects were recovered for comparison; earlier missing-checkout failures are not used as final evidence. Details and all failing names: `VERIFICATION_20261105.json`.
- Live Staging SQL PASS: access/default denial, durable writes/rules, revisions, Manual and overnight allocations, Holiday-over-Friday precedence, completed locks, pharmacy isolation, member-write/session/anonymous/table denial. Synthetic transaction rolled back. Final employees/entries/settings/holidays and enabled Duty policies all **0**.
- Chrome synthetic workflow PASS: single-click selection, double-click editor, confirmed Basic 8 from November 7 then 1 PM–10 PM = Basic 8 + Normal OT 1; paste to Friday = Friday OT 9; Undo/Redo; Schedule → Reports; recalculated monthly preview totals. Reports Copy Values showed success; the cloud virtual clipboard remained empty, so actual clipboard bytes are not claimed verified in this browser.
- Both XLSX formats downloaded from the implementation preview and independently passed ZIP CRC/XML order, relationship, style and cell-structure validation. Notes remain saved-note-only. Native Excel 2016/2019 acceptance remains open.
- Authenticated browser is at the Staging sign-in screen. No authenticated save/refresh/two-session or Administrator browser result is claimed. Existing feature CI passed; the separate release branch must obtain its own CI result.

## Exact next actions / release gates

1. Reconcile inherited full-suite failures; preserve unrelated business code rather than changing it merely to satisfy old snapshots.
2. With an authorized synthetic Staging account, verify Administrator enable/disable, hidden navigation/direct-route denial, save → refresh → independent-session read, settings/calendar propagation, stale writes and Receiving/Expiry smoke.
3. Product Owner opens both downloads in Microsoft Excel without repair and tests E:L paste into a disposable actual template. Native Windows Chrome 80% remains unverified. Values-only paste can overwrite formulas inside E:L.
4. Recheck main/source/PR SHAs and CI. Obtain explicit Production approval covering migration prerequisites/order, exact release SHA and automatic official Pages deployment. No Production pharmacy activation without separate approval.

Rollback: disable Duty and revert only its focused UI release through the normal protected PR/Pages path. Preserve additive schema, historical records and the Manual-aware reader. Do not drop tables, restore databases or reset operational storage. Detailed migration/rollback sequence: `PRODUCTION_RELEASE.md`. No USER VERIFIED/DONE claim.
