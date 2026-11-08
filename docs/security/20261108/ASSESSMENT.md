# PharmFlow security audit and release candidate — 8 November 2026

**READY FOR REVIEW. Production execution BLOCKED pending separate authorization.** No confirmed unresolved Critical/High finding was established in this assessment. This is a scoped assessment, not a vulnerability-free certification.

Production source and served Pages: `1457f45fdf2af0ec84546a076e64191b5980a79a`. Repository `ahmed-sh89/pharmacy-receiving-system`; Production database `zznoshzcyxmtwfbznjyr`; Staging `tovkcakucyagvbzvlnks`. Final readback matched all **307** inspected public/application-private function definitions, owners, execution flags and configurations to pre-audit Production. No Production data, Auth setting, Edge deployment, schema, permissions, merge or deployment was changed.

## Reconciled October findings

The authoritative 29 October operational closure supersedes older repository labels. Current source/configuration and selective read-only checks were compared with that record; historical acceptance is not a new live test.

| Finding | Current status |
|---|---|
| SEC-001 | VERIFIED FIXED within parser/Worker scope; pinned SheetJS CE 0.20.3 and bounded parsing retained. Two original supplier workbooks unavailable for rerun. |
| SEC-002 | VERIFIED closure for known retired default/main/immutable Production-bound Vercel hosts: 410 responses rechecked. Preview remains separate. Not a promise about every future immutable URL. |
| SEC-003 | VERIFIED protected PR + strict required security checks ruleset 26077274 remains active. Required independent approvals: zero; owner PR-only bypass remains an explicit policy boundary, not a newly enabled bypass. |
| SEC-004 | Prior password reuse/caller-only/reset protections retained. Deployed Production handlers v7/v5 read back. Candidate adds session checks; does not redeploy Production. |
| SEC-005 | ACCEPTED RISK / PARTIAL: connection-only CSP and Pages framing/header limitations remain. Current active external scripts retain SRI/CORS. No speculative CSP or hosting change. |
| SEC-006 | PARTIALLY VERIFIED: October enabled Production protection, deployed weak_password handling and focused acceptance retained; no current Production leaked-password advisor. This is not live proof of breached-password screening across every Admin API path. Staging Free still reports protection disabled. No real compromised password used. |
| SEC-007 | Prior module/session guards retained. Additional database role/legacy boundaries and Edge session checks prepared and verified as described below. |
| SEC-008 | VERIFIED current dependency audit: zero reported npm vulnerabilities; reproducible install/build passed. |
| SEC-009 | VERIFIED current application table grants contain no anon/authenticated TRUNCATE/REFERENCES/TRIGGER privilege. Prior 90-grant remediation retained. |
| SEC-010 | VERIFIED runtime-only publication boundary retained; no source/SQL/credential artifact added to Pages. Diagnostic source was reviewed as gated runtime, not assumed secret. |
| SEC-011 | VERIFIED focused formula-neutralization fixtures retained; numeric corrections, Arabic and leading-zero text preserved. |
| SEC-012 | VERIFIED immutable Actions/root SDK pins retained. Optional transitive CDN locking remains deferred; no supply-chain compromise established. |
| SEC-013 | OPEN / vendor verification: Production managed build 17.6.1.155; Staging 17.11.0.003. Specific backport/CVE applicability remains unverified. No engine upgrade or unsupported infrastructure change. |

## November advisories and corrections

| Item | Assessment / minimum action | Candidate status |
|---|---|---|
| 24 anon-executable definers | Inspected bodies/owners/config/execution and call boundaries. Operational legacy wrappers call authorization guards; three public trigger functions cannot be used as normal trigger invocations through RPC; setup status intentionally reveals only an owner-exists boolean; membership helpers reveal no anonymous tenant rows. No blanket revocation justified. | Intentional surfaces retained; bounded behavioral verification, not 24 independent exploitation tests. |
| 222 authenticated-executable definers | Complete per-signature source-hash/call inventory included. Module/data/owner/member/private guards and PostgREST pre-request gate reviewed. SECURITY DEFINER is required for RPC-only storage. Owner defaults and helper grants are not treated as automatic escalation. | PARTIALLY VERIFIED across all APIs; focused critical boundaries tested. |
| 67 RLS tables without policies | Every listed table has RLS enabled and **no direct anon/authenticated table privileges**. RPC/private storage is intentionally default-deny. All public ordinary tables inspected have RLS; no public views were present. | VERIFIED intentional default-deny; no policies added. |
| 3 mutable search paths | Invoker trigger functions only: sync_pharmacy_active_status, touch_updated_at, update_session_timestamp. Bodies only update NEW fields/use now(); no demonstrated privilege escalation. | Low hardening: pin pg_catalog,public if contract exists. Missing in Staging; exact Production definitions tested in isolated PostgreSQL. |
| SESSION-BOUNDARY-20261108 | Medium: legacy owner/member predicates did not themselves enforce live sessions/mandatory-password state. Direct authenticated-role synthetic SQL reproduced an owner mutation with a nonexistent session. **Existing PostgREST pre-request guard already mitigates ordinary Data API calls**; this SQL result is not evidence of a public API takeover. | VERIFIED FIXED on Staging at the responsible helpers; legitimate roles preserved. Existing grants, owners and RLS untouched. |
| GLOBAL-PAGE-20261108 | Medium: legacy get_global_master_gtin_page checked identity only. Exact Production source allowed an unaffiliated live synthetic account to read the legacy global reference catalog. No cross-pharmacy operational records were demonstrated exposed. | Candidate requires existing DATA permission/current-pharmacy guard. VERIFIED isolated PostgreSQL; legacy function absent in Staging, so not claimed live-Staging verified. |
| EDGE-SESSION-20261108 | Medium: Auth getUser alone is not an explicit database-session revocation check before privileged password completion. | Both candidate endpoints fail closed on new self-session RPC. VERIFIED deployed Staging HTTP login/reuse/replacement/logout/revoked-token flows. New boolean probe is narrowly exempted from the password pre-request gate; business endpoints remain denied. |
| Password-response cache | Low hardening: legacy handler lacked no-store on credential responses. | Candidate no-store added; verified fixtures. Existing live weak_password behavior preserved in source. |

Inventories are evidence, not a claim that every RPC was exercised with every role. No dynamic SQL execution of user input was found in inspected application function implementations. Anonymous EXECUTE warnings will remain for intentionally guarded contracts. [RLS advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [search-path guidance](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [definer guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Verification

- Consolidated protected-CI/security/Auth/Receiving/Duty suites: **316 PASS, 0 FAIL, 3 SKIP** (319 total). Skips: original TO-000529235.xlsx, TO-000528294.xlsx, external monthly paste template.
- Final expanded affected PostgreSQL suite: **13 PASS**, overlapping the consolidated suite; do not add counts. Tests load exact captured Production definitions and exercise before/after unauthorized access, valid role retention, revoked/expired/foreign sessions, mandatory password, unaffiliated legacy catalog, search paths, ACL denial and atomic drift rejection.
- Actual Staging authenticated-role SQL: **11 assertions PASS**, including owner mutation rejection, member/admin separation, cross-pharmacy Receiving/Expiry and actual Duty RPC. Synthetic transaction rolled back.
- Actual deployed Staging password endpoints v6/v3: **9 HTTP checks per endpoint PASS**, including synthetic login, mandatory-session probe, same-password rejection, different replacement, subsequent login/metadata, logout, both endpoints rejecting revoked tokens. One disposable synthetic Auth identity was removed; no synthetic accounts remain.
- Build, diff validation, current tracked-source secret-pattern/service-role-JWT scan, npm audit: PASS. Secret scan is bounded current-source pattern scanning, not a new exhaustive full-history credential audit.
- Full historical suite: **NOT PASS / interrupted after a legacy fixture stalled**. All **75 observed failing test names** reproduced on untouched main 1457f45 in a separate checkout. They are pre-existing failures; no unrelated tests were rewritten or hidden. Evidence lists exact names. The passing release suites are distinct from a green historical suite.
- Source review covered active runtime HTML/escaping sinks, CSV/XLSX types, bounded upload parser, vendored scripts, authorization/session logic, Storage guards, Actions/deployment allowlist and environment boundaries. This was not physical Handheld, multi-PC receiving writes, external Excel/Outlook or browser exploitation certification.

## Scope, residual risk and release gate

No current confirmed Critical/High vulnerability remains established in the reviewed candidate scope. Production retains old boundaries until separately approved backend execution; do not call it remediated by this branch. Medium findings have the exact verification limits above. SEC-005 remains accepted; SEC-006/013 remain partially verified/vendor-dependent. Read-only Auth-setting tooling did not expose full policy configuration; advisory absence is not a complete Auth audit.

The source/fixture candidate is reviewable and verified within these boundaries. Production execution remains **BLOCKED** until the Product Owner authorizes the exact PR, both ordered migrations and two Edge deployments, accepts the stated residual/verification limits, and fresh release/backup preflight passes. No browser authentication retries or manual secret handling is requested.

See RELEASE.md for ordered deployment, forward recovery and acceptance. verification.json, release-hashes.json and both inventories carry compact evidence.
