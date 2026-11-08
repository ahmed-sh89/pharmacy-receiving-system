# PharmFlow current checkpoint — 9 November 2026

## Duty final UI refinements — STAGING READY FOR USER TEST

Continue existing [Draft PR #53](https://github.com/ahmed-sh89/pharmacy-receiving-system/pull/53); no competing PR. Accepted source `67b5ce09492b7fb8fd9e2f7aec76028cd2c73d62`; branch `fix/duty-exchange-staging-20261109-v2`. Production main verified unchanged `c68a940fecd9d40b57b625769e9a4654991b6010`.

**USER VERIFIED PASS:** original interaction fix, two-cell Exchange, Ctrl+Drag two ranges, five-cell Exchange, Undo/Redo, persistence after Refresh. Product Owner acceptance explicitly recorded; preserve all six.

Three authorized UI-only changes: independent blue range/cell boundaries; slim green Today date-cell accent and compact Saudi-local date badge with midnight/wake updates; styled accessible Reports Employee Filter (names + code badges, top-layer scrollable list). Existing hidden select/change adapter preserves report behavior. No changes to exchange/saving/calculations, schema, Edge Functions, permissions, operational records or other modules.

Actual tests: four new UI/clock tests PASS; Duty 120 total / 118 PASS / 1 historical snapshot FAIL / 1 optional SKIP. Relevant auth/session 42 PASS. Existing real Chromium Exchange runner and new UI/midnight/dropdown runner PASS, 0 UI writes and unchanged synthetic data. 75/80/100% CSS zoom plus browser viewport/DPR rendering checked; six screenshots visually reviewed. Default/isolated Preview builds PASS. Historical snapshot failure at js/app.js retained without disabling checks; no full-suite-green claim.

[Exact changed files, visual evidence and three acceptance steps](docs/duty/UI_REFINEMENTS_20261109.md). Final tested SHA, Preview status/backend identity and current CI are pinned in PR #53. Next: owner visual acceptance of only these three refinements. Keep STAGING READY FOR USER TEST. No Production merge/deploy/database/operational writes authorized or performed.

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
