# PharmFlow current checkpoint — 9 November 2026

## Duty interaction and Exchange — STAGING READY FOR USER TEST

Authorized Staging-only scope: DUTY-SCHEDULE-INTERACTION-001 root-cause fix, bidirectional atomic Exchange, Ctrl+Drag multi-range. Product Owner verification pending. No Production merge/deploy/database/Edge Function/operational writes authorized or performed.

Verified Production main: `c68a940fecd9d40b57b625769e9a4654991b6010`. Branch: `fix/duty-exchange-staging-20261109-v2`, based directly on that SHA. Staging Supabase: `tovkcakucyagvbzvlnks`.

Root cause reproduced: route activation cleared scheduler month/state but retained the visible DOM and controller data; identical server data skipped mounting. Tab switching mounted and restored the scheduler. Final fix mounts cleared/detached state independently of data equality and preserves a live grid on redundant activation. No timeout recovery or new polling.

Exchange submits both explicit equal, disjoint rectangles in one existing `save_pharmflow_duty_schedule_v2` transaction, retaining per-cell revision conflict guards and pharmacy lock. No migration required/applied. Automatic destination classification and explicit manual metadata preserved; one-frame revision-safe Undo/Redo. Ctrl+Drag adds a second range, normal drag replaces, third/mismatched/overlapping ranges disable Exchange.

Actual checks: Duty 114 PASS / 1 historical FAIL / 1 optional SKIP; related regressions 61 PASS / 1 historical FAIL; focused security 66 PASS. Both failures reproduced independently on unchanged main. Chromium real-pointer, idle-resume and reload integration PASS with synthetic server fixture; SQL-engine atomic rollback/rules/permissions tests PASS; default and isolated Preview builds PASS. Native Windows zoom, hosted two-PC acceptance and owner acceptance remain pending. No whole-suite-green or live operational test claim.

[Full implementation, evidence boundaries and exact owner tests](docs/duty/EXCHANGE_STAGING_20261109.md).

Published implementation commit: `2a0ba2ac54d4d66b889f6e78c23104c9926120f6`; tree `ca717856bc6154b82a8f22e53e1cd0021ada8511` matches the locally tested source exactly. [Draft PR #53](https://github.com/ahmed-sh89/pharmacy-receiving-system/pull/53), open/Draft, not merged. Existing candidate PR #52/branch left untouched; v2 is isolated.

[Runtime Staging Preview](https://pharmflow-test-axq2lh0mr-fhyh2xtskz-3504.vercel.app/) — READY, deployment `dpl_9eHMvNYCbjGhRixTqkGoFwafVXWv`, Preview target (not Production). Remote `/version.json` verifies the implementation SHA, environment staging and `tovkcakucyagvbzvlnks`. GitHub [security run 42525509793](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42525509793) SUCCESS; [session boundaries 42525509823](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42525509823) SUCCESS. [Duty run 42525509786](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42525509786) FAILURE: logs confirm 114 PASS / 1 historical snapshot FAIL / 1 optional SKIP. No bypass. This documentation follow-up does not change tested runtime assets.

Exact next action: owner performs the Staging acceptance list. Keep **STAGING READY FOR USER TEST** until actual verification. Do not promote or modify Production.

---

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
