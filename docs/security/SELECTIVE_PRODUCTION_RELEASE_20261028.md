# Selective Production security release — 28 October 2026

Decision: PREPARED / NOT DEPLOYED. Product Owner reports successful functional Staging smoke covering Receiving, Expiry, Settings and other tested modules. This supersedes the earlier Staging smoke timeout only for the workflows the owner tested; it does not certify all devices, operational writes or multi-PC sync. No full audit or authenticated password test was repeated.

## Verified baseline

- Repository/main and live official Pages version.json: `6da2af6bac8c302e46a12cb9c95bb34cb67e3e19`. Runtime lineage `4c9de95ee88e79dc86bac7bbd97d7ef1663cb198`.
- Release branch: `security/selective-production-prep-20261028`, based directly on that Production commit. The commit SHA is recorded by the handoff/result after publication, not embedded recursively in this document.
- Reviewed evidence: `PHARMFLOW_FINAL_SECURITY_20261028.zip`, SHA256 `3e134aac37b40187c4f643362b75acb791e83396291e0e302a1814452e445704`; assessment, handoff, all 34 inventory entries, release/rollback instructions. Source `security/final-closure-staging-20261028` / `7cd93a85ba916c48bbb18c279019d28b2777ce29`, ancestor relationship confirmed (3 commits ahead).
- Production Supabase `zznoshzcyxmtwfbznjyr`; Staging `tovkcakucyagvbzvlnks`. Production config/key/CSP/title/Vite production guard and Pages repository base retained.
- Live Edge readback: current password handler v5/JWT true (bundle SHA256 `2ddb033a88a047a948c2c81734a5b8d9b63d9029ea0c6d8efa6131503feded3a`); legacy settings handler v3/JWT true (`81d049507d5b221ddc84247c77eef15e8e4851c767bd05cdc7e399c0d9dc1c1d`); photo cleanup v7/JWT false unchanged. Bundle hashes are platform artifact hashes, not source-file SHA256.

## Included changes

- SEC-005: ONLY the verified QR/PDF SRI + anonymous CORS tags from index.html; existing Production CSP retained. Report script query version advanced for cache invalidation.
- SEC-008: exact Vite 8.2.4 and reviewed lockfile updates (nanoid 3.3.20, source-map-js 1.2.2).
- SEC-010/012: reviewed immutable Pages Actions and runtime-only artifact assembler. GitHub Pages deploy remains main-only; workflow_dispatch remains an existing authorized manual mechanism, not invoked here. New read-only release CI runs only tests/audit/build on this isolated branch and PRs to main.
- SEC-011: exact CSV formula neutralization preserving numeric values; dormant helper reachability limitation remains.
- SEC-004/012: Production live handler sources, not Stage snapshots. Current handler changes ONLY root SDK import to 2.118.0; preserves Production create-account operation journal/RPC/environment check, reset guards and caller-only completion. Legacy handler changes ONLY SDK pin + the already verified sameCredential reuse guard. Its own password generation/CORS/reset authorization semantics retained. Both require JWT true when separately deployed.
- SEC-007: standalone guarded apply/rollback under `proposals/production-security`, deliberately outside automatic migration directory. Uses exact verified Stage function body; no role grants, RLS, table or operational-data modifications. Live old Edge source backups are separate in `edge-before` for controlled rollback.
- Focused security, artifact, Production binding, isolated SQL/Edge and Receiving regression fixtures; release records.

## Explicitly excluded

The accompanying `SELECTIVE_34_FILE_DECISIONS_20261028.json` assigns every source-inventory path an included/adapted/excluded disposition.

Do not merge the full security branch. Excluded: `js/staging-environment.js`, Stage Supabase configuration/key, Stage title/CSP, Stage Vite guard/environment metadata, `vercel.json` Preview-only headers, Stage Edge snapshots/proposals, privileged test runner/template, live test identities/evidence fixtures, original Stage-specific CI, and automatic migration-directory file. Prior Stage documentation is used as historical evidence, not substituted for current Production checkpoint.

SEC-009 grants remain a separate proposal on the source branch: `proposals/security/20261028_sec009_least_privilege.sql` and rollback. Neither included nor applied in this release; explicit independent authorization/consumer compatibility review required. EXPIRY-SAVE-001 and all performance/UX/business logic remain unchanged.

## Focused validation

Clean `npm ci --ignore-scripts --no-fund --no-audit` successful. `npm audit --package-lock-only --ignore-scripts --audit-level=low`: zero known vulnerabilities. `npm run build`: PASS. 41 targeted tests PASS (0 failed/skipped), including exact migration body hashes, owner/ACL/body drift rejection, valid/revoked/foreign/expired/forced-change session gate, exact rollback, caller-only password parity, Receiving provenance/consolidation, CSV/SRI, runtime artifact exclusions, Production binding and HTTP-served nested Pages scripts/styles/CSS assets/Worker/parser/font paths. These are isolated tests, not live Production authenticated acceptance. Existing successful live Stage password evidence reused.

Hosted CI status is recorded separately after branch publication; do not infer hosted success from local PASS. Existing broad Group baseline failures are outside this run and are not relabelled PASS. Existing main photo-cleanup workflow failures were visible during run inventory; no diagnosis or change is included here.

## SEC-007 preflight and rollback

Live read-only preflight PASS: body MD5 `e9b53d68c5d32ec04a70409383af5e5f`; owner postgres; exact ACL `{postgres=X/postgres,authenticated=X/postgres}`; SQL/STABLE/SECURITY DEFINER/boolean/non-set/no-args; search_path `pg_catalog, auth`. Required auth.sessions columns id/user_id/not_after exist. Stage body MD5 `99bda52f1b8577ac07f5c0d81bdbd8f7`, same owner/ACL. Traced Production callers include private global/module/data gates, request guard, permission update, pharmacy registration/provisioning v1/v2 and admin assignment; those definitions are not changed. This shared gate affects reads/mutations; no full legacy RPC or operational-write certification is claimed.

`sec007-apply.sql` atomically checks exact baseline body, owner, ACL, signature and execution settings; replaces only this function; verifies fixed hash and unchanged attributes before commit. Any drift aborts the transaction. `sec007-rollback.sql` requires exact fixed body/attributes, restores captured Production definition and validates original hash. Tested in isolated PostgreSQL. Do not run either file during preparation. Rollback reopens the stale-token read window and needs explicit security approval; frontend rollback alone should retain the fixed gate when compatible.

## Exact authorized release sequence — STOP before step 1 writes

The following requires a new explicit Product Owner Production authorization. No authorization is implied by preparing or publishing the isolated branch.

1. Confirm approved release commit and recheck main/live SHA, Production Supabase reference, both live Edge v5/v3 source/bundle hashes/JWT flags and gate body/owner/ACL immediately before execution. Stop on drift or CI failure. Capture existing Pages deployment and exact Edge sources. Do not induce a main Vercel deployment or enable auto merge. No concurrent backend release during migration preflight/application.
2. Deploy ONLY reviewed `supabase/functions/pharmflow-password-admin/index.ts` and `.../pharmflow-password-admin-settings-rc/index.ts` to `zznoshzcyxmtwfbznjyr`, one at a time, preserving verify_jwt=true. Read back exact bodies, SDK pins and versions. Do not replace with Stage code; do not deploy photo cleanup. Stop on mismatch. No operational password reset/retest is authorized.
3. Apply ONLY `proposals/production-security/sec007-apply.sql` as a single atomic migration, with an approved unique migration label such as `sec007_production_trusted_session_gate_20261028`. Never apply the whole historical migration directory. Re-read hash/owner/ACL/config and confirm no other function/grant changes. Controlled identity/API revocation acceptance, if needed for Production closure, requires its own approved test scope; do not create/reset operational users or repeat completed Stage password tests.
4. Promote the exact reviewed frontend/toolchain/workflow commit through the normal reviewed main PR/merge process. This action triggers official GitHub Pages. No direct full Stage merge, force push, Vercel Production deploy or Auth setting change. Verify successful Pages run + exact served version.json and stamped HTML SHA, Production config/ref, SRI tags, repository-relative scripts/styles/Worker/font assets and exclusion of SQL/test paths. Confirm retired Vercel aliases remain retired using read-only checks; no hosting policy change.
5. Non-mutating signed-in smoke: startup/session restoration, existing Receiving orders/Manage Orders/Needs Review, Expiry, Settings and report/export/print assets as applicable. Stop on missing orders, authorization errors, wrong environment, Worker/CSP failures or uncertain data integrity. No operational Receiving/Expiry writes. Owner acceptance is required before USER VERIFIED/DONE; prepared/build/CI status alone is insufficient.

## Exact rollback sequence

1. Stop further promotion on first failed gate; record actual deployed versions and errors without credentials. Do not restore/delete operational data.
2. For a frontend/artifact regression, use an ordinary reviewed revert of this release (or its merge commit with correct mainline), preserving later unrelated approved commits, and redeploy Pages. If no later changes exist, resulting runtime files should match `6da2af6b` baseline. The new revert commit has its own served SHA; verify its bytes/config against baseline, not an impossible requirement to serve the old SHA. No force push/reset or database restore.
3. Keep the SEC-007 gate if compatible. Only if specifically authorized to reopen the known window, execute `sec007-rollback.sql` alone and read back original hash/ACL/owner. Stop on drift; never bypass guards.
4. Prefer a forward fix preserving reuse protection for Edge problems. Explicit emergency rollback can redeploy exact `proposals/production-security/edge-before/*.ts` for the affected handler with JWT true, then verify source and new platform version. Restoring the legacy handler baseline reopens SEC-004 and removes SDK pin; this is a separate security decision. Do not assume version numbers can be decremented or silently restore Stage code.
5. SEC-009 had no changes here and has no rollback action in this release. Preserve audit logs and all operational records.

## Remaining limitations and approval gates

- SEC-002: retired known shared/default/historical main hosts do not prove all immutable/future Production-bound URLs are blocked. Preserve existing routing policy; residual inventory risk remains.
- SEC-003: main protection not enforced; detailed administration access was unavailable. Reviewed PR/check/bypass policy remains a separate admin decision. This CI does not enforce branch protection.
- SEC-005: SRI promoted; Pages response-header capability and stricter script CSP remain unresolved hosting/acceptance choices. Preview headers deliberately excluded.
- SEC-006: breached-password screening requires supported paid capability and verification of Admin API paths. No billing/Auth settings changed.
- SEC-012: exact root SDK/Action refs improve pinning; transitive CDN integrity/lock coverage remains incomplete.
- SEC-013: engine patch/backport/backup/maintenance assessment and supported upgrade remain separate vendor/owner actions; version gap is not proof of demonstrated exploits.

No technical blocker was found in local preparation. Production writes/deployments are blocked pending explicit approval, hosted CI result and immediate drift recheck. Residual-risk acceptance must identify the above unresolved controls; a selective release does not close all 13 findings.
