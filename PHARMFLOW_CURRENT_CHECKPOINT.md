# PharmFlow current checkpoint — 9 November 2026

## Duty final layout — READY FOR USER TEST

Existing Draft PR #53 only, branch `fix/duty-exchange-staging-20261109-v2`; starting source verified `6be3bb2ba474c1bf24c821d50026b48e4931e5cb`. Production main remains `c68a940fecd9d40b57b625769e9a4654991b6010`. No Production/backend/operational change authorized or performed.

Original interaction, two/five-cell Exchange, Ctrl+Drag, Undo/Redo and Refresh persistence remain USER VERIFIED PASS; preserve that accepted state. New four layout refinements remain READY FOR USER TEST, not USER VERIFIED/DONE.

Root corrections consolidate the relevant CSS owners: intrinsic compact pagination (109→74px), content-based header/navigation/action tracks, removal of the 172px single-column KPI switch, one 2×2 metric grid plus emphasized full-width Total (21→26px) inside a smaller KPI section (67→64px), and distinct CSS hover/selection/focus row states. Today date logic, calculations, saving/auth, calendar/business rules and internal schedule scrolling unchanged. JS changed only toolbar/metric markup; index changes cache keys.

Measured before/after at 67/70/75/80/90/100% on two Windows-equivalent desktop/OS surfaces. 1366×768 uses one 34px control row at all six zooms. Narrow 1280×720 / OS 125% uses explicit two-row fallback below 1040px content; no overlap or page horizontal scroll. Grid table minimum unchanged; full six-column visibility follows available width. [Root causes, exact limits/files, 14 before/after screenshots, raw measurements and owner checks](docs/duty/LAYOUT_REFINEMENTS_20261109.md).

Actual tests: 28 focused PASS; full Duty 120 PASS / 1 retained historical snapshot FAIL / 1 optional SKIP (122 total); auth/session 42 PASS. Both existing browser runners and new two-surface layout runner PASS, 0 UI writes and unchanged synthetic data. Builds PASS. No existing test disabled; no full-suite-green claim. Final source SHA, ready Preview/Staging identity and final CI pinned in PR #53.

Next: owner visually accepts the four refinements. Stop after Staging; do not promote Production.

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
