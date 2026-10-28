# Production security execution — partial completion

## Production security execution checkpoint — 28 October 2026

Status: PARTIALLY DEPLOYED — PAGES PROMOTION BLOCKED BY VERCEL AUTO-DEPLOY RISK.
Approved source e7c53750ebc6eedf07c4fa11db5543e1578f13cf; official main/live Pages remains 6da2af6bac8c302e46a12cb9c95bb34cb67e3e19.
Production password-admin v6 and settings-rc v4 deployed, JWT true, exact approved source and SDK 2.118.0 read back. Both unauthenticated requests return 401; no operational passwords reset/users created. Photo cleanup v7 unchanged.
SEC-007 migration 20261028001737_sec007_production_trusted_session_gate_20261028 applied. Body MD5 99bda52f1b8577ac07f5c0d81bdbd8f7; postgres owner, exact postgres/authenticated EXECUTE ACL, SQL/STABLE/SECURITY DEFINER/boolean/search_path unchanged. Missing authenticated caller rejected. No operational data, RLS, grants or unrelated functions changed. Never automatically roll this gate back.
Production organization Pro verified; Supabase security advisory confirms Leaked Password Protection Disabled. No Auth setting changed. SEC-006 remains OPEN; do not reuse Stage Free-plan explanation for Production.
Release source CI 40606271131 and PR CI 40607873579 PASS (41 focused tests/build/audit zero). PR #31 opened, NOT MERGED. Main-associated Vercel deployments are target production; latest dpl_6aWqAbrHErXUhtsrMPCBkWXGN9h1 is READY at baseline main SHA. Existing 410 aliases do not prevent creation of a new immutable production deployment. Main merge was stopped to comply with explicit no-Vercel-Production restriction.
Proposed additional approval: add only vercel.json containing git.deploymentEnabled.main=false, leaving unspecified Preview branches enabled, re-run focused CI then resume authorized Pages merge/deployment. No such change applied yet. Do not merely use [skip ci] or trust 410 routes to prevent deployment. Reference: https://vercel.com/docs/project-configuration/git-configuration .
Production functional signed-in smoke, actual session restoration, existing-order/Manage Orders/Reports/Expiry/Needs Review/Settings/account-isolation acceptance remain NOT PERFORMED this execution. No authenticated browser session was available; no credentials requested or operational identities modified. Physical Zebra and actual multi-PC verification pending. Staging owner smoke PASS remains scoped to what owner tested.
SEC-002/003/005/006/009/012/013 remain separately outstanding. EXPIRY-SAVE-001 OPEN; PERF-001/UX-001 deferred. Entire security program NOT CLOSED. After completed Pages promotion classify READY FOR USER VERIFICATION until owner Production confirmation.
Exact next action: Product Owner approves the one-file Vercel main deployment block; then recheck main/backend hashes, add reviewed config to isolated candidate, run CI, merge via PR #31, verify official Pages SHA/assets and perform available non-destructive smoke. No repeat password audit or Stage fixtures.

## Recovery baseline

Exact previous live Edge sources remain in approved commit proposals/production-security/edge-before. Approved rollback SQL remains proposals/production-security/sec007-rollback.sql, but reopens SEC-007 and is not authorized automatically. The new Edge bodies match approved code byte-for-byte; current handler preserves Production provisioning, legacy adds reuse guard. Source and bundle hashes are distinct.

Current bundles: password-admin 7cba5408b830ad2775b351f13f2fbe29e5a2f853f55523f789a2d291ee324e16; settings-rc 6fce3fed4c4f85cb5f7e1c591ab6c494c78f5890fe63c37bfb4fe800cdcc3d38.

## Exact proposed additional config — not applied

```json
{ "git": { "deploymentEnabled": { "main": false } } }
```

This is a reviewed proposal, not part of approved e7c5375. It changes Vercel Git deployment triggering only, leaves Pages assembler/runtime unchanged and does not import Preview-only headers. It needs specific approval because the release authorization preserves the exact approved source and hosting workflow.
