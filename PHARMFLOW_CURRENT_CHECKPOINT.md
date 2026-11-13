# PharmFlow current checkpoint — 13 November 2026

## Work Order per discrepancy item — Staging review

Production baseline `6c82f95ae1c3d10915509917e8802e66f3510089` (PR #58). See the [Staging checkpoint](docs/receiving/email-item-wo/CHECKPOINT.md) for work order entry, copy verification and the Outlook review step.

## Receiving discrepancy email — Staging review

One table per TO with a single header for the date and all manually entered WO numbers, English left-to-right headers and approved Arial 10/11/12/15pt typography, signed differences with Arabic status quantities, and a TO-only subject. Application candidate and remaining Outlook verification are recorded in the [Staging checkpoint](docs/receiving/email-simplification-20261113/CHECKPOINT.md). Production release requires separate approval.

## Duty KPI / Today polish — READY FOR USER TEST — 9 November 2026

PR #53 only, branch fix/duty-exchange-staging-20261109-v2. Verified start d97d60417f53659d34782953a67c48c3b2a542db; Production main c68a940fecd9d40b57b625769e9a4654991b6010 unchanged. Existing USER VERIFIED acceptance retained.

Consolidated label/value grid spacing; symmetric Total tracks center number independently, unchanged 26px bar. Today now one line without weekday, 12px bold, Saudi date/highlight unchanged. No business/persistence/backend/data changes. Four-zoom Chromium before/after PASS: exact cell/header/KPI/grid geometry, centered Total ≤0.1px, text gaps, no overflow, zero writes. 24 focused PASS; both existing browser runners PASS; full Duty 120 PASS / 1 historical FAIL / 1 optional SKIP. Preview build PASS. [Exact files, root causes and visual evidence](docs/duty/KPI_TODAY_POLISH_20261109.md). Final source/READY Preview/CI identity pinned in PR #53.

Next: owner visual acceptance. Stop at Staging; no Production merge/deploy.

## Retained accepted Production releases



**PR #49 RELEASE CLOSURE: CLOSED — USER VERIFIED.** Product Owner Production acceptance recorded 8 November 2026. The previous operational acceptance blocker is resolved; no deployment or operational tests repeated for this documentation closure.

## Verified release identity

- Repository: ahmed-sh89/pharmacy-receiving-system. Production Supabase: `zznoshzcyxmtwfbznjyr`.
- Released [PR #49](https://github.com/ahmed-sh89/pharmacy-receiving-system/pull/49); approved head `be2f46b579d0087df004e45a8583f9c6dac84e07`.
- Application release merge SHA: `94300f212994c1995d7dc7595a80c929d0218de1`; official Pages [run 42520331672](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42520331672) SUCCESS.
- Product Owner-accepted / pre-closure Production main: `ee5f18dbde4233de078cd59a079a6dd28fe98ab3`, including documentation PR #50; official Pages [run 42520914046](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42520914046) SUCCESS for that SHA. Main, merged release identity and deployment evidence rechecked read-only for this closure. A subsequent documentation-only merge has its own SHA; application source remains identical.
- Released scope: nonpersistent automatic Handheld classification with explicit mode preserved; exact-URL parallel script preloads preserving execution order/SRI; one redundant registration-status read removed. No further application changes.

## Actual Product Owner Production acceptance — USER VERIFIED / PASS

On **8 November 2026**, the Product Owner confirms:

- Production loads completely and becomes usable **approximately 7 seconds after Refresh**, compared with the previously reported **approximately 30–60 seconds**. These are owner-observed approximate operational timings, not a controlled laboratory benchmark or a DOM-only timing.
- **Receiving, Orders and Reports** open successfully.
- **Expiry**, **Duty** and **Administrator** open successfully.

This explicit manual operational acceptance closes the prior PR #49 smoke-acceptance gap. Earlier agent sign-in returned `Invalid login credentials`; that attempt is not relabeled agent-authenticated PASS. No operational tests were rerun for closure and no operational data was modified by this documentation task.

## Staging / verification boundaries

Prior Product Owner **Staging USER VERIFIED / PASS** remains distinct: Windows authenticated Refresh **3.5 seconds in each of two trials**; Desktop restored after mobile emulation and stayed correct after Refresh; **Zebra / Receiving / Expiry PASS**. This is not a new Production hardware test.

Retained release evidence: 20 focused/build checks + 255 related regressions PASS; required security and session-boundary checks PASS. Prior agent Production checks established signed-out startup/reload, no app-origin startup errors observed, Production ref/CSP, 51 preloads and absence of Staging diagnostics. No operational tests or audit repeated; mandatory documentation CI remains required. Manual acceptance does not independently prove comprehensive security, cross-pharmacy isolation, token revocation, record fingerprints, every permission combination or physical hardware behavior. No whole-suite-green claim.

## Historical CI exception / safety

The reviewed **non-mandatory Duty file-snapshot exception** remains documented and unchanged. The old 81-file manifest matches the pre-release main; only four approved frontend/build files differ in PR #49. Retained Duty job: 108 PASS / 1 FAIL / 1 SKIP; only `tests/duty-release-isolation.test.cjs`'s historical byte-freeze comparison failed at `js/app.js`. It is not a verified Duty behavioral regression. No check was disabled or bypassed; required security checks must pass for this documentation PR as well.

Closure changes **only `PHARMFLOW_CURRENT_CHECKPOINT.md` and `PHARMFLOW_CHANGELOG.md`** through existing branch protection. No application code, SQL/migrations, Supabase/schema/data/Auth configuration, Edge Functions, secrets or operational records changed. No manual application deployment or replay of PR #49. The existing main-push workflow is unmodified.

Rollback remains a protected revert PR plus official Pages deployment; **actual rollback/restore was not tested**. No database rollback is required for the frontend-only release.


Security Release #47 remains CLOSED — USER VERIFIED with its previously documented residual risks and verification boundaries: [closure](docs/security/20261108/CLOSURE.md). No replay, reopened audit or new certification.
