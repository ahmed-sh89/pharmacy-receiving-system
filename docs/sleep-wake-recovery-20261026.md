# Sleep/wake session and permission recovery — 26 October 2026

Status: READY FOR USER VERIFICATION after the conditional deployment gate. Actual Windows Sleep/wake acceptance remains pending. Baseline/rollback: `9ed6736b62b6212f34382d0dfbad6637c813ff05`. Production Supabase configuration is unchanged.

## Confirmed mechanism

`js/permissions.js` cleared its saved policy on any failed read, hid module navigation and routed away. Its only recovery listener ran on focus **only while the saved policy was active**, so a transient failure disabled its own recovery. Initial page load instead called `loadMyAppContext()` and loaded permissions independently of saved state, explaining recovery after Refresh without signing in. The in-app idle guard also rejects fetches while paused; idle resume previously reconciled cloud state without recovering permissions. The Receiving startup guard confused unavailable permissions with a confirmed disabled module and could clear local workspace projections.

The isolated browser negative control reproduces the original failure at the verified baseline: navigation does not automatically return after the network fault clears. This establishes the source mechanism, not a claim that Windows hardware sleep was reproduced in this environment.

## Focused correction

- Shared permission recovery on focus, visible, pageshow, Chromium resume, online and the existing in-app idle Resume action. No page reload or new polling loop.
- Expired/near-expiry or degraded sessions use the existing single-flight, cross-tab token-refresh lock before the existing authorized permission RPC. Genuine refresh rejection retains the existing sign-in lock. No server contracts or authorization changes.
- Explicit loading/reconnecting, unavailable and unauthenticated states. Pending/failed reads grant nothing. An unavailable response no longer navigates away or resets the Handheld mode. DOM input and selected route remain mounted; an authoritative revocation still redirects/hides denied modules.
- One shared read, event coalescing, three bounded transient retries (1/3/8 seconds), cancellation on hide/offline/sign-out, strict pharmacy/user/identity-generation checks. Pre-sleep requests older than 30 seconds can be superseded; their later result cannot replace current state.
- Permission snapshots are not durable cached grants. Malformed/foreign responses and definitive denials fail closed. Identity changes/logout invalidate in-flight reads and saved policy.
- Idle lock and its network guard remain intact. Recovery waits until the existing Resume action lifts that guard. The existing foreground cloud coordinator waits for permission recovery and also runs after a successful retry; only successful cloud synchronization clears a stale cloud OFFLINE indicator.
- Missing permissions cannot clear local Receiving workspace/archive projections. Existing confirmed module-denial behavior remains.
- Desktop status presents RECONNECTING while validating, and consumes actual cloud readiness afterwards. No visual design changes.

## Files

Runtime: `js/permissions.js`, `js/auth.js`, `cloud-workspace.js`, `js/header-account-ui.js`, `index.html` (cache versions only).
Tests: `tests/sleep-wake-permissions.test.cjs`, `tests/sleep-wake-session.browser.cjs`.
Records: this file and `PHARMFLOW_CURRENT_CHECKPOINT.md`.

## Verification

- 15 isolated permission/auth/lifecycle tests PASS, including pending/failed/stale responses, account isolation, unauthorized policy, retry bounds and local-state retention.
- Real Chromium, mocked HTTP: five scenarios PASS — transient fault; real idle guard/Resume plus existing foreground coordinator; wake-event burst with token rotation; denied account; genuinely invalid refresh token. No Production credentials or operational writes.
- Targeted Auth/Receiving startup/version/work-order/Expiry-input/focus regressions: aggregate 68 PASS, 1 pre-existing negative-control failure (missing Git object `09640864`). The same failure reproduces on the unchanged baseline.
- Existing Settings/Access suites: 13 baseline failures reproduced unchanged (missing fixture dependency `sortOwnerPharmacyRows`, stale assertions, unavailable historical Git objects). No Access form or role-definition changes were made; recovery tests exercise server denials, administrator identity invalidation and operator boundaries.
- Handheld History browser suite: 9 PASS, 1 superseded visual test skipped. Approved header suite: six TC26 viewport scenarios and two exact Desktop screenshot comparisons PASS. Scanner/no-Enter regressions PASS; physical hardware not tested.
- Syntax, diff whitespace and Production build PASS. Production served baseline and affected assets/config were checked before publication. Post-publication requires exact served SHA and asset comparison.

No database migrations, RLS/RPC/Edge Function changes, account/permission changes or operational-data modifications. Releasing this patch uses an expected-parent branch update; rollback is the baseline frontend tree. No database rollback is needed.

## Product Owner acceptance

Leave PharmFlow open on Windows, allow Windows Sleep, wake it, and confirm authorized navigation and Online return automatically without refreshing Chrome. If the existing Session Paused overlay is displayed, use its existing Resume PharmFlow button; it must recover in-app while preserving the current page and unsaved inputs. Physical Sleep/wake, device scanning and live multi-PC behavior are not newly USER VERIFIED by the synthetic tests.
