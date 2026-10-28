# PharmFlow current checkpoint — 28 October 2026

READY FOR USER TEST — PRODUCTION UNCHANGED. Main remains `08843e42399b8830af6f0eb0773f04e0269cf0b6`. Five original Staging improvements remain USER VERIFIED. New refinement acceptance is pending.

Feature branch: `feature/final-staging-refinements-20261028`, based on prepared `232f7fe`. Refreshed Production preparation: `release/accepted-improvements-prep-20261028`, excluding Staging build binding and migration-history file. Exact commits/Preview: `docs/staging-final-20261028/DEPLOYMENT.md` and delivery response.

Resolved server export blocker: V2 transactional revision replaces full fingerprint per page; counts once. Pages stream to UTF-8/ZIP Worker; text, counts and associations preserved. Same-size isolated writer RSS 737→199MiB, 5.5→1.7s. Full 56,588/78,164 SQL→XLSX test: 183 requests, zero fingerprints, 1.43s DB, 3.25s generation; these are local SQL/Node, not Windows/network acceptance. Browser-scale readiness remains pending.

UI: Export Data beside existing Create action, separate row removed, KPI/table structure unchanged. Normal startup text only Loading..., capsule markup/styles unchanged. System Owner display Administrator; internal roles and Pharmacy Admin unchanged. Real security/error states preserved.

Staging-only migration `20261028022820_owner_export_revision_stream_v2`: private revision singleton/table, one trigger function, two statement triggers, one Owner/live-session RPC. Staging Master 17/22 preserved; validation fixtures rolled back; SEC-007 exact. No Production write, migration, Auth/Edge change, main merge or deployment.

35 focused tests and default/Staging builds PASS; full-size independent ZIP/openpyxl count/text/association checks PASS. See `docs/staging-final-20261028/IMPLEMENTATION.md` and TEST_RESULTS.json. Proposed Production apply/rollback refreshed and isolated-SQL tested; no promotion authorized.

Next: Owner tests updated Preview: Refresh Loading, Administrator, compact toolbar/KPI layout and Excel download. Full-size target Windows/browser/Excel acceptance remains open. DATA-001, Azinc/Expiry, Pharmacy Code and SEC-009 remain excluded. Preserve October 28 security, all report/quantity rules, capsule design, pharmacy isolation and Vercel main block. See `docs/releases/ACCEPTED_IMPROVEMENTS_PREP_20261028.md` for later approval/deploy/rollback sequence.
