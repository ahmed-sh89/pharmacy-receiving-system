# Current focused task — 29 October 2026

Receiving multi-order hotfix: READY FOR RELEASE / owner verification pending. Baseline main f6e341782b6844929c5ced87511ad29ec4440487; Production zznoshzcyxmtwfbznjyr. Search/card/Dashboard now share selected-scope Item Code totals; additions allocate across Orders, reports remain separate. 86 focused tests/build PASS. No DB/schema/Auth/Edge changes or operational writes. Existing HHP084/1019577 ledger remains 131/0; separate -31/+31 proposal NOT APPROVED/NOT EXECUTED. Prior October security changes retained; no Expiry Staging merge. Required next: PR checks, controlled Pages release/served-SHA verification, then owner read-only smoke. See docs/releases/RECEIVING_MULTI_ORDER_HOTFIX_20261029.md and separate correction proposal for evidence/limits/rollback. Historical security labels below are dated; this task does not reopen or re-audit the security program.

---

# PharmFlow current checkpoint — 28 October 2026

READY FOR USER TEST — PRODUCTION UNCHANGED. Main remains `08843e42399b8830af6f0eb0773f04e0269cf0b6`. Five original Staging improvements remain USER VERIFIED. New refinement acceptance is pending.

Feature branch: `feature/final-staging-refinements-20261028`, based on prepared `232f7fe`. Refreshed Production preparation: `release/accepted-improvements-prep-20261028`, excluding Staging build binding and migration-history file. Exact commits/Preview: `docs/staging-final-20261028/DEPLOYMENT.md` and delivery response.

Resolved server export blocker: V2 transactional revision replaces full fingerprint per page; counts once. Pages stream to UTF-8/ZIP Worker; text, counts and associations preserved. Same-size isolated writer RSS 737→199MiB, 5.5→1.7s. Full 56,588/78,164 SQL→XLSX test: 183 requests, zero fingerprints, 1.43s DB, 3.25s generation; these are local SQL/Node, not Windows/network acceptance. Browser-scale readiness remains pending.

UI: Export Data beside existing Create action, separate row removed, KPI/table structure unchanged. Normal startup text only Loading..., capsule markup/styles unchanged. System Owner display Administrator; internal roles and Pharmacy Admin unchanged. Real security/error states preserved.

Staging-only migration `20261028022820_owner_export_revision_stream_v2`: private revision singleton/table, one trigger function, two statement triggers, one Owner/live-session RPC. Staging Master 17/22 preserved; validation fixtures rolled back; SEC-007 exact. No Production write, migration, Auth/Edge change, main merge or deployment.

35 focused tests and default/Staging builds PASS; full-size independent ZIP/openpyxl count/text/association checks PASS. See `docs/staging-final-20261028/IMPLEMENTATION.md` and TEST_RESULTS.json. Proposed Production apply/rollback refreshed and isolated-SQL tested; no promotion authorized.

Next: Owner tests updated Preview: Refresh Loading, Administrator, compact toolbar/KPI layout and Excel download. Full-size target Windows/browser/Excel acceptance remains open. DATA-001, Azinc/Expiry, Pharmacy Code and SEC-009 remain excluded. Preserve October 28 security, all report/quantity rules, capsule design, pharmacy isolation and Vercel main block. See `docs/releases/ACCEPTED_IMPROVEMENTS_PREP_20261028.md` for later approval/deploy/rollback sequence.


## 2026-10-28 — Consolidated selective Production preparation

All Staging improvements through97c7385 are Product Owner USER VERIFIED within tested scenarios. Production main/served08843e4 unchanged. Production-based release includes accepted startup, ExportV2, labels/Loading/Access, Reports, final Receiving toolbar and canonical Group.51 focusedPASS/buildPASS; final guarded SQL apply/rollback2PASS; full-size56588/78164 XLSX183requests. Live Supabase preflight unavailable (Unknown tool); concurrent writer lock impact and full-size Windows/Excel limits remain OPEN gates. No deployment or migration. Authoritative inventory, hashes, limitations, release/rollback/smoke sequence: docs/releases/ACCEPTED_IMPROVEMENTS_PREP_20261028.md. PREPARED FOR PRODUCTION APPROVAL — NOT DEPLOYED; final approval blocked pending gates.


## 2026-10-28 — Resumed export blocker correction

Production read-only schema/RLS/SEC007 compatibilityPASS after correcting malformed connection identifier. Staging migration20261028141551 switches revision triggers to BEFORE STATEMENT;17Items/22Identifiers/revision1 preserved. Owner/non-owner/revoked/session/mutation/rollback checksPASS. Existing real PostgreSQL concurrency proof reused;6 affected testsPASS,51 priorPASS retained. Production apply/rollback revised to BEFORE, no runtime/UI changes. Windows Chrome/Excel full-size result remainsOPEN. Details/hashes: docs/releases/ACCEPTED_IMPROVEMENTS_PREP_20261028.md. No Production writes/merges/deployments.


## 2026-10-28 — Production release deployed

READY FOR USER VERIFICATION. Approved3648a277 merged via PR33; runtimeab05fb5a5cfc2b1dc2cf35dabd9c8c5619c960ad, Pages40726680723SUCCESS. Production migration20261028162904 BEFORE STATEMENT applied/verified. Master56588/78164 counts and complete content hashes unchanged; SEC007/RLS/ACL preserved. Owner/non-owner/revoked read-only SQL checksPASS. Windows synthetic full-size Excel USER VERIFIED/PASS. CI/build/securityPASS. Actual signed-in Production UI/export smokePENDING; no USER VERIFIED DONE claim. No operational/Auth/Edge changes, no Vercel main deployment and no rollback. Details: docs/releases/PRODUCTION_DEPLOYMENT_20261028.md. This follow-up is documentation-only, runtime/SQL unchanged.
