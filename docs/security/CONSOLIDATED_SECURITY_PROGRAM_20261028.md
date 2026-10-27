> Historical preparation record. Superseded by FINAL_SECURITY_CLOSURE_20261028.md and the final verified execution report. Fixed-URL/Git-disconnect recommendations no longer apply.

# PharmFlow security program — 28 October 2026

Production release readiness: **NOT READY**. No Production release authorized or performed. This branch is development source only; no new application Preview published and the stable test URL is NOT repaired.

## Source candidate

Branch security/source-hardening-staging-20261028, based on Production6da2af6bac8c302e46a12cb9c95bb34cb67e3e19. Never merge the entire historical Staging branch into main. Preserve accepted Staging12764f80 and SEC-00433f19f67 as separate reviewed packages.

Package A: SEC-008 plus CI portion SEC-012. Vite8.2.1 -> exact8.2.4, compatible transitive nanoid3.3.17 ->3.3.20 and source-map-js1.2.1 ->1.2.2. Rolldown/native bindings1.2.3 ->1.2.15 and @oxc-project/types follow the supported Vite patch dependency graph. No force upgrade. Clean npm ci --ignore-scripts completed. New npm lockfile audit reports0 vulnerabilities; original lockfile reports3 High package groups. This is a development-tool inventory result, not proof of an exposed Production Vite server. Official Action major refs resolved to immutable current commit IDs in the proposed deploy workflow only; existing trigger/permissions/Pages publishing behavior unchanged. Edge imports remain @supabase/supabase-js@2 and are NOT silently changed without Auth acceptance.

Package B: SEC-005 script integrity plus SEC-011 dormant CSV hardening. Existing QRCode1.0.0 and jsPDF2.5.1 URLs/versions retained with SHA384 integrity+anonymous CORS. SheetJS0.20.3 and Worker unchanged. No claim of closing jsPDF advisories outside reviewed reachable use. CSV untrusted formula-leading strings (including leading whitespace/control characters) gain a leading apostrophe; actual numeric values, including negative quantities, remain unchanged; raw leading-zero strings, Arabic and quote escaping are preserved. Spreadsheet clients may still auto-format ordinary CSV numeric-looking text; no universal CSV cell typing claim. Current UI caller for dormant CSV helper remains unverified; original POTENTIAL confidence retained. No new export UI is exposed. Script CSP, HTTP framing/headers, old nested app and hosting constraints remain open.

Branch-only vercel.json opts this exact development branch out of automatic Vercel deployment BEFORE first publication. It does not implement SEC-002 persistent project isolation. A read-only isolated Actions workflow runs only on this branch/PR target and never requests secrets, deployment/environment permissions or uploads.

## Tests and material limitations

17 focused Node tests pass:5 new security cases plus12 existing Receiving/consolidation fixtures. Clean dependency install/build succeeds. Browser isolation test with downloaded exact CDN bytes: QR renders, jsPDF generates PDF; altering either CDN asset causes browser SRI rejection. No live Auth/database account writes. Runtime JS diff is reports.js only; copied build assets preserve exact SheetJS/Worker and legacy runtime except that helper. No auth/Expiry/Receiving business-rule code changes.

Additional exploratory existing tests are NOT all green: Global Group suite7 pass/1 fail and Expiry Inventory Group suite5 pass/3 fail. The same named4 assertions fail on the unchanged Production baseline. Do not silently relabel them PASS or fix unrelated business behavior here. The initial missing-linkedom error in the new worktree was resolved by clean installation. The focused gate intentionally lists only relevant offline fixtures; it is not the entire historical npm test suite. Existing baseline assertion failures need separate triage before broader regression closure.

No new real supplier workbook, signed-in functional, two-PC, login/recovery, operational Receiving/Expiry write, session revocation or password acceptance is claimed. Reuse previously accepted supplier/Receiving tests; do not manufacture new acceptance evidence.

## All13 original findings, Production versus candidate

| ID | Original severity | Current status and residual scope |
|---|---|---|
| SEC-001 | High | FIXED/VERIFIED in prior deployed scope; pinned parser/Worker retained unchanged |
| SEC-002 | Medium | BLOCKED: test/default-main aliases still Production; project Git/full settings controls missing; no alias-only workaround |
| SEC-003 | Medium | PARTIALLY VERIFIED: disposable branche8e22a32, actual GitHub runs40536385698 and40536608292 successful; protection inactive; main protected:false/rulesets[] |
| SEC-004 | Medium | Staging READY FOR TEST implementation33f19f67, authenticated acceptance BLOCKED; prior16 isolated/401 evidence reused. Fresh legacy readback Stagingv1 guard present; Productionv3 guard absent. Production OPEN |
| SEC-005 | Medium | PARTIALLY FIXED: SheetJS prior fix; remaining active CDN SRI prepared/tested here. Production HTTP/script/framing controls still open |
| SEC-006 | Medium | OPEN: fresh Production advisor still warns leaked-password protection disabled; no policy change |
| SEC-007 | Medium | REQUIRES CONTROLLED VERIFICATION: session revocation/module differences; no operational token tests or migration |
| SEC-008 | Medium | Production OPEN; source candidate READY FOR TEST with zero known lockfile audit vulnerabilities and clean build |
| SEC-009 | Low | OPEN: fresh catalog11 tables retain extra non-CRUD privileges; no grant migration |
| SEC-010 | Low | OPEN: Pages still publishes repository root; explicit runtime artifact plan required, no removals |
| SEC-011 | Low/Potential | Dormant helper correction prepared/tested; actual reachable UI consumer remains unverified; Production unchanged |
| SEC-012 | Low | CI pins prepared; Production tags and Edge broad imports remain. Partial candidate, not closed |
| SEC-013 | Medium | OPEN: fresh Production engine17.6/build17.6.1.155; individual exploit/backport applicability not proven |

Read-only catalog:0 public ordinary tables with RLS disabled. That does not prove every policy/function correct or cross-tenant isolation fully verified. No confirmed remaining Critical/High application finding in original register afterSEC-001; no breach or public privileged-key exposure newly established. The final assessment covers reconciled original findings and this narrow source diff, not a fresh whole-system penetration test.

## Minimum administrator actions, direct links

1. SEC-002: https://vercel.com/fhyh2xtskz-3504/pharmflow-test/settings/git — enable full project administration for the agent, or disconnect ONLY this test project's automatic Git deployment connection. This preserves GitHub branches and existing deployments but stops automatic branch Previews; future selected candidates must be deployed explicitly. This option matches one manually selected stable test release, but do not assume automatic per-branch Previews continue. Official Pages is separate. Do not delete project or deployments. Then let the agent verify disconnection, branch-safe selected deployment, alias/default-main retirement and a controlled redeployment. Alias-only change before persistence is verified remains prohibited. Domains: https://vercel.com/fhyh2xtskz-3504/pharmflow-test/settings/domains . Complete build/Git settings readback and stage-only source guard are prerequisites; no guessed API payload.
2. SEC-003: https://github.com/ahmed-sh89/pharmacy-receiving-system/settings/branches and /settings/rules — provide supported administration access and independent reviewer. Rehearse ONLY disposable branch rules first. Main activation still needs separate Product Owner approval. Required check job must actually run on the intended PR/base before registering it. Do not enable an impossible one-person/self-review path or break rollback.
3. Auth testing/SEC-004/007: https://supabase.com/dashboard/project/tovkcakucyagvbzvlnks/auth/users — provide supported server-side Admin API provisioning/cleanup or an approved isolated admin testing capability. Do not paste a service-role key/password/token into chat, edit auth tables through SQL, or use HHP084. Need disposable users representing two pharmacies plus an authorized test owner for positive reset cases.
4. SEC-006: https://supabase.com/dashboard/project/tovkcakucyagvbzvlnks/auth/providers — separately approve supported leaked-password policy assessment/enablement and equivalent admin-path enforcement; no Production Auth change. Verify feature/plan availability first.
5. SEC-013: https://supabase.com/dashboard/project/zznoshzcyxmtwfbznjyr/settings/infrastructure — managed security patch/backport confirmation, backup/restore/extension preflight and maintenance proposal. Upgrade requires separate approval; no database operation now.
6. SEC-009: approve a separate reviewed minimal grant migration only after compatibility/role matrix; do not ask Product Owner to hand-run SQL. SEC-005/010 hosting/headers and artifact publication also need independent approved release review.

Direct settings locations may redirect with dashboard navigation changes. None were changed here. These are distinct administrator tasks, not6 requests to paste credentials or perform routine SQL.

## One consolidated acceptance session, after infrastructure readiness

Precondition: verified stable test URL, exact selected candidate SHA, Staging runtime binding and explicit STAGING indicator; no use of that URL now while it still targets Production. Provision synthetic A/B pharmacy accounts and test owner, retain created-resource ownership journal and cleanup capability.

1. Both deployed password endpoints: reject reuse of temporary credential, accept distinct replacement, login succeeds with new and fails with old, must-change state correct; unauthenticated/non-owner reset rejected, body target cannot affect another account; test owner reset only within synthetic resources. Capture observed old/access/refresh-token behavior without publishing tokens. Do not claim immediate revocation unless observed and chosen as the contract.
2. Receiving/Expiry session checks with synthetic fixtures: sign-out, reset, suspension and module disable separately; test retained bearer, refresh, tab sleep/wake and second PC against the agreed revocation expectation. No cross-pharmacy reads/writes/photos. SEC-007 remains open until measured.
3. New candidate sanity: QR/scanner display, PDF download/print/font, Excel import/export on previously accepted supplier files; verify12/62 totals and source provenance, Active Orders refresh, Handheld independent assignment/Select All, Expiry photos and Needs Review. No repeat full project acceptance cycle; use one short fixture run. CSV client acceptance only if its dormant helper is intentionally exercised; inspect apostrophe handling in Excel2016/2019, leading zeros, Arabic and negative numeric corrections.
4. After approved header policy candidate: iframe rejection, imports/Worker/printing/photos/WebSocket console clean. Not satisfied by adding SRI alone.
5. Verify stable URL remains the explicitly selected release after a controlled non-production deploy and main does not reclaim it. Check both aliases, old Preview and official Pages unchanged. Remove only newly created owned synthetic resources through supported APIs and verify cleanup.

## Production security release plan — NOT AUTHORIZED

1. Resolve environment isolation and complete required live Auth/security acceptance; record baseline failure triage. Review the actual selected diff from current main, not wholesale Staging replacement.
2. Integrate only reviewed source changes from this branch; exclude rehearsal-only vercel.json and branch-specific candidate workflow from blindly copying into main. Carry separately accepted SEC-004 Edge patch as its own deploy with JWT/caller/owner checks retained. Database grant/session/Auth/engine changes require independent approval and must not be hidden in a frontend release.
3. Fresh main/Pages/Edge/config hashes, exact rollback source+deployment; clean Production build with Production ref, SEC-001/Worker/CSP/path/font/export smoke and no bundled privileged credentials. Required checks/review cannot be assumed enforced beforeSEC-003 activation.
4. Obtain separate explicit Production release authorization. Normal non-force commit/merge and Pages deployment; verify exact served SHA/ref/assets, non-mutating authenticated startup/modules. No operational test writes. Do not claim two-PC verification without evidence.
5. Regression rollback: reviewed revert of the precise frontend commit or supported previous verified deployment; no force-push, database restore or destructive cleanup. Edge rollback to prior handler reopensSEC-004 and needs explicit security tradeoff. No database migration in this source package. Stop on wrong ref, data uncertainty, auth regression or Worker/build failure.

EXPIRY-SAVE-001 remains OPEN:25October Handheld1 and27October PC1 are legitimate units; no quantity correction. Stuck pending notification root cause unconfirmed; no Expiry fix in this package.
