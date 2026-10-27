# PharmFlow final coordinated security execution — 28 October 2026

Current decision: Production security release NOT READY until Product Owner functional acceptance and separately approved release/administrative gates. Main6da2af6bac8c302e46a12cb9c95bb34cb67e3e19 unchanged. This branch descends from security source candidate7127a1aa10482ffcfe427802cedc5e7d90a6f321 and adds a Staging-only runnable Preview configuration. Do not merge the whole branch into main.

## Current workflow decision supersedes earlier fixed-URL proposals

No permanent Staging URL is required. Keep Git integration and independent verified per-task Previews. On28 October the Vercel test project Production deployment was paused using the supported project operation. Both test-named default/main aliases now return503 DEPLOYMENT_PAUSED. The accepted12764f80 Preview and official Pages6da2af6b remained200. No alias repoint, Git disconnect, main source change or official Production deployment occurred. Pausing prevents automatic Production-domain assignment; do not resume this project's Production deployment unless its safe environment contract is reviewed. A controlled new Preview must verify persistence before SEC-002 closure. Final execution report records new Preview IDs/URLs/SHAs.

## Implemented source and Stage backend changes

- Retain prior SEC-001 parser/Worker and source candidate fixes: exact Vite8.2.4, nanoid3.3.20, source-map-js1.2.2, CDN SRI, CSV text neutralization and immutable Action refs.
- SEC-010: scripts/build-pages-artifact.cjs assembles an explicit source-runtime allowlist: root app files, js, css and approved image/font assets/licenses. It rejects symlinks and existing output directories, excludes tests/SQL/proposals/nested legacy app/scanner HTML, and preserves exact referenced assets and PDF font. Proposed deploy.yml uploads pages-artifact instead of repository root. Official Pages workflow remains unchanged until separately released.
- SEC-005 Staging-only vercel.json enforces frame-ancestors none, object-src none, base-uri self, DENY framing, nosniff and strict-origin-when-cross-origin. Script/default policy is report-only with inline hash and allowed known hosts/Worker/blob/font behavior; this is intentionally NOT a fully enforced script CSP closure. Production Pages HTTP-header limits remain unresolved without a separately approved hosting decision; no hosting architecture change was made.
- Candidate CLOUD_CONFIG and document connect-src use Staging only. Compact STAGING indicator is derived from actual CLOUD_CONFIG URL and is absent for Production configuration. Staging-specific title/config/vite guard/vercel headers must not be promoted as Production files.
- SEC-012 Staging current password-admin v4->v5 and legacy v1->v2: change only root import from @supabase/supabase-js@2 to exact2.118.0, resolved from the current CDN. Fresh source readback matched exactly; JWT verification remains true. The current Staging handler's extra approved create-account path was preserved. Snapshots under proposals/staging are reproduction evidence, not Production entrypoints. Root repository current handler retains Production-v5 lineage plus only the pin; never overwrite Staging current handler with a different environment's variant. Transitive integrity/lock coverage is not claimed complete.
- SEC-009: reviewed exact11-table/2-role non-CRUD REVOKE proposal plus exact recorded-grant rollback; tested in isolated PostgreSQL. No Supabase grant change applied.
- SEC-007 actual Staging migration **20261027223203_sec007_trusted_session_gate** replaces only private password_change_complete() with live session/subject/expiry validation in addition to its trusted password flag. Signature, ownerpostgres, ACLpostgres+authenticated, STABLE/security-definer/search_path pg_catalog,auth preserved. Body hash beforee9b53d68c5d32ec04a70409383af5e5f, after99bda52f1b8577ac07f5c0d81bdbd8f7. Source migration has exact old-body precondition and an explicit rollback reopening the window. No Production migration or data change. Do not bulk-push historical migrations.

## Live authentication and session evidence

Supported Auth Admin API inside a temporary secret-protected, expiring Staging-only test runner created only tagged synthetic users. No service-role secret was retrieved or printed; no operational account was used.41 live authenticated checks passed against legacyv1/currentv4: reuse rejection, caller-only change despite foreign target fields, new/old credential login, flag preservation/clearance, non-owner reset rejection, successful true System Owner reset through both endpoints, refresh and global sign-out. Four Auth identities/profiles and temporary owner role were removed; exact zero counts verified. A profile FK initially blocked Auth deletion; only ownership-verified generated profile rows were removed, then supported Auth API deletion completed. Audit logs were retained.

A second isolated two-pharmacy/member fixture measured SEC-007. Before fix, old tokens after global logout and after reset/completion still received200 from permissions and Receiving manifest-metadata RPCs; Expiry rejected them. After fix, valid sessions remain200 and revoked tokens403 across all three RPC families. Cross-pharmacy calls403. Parallel same-user sessions both worked; local logout rejected its own token while another session continued200. Pharmacy suspension, member disable and module disable denied business reads. Own permissions may remain readable when only modules are disabled, which is intentional context, not operational data access.

Two remaining live fixture identities/pharmacies are retained only until the final authenticated Preview smoke, then must be removed with exact ownership checks. Temporary owner role added for post-pin testing was already removed. The final execution report must confirm cleanup and the test runner's inert410 retirement before closing the session. No service-level receiving/Expiry quantities or real pharmacy records were changed. Mutation authorization is additionally traced through the same gate; actual operational writes were not claimed as tested. Remaining legacy/owner RPC families and physical multi-PC/Handheld behavior are not certified by these read checks.

Post-pin Staging v5/v2 received10 further actual owner/reset/reuse/complete checks, all passed. SEC-004 is authenticated-verified in this scope, READY FOR USER TEST, not DONE/Production fixed. SEC-007 confirmed in original live-read path, fixed/tested on Staging inspected gates, still requires user regression acceptance and Production release. Temporary runner template is redacted and test-only; it must never be deployed to Production. Original invalid fixture deletion attempts were corrected, not concealed as initial success.

## Test scope

39 focused offline tests (existing security/Receiving,16 handler cases, artifact/headers/grants and session SQL), clean build and the unchanged locked dependency audit. Original source candidate CI40588778497 passed17 tests; source candidate dependency audit0 remains applicable. Newly published branch CI/deployment evidence is recorded in the final report. Four pre-existing Global/Expiry Group assertions fail equally on unchanged baseline; they are not silently passed or repaired. Per-task browser smoke and cleanup are final runtime gates. Existing supplier totals12/62 and approved operational acceptance are reused; no fresh operational write/second-PC PASS is invented.

## All13 findings, retain original severity/confidence

| Finding | Current status |
|---|---|
| SEC-001 High | FIXED/VERIFIED deployed scope retained |
| SEC-002 Medium | Vercel Production paused; default/main aliases isolated; verify persistence across new Preview before final closure |
| SEC-003 Medium | Required read-only CI prepared for PRs to main; prior CI real successes; main protection inactive, administration/approval gate remains |
| SEC-004 Medium | Real authenticated Staging acceptance passed; pinned runtime retested; Production legacy still unpatched; READY FOR USER TEST |
| SEC-005 Medium | SRI prepared, Preview headers enforced, script policy report-only; Production headers/framing remain open |
| SEC-006 Medium | BLOCKED: Stage organization Free; vendor screening requires Pro+. No paid upgrade/Auth setting change |
| SEC-007 Medium | CONFIRMED revoked-token window on synthetic read paths; Stage shared gate fixed/live-tested; Production unchanged and broader legacy/owner/physical acceptance remains |
| SEC-008 Medium | Patched exact tooling, zero known lockfile audit, clean builds; Production source not yet promoted |
| SEC-009 Low | Exact least-privilege/rollback SQL prepared and isolated-tested; Production ACLs unchanged |
| SEC-010 Low | Runtime allowlist implementation/asset tests ready; actual Production artifact still whole repository until approved release |
| SEC-011 Low/Potential | CSV helper protected/offline-tested; no current UI caller found; no reachable exploit or universal Excel typing guarantee claimed |
| SEC-012 Low | CI SHA pins prepared and Stage Edge exact root imports deployed/tested; Production refs unchanged; transitive lock/integrity residual |
| SEC-013 Medium | Production17.6/build17.6.1.155 versus Stage17.11.0.003; platform patch/backport/maintenance/restore gate remains. Not44 proven application exploits |

## Minimal remaining Product Owner actions

1. One functional acceptance on the NEW verified Preview from final report: login with approved Staging test account; Receiving/Manage Orders restore; check/uncheck/Select All assignment; QR/PDF/Excel import/export; Needs Review and Expiry/photo/navigation; refresh/tab wake and physical Handheld. Use synthetic Staging data only. Do not use503 retired aliases or Production credentials. Backend Auth reset/reuse tests are already automated and need not be repeated manually. Browser console CSP reporting and iframe proof are recorded by agent where available; full signed-in photo/print/import flows remain acceptance.
2. GitHub https://github.com/ahmed-sh89/pharmacy-receiving-system/settings/branches : separately approve protection activation first on the disposable rehearsal branch, require PR/independent review and actual passing named check, block force/deletion and bypass. Main requires separate approval; no manual push/rejection test requested when agent can perform it after administration is available. Effective API403/control absence remains blocker. Exact setting payload in prior rehearsal runbook.
3. Supabase Stage https://supabase.com/dashboard/project/tovkcakucyagvbzvlnks/auth/providers : leaked-password protection is Pro+; current plan Free. Approve a paid plan only if desired, then enable supported policy and test both normal and admin-completion paths. No automatic billing or Production policy change. The toggle alone does not prove privileged Admin API policy enforcement.
4. Production maintenance https://supabase.com/dashboard/project/zznoshzcyxmtwfbznjyr/settings/infrastructure : obtain vendor patch/backport/backup/extension status and separately approve supported maintenance window. Do not run an engine update or database restore in this task.

No further general Vercel approval, stable URL setup, Git disconnect, user screenshot loop, credential-in-chat or Auth-admin manual provisioning is needed for the completed fixture tests.

## Production release and rollback — NOT AUTHORIZED

Recheck current main and deployments. Selectively integrate shared security source changes; preserve Production URL/public key/CSP/title/vite main guard, and exclude Staging-only vercel config/snapshots/test runner. Do not merge this branch wholesale. Required CI should run actual reviewed PR head; protection is not presumed active. Preserve SEC-001, Receiving provenance/quantities, current Expiry logic, GTIN/report/archive/transfer/Handheld behavior.

After user acceptance and separate explicit Production release authorization: deploy shared source/Pages allowlist, legacy password parity and exact Edge pins as reviewed independent components; apply ONLY approved SEC-007 migration after fresh hash/ACL preflight. SEC-009 grants and SEC-006/013 policy/engine changes need their own explicit approval and compatibility gates. Run clean Production-bound build/Worker/font/export/startup checks, then normal non-force release and exact served SHA/ref verification. Do not mutate operational data for smoke.

Rollback reference is current main6da2af6b/runtime4c9de95e, with verified normal deployment source. Frontend regression: reviewed revert, normal redeploy; never force-push or restore databases. A frontend rollback need not undo a backward-compatible session guard. Session rollback requires explicit security approval and reopens SEC-007. Edge rollback must preserve the SEC-004 reuse guard where possible; Production legacyv3 restores the weakness. Keep exact environment/version/source snapshots and approve any unavoidable security tradeoff.

EXPIRY-SAVE-001 stays OPEN, separate: two legitimate physical units, no quantity correction. Pending notification cause remains unconfirmed; no Expiry incident code change in this package.
