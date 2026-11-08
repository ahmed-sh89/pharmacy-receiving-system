# PharmFlow current checkpoint — 8 November 2026

## PR #49 — Production deployed; smoke acceptance OPEN

**PRODUCTION DEPLOYMENT: PASS / SMOKE TESTS: PARTIAL / RELEASE CLOSURE: OPEN.**

- Repository: ahmed-sh89/pharmacy-receiving-system. Production Supabase: `zznoshzcyxmtwfbznjyr`.
- Approved PR: [#49](https://github.com/ahmed-sh89/pharmacy-receiving-system/pull/49), exact approved head `be2f46b579d0087df004e45a8583f9c6dac84e07`.
- Required pre-merge main `cbd249427dbe8a0acfd6426ef8eede2f2f4e5f29` verified. Protected merge succeeded as release main/runtime SHA `94300f212994c1995d7dc7595a80c929d0218de1`.
- Official GitHub Pages [run 42520331672](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42520331672): SUCCESS for that merge SHA. Live HTML build meta and `version.json` both read back the exact release SHA. Later documentation-only merge has its own SHA/version stamp and does not change application source.
- Scope: shared nonpersistent automatic Handheld detection, explicit mode preservation, exact-URL parallel script preloads preserving execution order/SRI, one redundant registration-status read removed. All 13 reviewed files and exact head verified before merge. No extra application change.

## Product Owner Staging acceptance — USER VERIFIED / PASS

Windows authenticated Refresh #1 and #2: **3.5 seconds each**. Desktop restored after Chrome mobile emulation and stayed Desktop after subsequent Refresh. Product Owner reports **Zebra Handheld / Receiving / Expiry PASS**. This is Staging acceptance, not new Production authenticated acceptance.

## Actual Production smoke evidence

- PASS: official site opens in remote Chrome; standard signed-out Desktop shell (no `zebraDevice`), normal Sign in, no app-origin startup console errors observed, and signed-out reload returns to the protected sign-in state.
- PASS: deployed `js/supabase.js` and HTML/CSP readbacks use Production ref, no Staging ref; 51 preload links; no Staging timing script/button in Production.
- Authentication attempt through the secure credential form returned **Invalid login credentials**. No automated credential retry or password reset/change was performed. This does not establish an application regression or successful authenticated access.
- NOT VERIFIED in this Production execution: successful login/session restoration, authenticated Receiving/orders/reports/Active Manifest, Expiry records, Duty Schedule/Reports and existing employee/schedule contents. No records were created, edited or deleted by these tests. Live record preservation was not independently fingerprinted.
- Signed-out access remains blocked. Cross-pharmacy isolation, token revocation and comprehensive security are not certified by UI smoke tests.
- Actual Windows and physical Zebra Production checks were not newly performed by the agent. Preserve the explicitly accepted Staging evidence above without relabeling it Production acceptance.

## Safety gates / CI exception

Main/head/base, exact 13-file diff, conflict-free mergeability, active main protection and mandatory `PharmFlow security checks` PASS verified before merge. Targeted CI: 20 focused/build checks + 255 related regressions PASS; security/session-boundary workflows PASS. No required failing check was bypassed or disabled.

Duty CI has the previously reviewed **non-mandatory historical hash comparison** failure (`tests/duty-release-isolation.test.cjs`): main matched all 81 protected manifest files; the candidate differs only in four approved frontend/build files. Current Duty job: 108 PASS / 1 FAIL / 1 SKIP, with only that snapshot assertion failing at `js/app.js`. It was retained unchanged; whole-suite/all-CI green is not claimed. No Duty implementation change is included.

No SQL, migrations, schema/data/Auth configuration, Edge Functions, secrets or operational records were changed. Existing security #47, tenant/account gates, Manifest/ledger/transaction synchronization, scanning, permissions, exports and persistence are preserved within reviewed/tested boundaries. No speculative Production fixes.

## Remaining incidents / exact next action

- **DUTY-SCHEDULE-INTERACTION-001 — OPEN**, separate from PR #49. Intermittent Duty cell selection/editing may stop responding after navigation or the in-app Session Paused reload, and may occur without that overlay. Browser Refresh restores interaction. No fix included or authorized here.
- PR #49 closure remains **OPEN** until successful authenticated Production smoke acceptance: login/Refresh; read-only Receiving/orders/reports/Manifest; Expiry; Duty Schedule and Reports; confirm no unexpected password-change screen or operational data changes. Use secure sign-in if continuing agent tests, or record explicit Product Owner Production acceptance. Never request credentials in chat.
- Rollback source baseline is retained; rollback plan is a protected revert PR and official Pages deployment. The prior Pages artifact was available during readiness review. **Actual rollback/restore was not tested.** No database rollback is needed for this frontend-only release.

## Security Release #47 — retained accepted state

Security Release #47 remains **CLOSED — USER VERIFIED** for its prior operational acceptance, not comprehensive security certification. Approved head `0ba04efc5f2272ef6f496914693c31f130a2c6b2`; deployed release SHA `76a14f0f77c55bea8e6df76a5695f428ab1ccfbb`. Migrations `20261108123709_security_session_boundaries.sql` then `20261108124636_security_live_session_request_gate.sql` were previously applied atomically; password Edge handlers v8/v6. No replay or backend change in PR #49.

Residual risks remain: SEC-005 accepted CSP/framing limitations; SEC-006 partially verified comprehensive breached-password screening; SEC-013 vendor PostgreSQL patch/backport dependency. Prior security and historical full-suite verification limits remain; no new penetration/cross-pharmacy certification. [Security closure](docs/security/20261108/CLOSURE.md).

This outcome update changes only this checkpoint and `PHARMFLOW_CHANGELOG.md` through the protected documentation workflow. It records deployment success and partial smoke coverage; it does not mark PR #49 DONE or repair Duty interaction.
