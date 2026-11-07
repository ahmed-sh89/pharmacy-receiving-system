# Duty Production release PR #45 — 7 November 2026

**PRODUCTION RELEASE: PASS.** Approved release completed. Production main/deployed SHA: 1457f45fdf2af0ec84546a076e64191b5980a79a. Approved PR head: 37a0b820e80b6f9945ed4742d6f53e68b09d70ba, merged through protected PR #45. Accepted Staging runtime remains f01c307e7e647dd564295aac07bb27776990c0a2. Ctrl + Drag remains deferred; accepted Select All + Ctrl exclusion workflow unchanged.

Official Production: https://ahmed-sh89.github.io/pharmacy-receiving-system/ .
GitHub Pages run 42318372312 SUCCESS; actual official version.json independently displays the deployed SHA above. No Vercel Production deployment or deployment guard change.

## Database / recovery evidence

Only migration 20261106232443_duty_position_presets_staging.sql applied; SHA-256 5d78903e73f1e9f3b76826eb6dd2f3afcbf8769953b0e7582acbe568da1c9d5c PASS. Original seven migrations/history preserved unchanged. Exact new history: version 20261106232443, name duty_position_presets_staging, statements text[] with one complete exact-source SQL string. Eight Duty history rows total.

Atomic execution: one explicit BEGIN/COMMIT, physical backend 858894, transaction 203396, started 2026-11-07 00:26:41 UTC (03:26:41 Riyadh). Same-backend/transaction guards and all pre-COMMIT assertions PASS. Independent read-only backend 858898 confirmed committed schema/history/security at 00:27:04 UTC. Final post-smoke check 00:35:46 UTC: all twenty protected table data fingerprints, permissions, table security/RLS, schema/constraints/policies, unchanged functions and original history match pre-change baseline exactly.

Preserved: 10 employees, 3 positions, 7 original presets (all legacy All Positions), 15 saved entry records. All 15 current entry payloads are EMPTY, verified by read-only SQL; the empty Schedule and zero report totals match actual stored state. No operational entries created/edited/deleted during smoke tests. New preset eligibility uses actual pharmacy-scoped keys and server-side all-target compatibility/CAS; manual calculations and saved schedules remain authoritative.

Backup available: 2026-11-06 00:41:13 UTC, correct Production project zznoshzcyxmtwfbznjyr, authenticated Product Owner screenshot with Restore available. Actual restore NOT tested. Storage file objects are not included in the physical DB backup; no Storage changes in this release. Durable pre-change checkpoint plus validated exact transaction SQL and results saved as PHARMFLOW_DUTY_PR45_PRECHANGE_20261107_002111.json (Library ID libfile_a5cd421dadf88191aa7a3cf167ceea14). Recovery route: before commit full ROLLBACK; after commit retain additive schema/history/data and activation, use protected application rollback + official Pages if needed. Destructive schema rollback/full restore not authorized.

## Permissions — unchanged

| Pharmacy | Duty | Receiving | Expiry |
|---|---|---|---|
| HHP084 | FULL | FULL | FULL |
| DEV001 | DISABLED | FULL | FULL |
| HHP107 | DISABLED | FULL | FULL |
| TEST002 | DISABLED | FULL | FULL |
| TEST003 | DISABLED | DISABLED | FULL |

New pharmacy permission-row Duty default remains DISABLED. All Duty tables retain RLS and deny anon/authenticated direct table writes/reads. New RPC denies anon/PUBLIC execution and requires the existing authenticated pharmacy/admin guard. No pharmacy activated or deactivated.

## Verification

- Required CI/security and Duty/build for approved head PASS (42316203512 / 42316203528); active main ruleset 26077274 retained. Merge/source tree matches approved PR.
- Exact guarded execution bundle isolated test: COMMIT PASS and injected-failure complete ROLLBACK PASS, including exact history/grants/data fingerprints. Previous 153 PASS / 0 FAIL / 1 optional SKIP and prior native atomicity/Windows Excel/multi-session acceptance preserved; no full acceptance rerun.
- Actual authenticated HHP084 Production login/Dashboard/Receiving PASS: total 402, completed 399, remaining items 2, remaining units 2, over-received 1, extras 0, activity 1061 unchanged; three existing active orders visible.
- Expiry inventory PASS: authoritative list loads, 716 filtered records / 4,209 units visible; no scans/save/resolve actions.
- Pharmacy ADMIN role and Settings access PASS; all pharmacy module permission values independently unchanged in DB. System-owner management UI under a separate owner account was not exercised.
- Duty Schedule, grouped Employees 6/3/1, three Positions and seven legacy All Positions presets PASS. Existing preset editor shows position controls; Cancel only. Apply preview for an ordinary-day 10h overnight preset shows Basic 9h / Normal OT 1h; Cancel only, no write or Undo/Redo execution on real records.
- Reports and actual downloads PASS: All Employees Schedule Layout (10 correctly ordered job-code worksheets), individual Standard Timesheet (one worksheet); ZIP CRC/XML/dates and independent openpyxl opening PASS; 30 dates per sheet, no auto Working notes, zero totals match stored EMPTY entries. Native Windows Excel not rerun; prior Product Owner acceptance preserved.
- Refresh/second tab read consistency PASS: same authorized HHP084 roster, month, empty stored Schedule and seven durable presets. Tabs share the current authenticated session; no claim of a new independent-session write/sync experiment. Prior Product Owner independently authenticated multi-session sync USER VERIFIED PASS retained. No Production test writes were authorized/performed.
- No unexpected application console errors observed. Final read-only DB check confirms all protected operational data unchanged throughout.

Current phase: release completed / operational monitoring. No known release blocker. Documentation-only closure is prepared separately; do not merge or deploy unrelated changes. Future work requires its own scope. Preserve current approved activation and all operational records.
