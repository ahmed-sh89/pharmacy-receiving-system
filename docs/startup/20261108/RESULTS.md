# Startup / Handheld — Staging results, 8 November 2026

Production baseline verified: `cbd249427dbe8a0acfd6426ef8eede2f2f4e5f29`.
Branch: `fix/startup-handheld-staging-20261108`.
Draft PR: https://github.com/ahmed-sh89/pharmacy-receiving-system/pull/49
Measured runtime SHA: `f9d5bfeb59a2d360d4ad78d6172d85b17d6eec00`.
Verified READY Preview: https://pharmflow-test-62521qhhb-fhyh2xtskz-3504.vercel.app/

**STAGING READY FOR USER TEST. Not USER VERIFIED / DONE.**
No Production merge/deployment, database/Edge/Auth configuration changes or operational data test writes.

## Root causes and implementation

**UI-HANDHELD-DETECTION-001 — ROOT CAUSE VERIFIED / FIX IMPLEMENTED / AUTOMATED TESTS PASS.** Early `index.html` and the actually loaded **root `ui.js`** both persisted automatic Android detection to `PHARMFLOW_HANDHELD_DEVICE`, then trusted that flag alone on subsequent Windows visits. A baseline reproduction test confirms emulation → stored flag → Windows still Handheld. The similarly named `js/ui.js` is not loaded by this entry and was not edited.

A single inline `PharmFlowDeviceMode` policy now owns shell and operational classification. Windows defaults to Desktop regardless of that ambiguous legacy flag; automatic detection never persists intent. Explicit `?handheld=1` and the deliberately selected existing `PHARMFLOW_HANDHELD_TEST_MODE` remain supported. Zebra/Symbol/Enterprise identifiers and narrow touch Android fallback remain supported. Fully emulated Android can look identical to hardware for that visit, but it cannot poison later Desktop visits. No reset button or storage editing is required. The shared inline policy adds no extra asset request.

**PERF-STARTUP-001 — TWO COMPONENT BOTTLENECKS VERIFIED / FIX IMPLEMENTED. Full reported authenticated 30–60 second incident remains NOT VERIFIED / OPEN.**

1. A real Staging browser measurement showed classic JavaScript downloads occurring serially from approximately 1.35 to 8.88 seconds, delaying DOM readiness and the first authentication request. Source tags are parser-ordered blocking classics. Exact-URL script preloads now fetch those same files in parallel while preserving script execution order, readyState/lifecycle behavior, local XLSX defer, existing optional-CDN async, SRI and security gates. No broad defer/async conversion was made. Source preloads serve Pages; Vite removes/re-emits them after transformation so they match the actually executed URLs, without hashed duplicates or preloading an untransformed Production configuration into Staging.
2. Normal bootstrap called registration status twice: once inside pending access, then again after context/permissions. Bootstrap disables only the helper's final read and retains its own final authoritative read. All other helper callers keep their default status refresh. Pending registration submission can still require its existing refresh. Assignment claims, signup/invite/owner completion, Auth, context, permissions, tenant isolation, Manifest/generation/ledger gates and recovery are retained.

## Actual before/after measurements

Same remote Chrome session, same Vercel project, same Staging backend, signed out, first navigation to each distinct deployment origin. Both snapshots show nonzero transferred bytes for application assets. One comparable first-navigation pair, not a statistical benchmark or a Windows claim. Before SHA `96b7d5cea7c14fedc4d69308fa33ba595e8795dc` already contains the detection and registration fixes; after SHA `f9d5bfeb59a2d360d4ad78d6172d85b17d6eec00` adds parallel preloads. The comparison therefore isolates the asset-loading change.

| Metric (milliseconds from navigation) | Before preloads | After preloads |
|---|---:|---:|
| HTML response start / end | 582 / 589 | 574 / 577 |
| DOM interactive | 8,891 | 1,587 |
| DOMContentLoaded | 8,952 | 1,653 |
| Auth initialization start | 8,976 | 1,676 |
| Auth initialization duration | 1,770 | 1,477 |
| Auth initialization finish / sign-in state | ~10,746 | ~3,153 |
| Public setup RPC duration | 1,762 | 1,467 |

Before: config started 1,348 ms; utils 1,503 ms; state 1,779 ms; app 6,829 ms; final Duty script 8,742 ms. After: all 51 classic local downloads started in the 1,241–1,247 ms window and finished before DOM ready. Actual request overlap establishes the waterfall correction; variable setup RPC latency is reported separately, not attributed to the preload fix.

An additional **warm candidate reload** reached DOMContentLoaded at 981 ms and finished Auth initialization at ~1,674 ms. It is not compared against the cold baseline. Repeated candidate navigation settled on the protected Sign in screen. The real browser also applied `zebraDevice` for explicit `?handheld=1`, then removed it on normal-URL navigation without clearing storage. No application-origin console error was observed; extension-metadata errors came from a `chrome-extension://` URL.

Separate controlled component comparison executes the real baseline/candidate bootstrap and pending-access functions with a synthetic 60 ms registration response: baseline 125/124/121 ms; candidate 62/60/61 ms. This proves one round trip saved; it is not a live authenticated total.

**Actual Windows/DevTools, authenticated active/empty order and physical Zebra measurements are not performed.** The result does not prove that the user's complete 30–60 second delay is resolved.

## Startup path and measurement boundaries

| Stage | Runtime owner / dependency | Evidence |
|---|---|---|
| HTML/CSS/JS/assets | `index.html`, same ordered classic scripts | Actual paired Staging timings above |
| Session restore/refresh/password gate | `initializeAuth`, `refreshAuthToken`, `authRequest` | Signed-out actual timing; restored-session timing pending |
| Pending access and registration | `finishPendingAccessIfPossible`, registration RPC | Real-source controlled request-count/timing tests |
| Pharmacy/context/permissions | Context RPC → permission RPC, conditional access-status RPC | Relevant automated fail-closed tests; live authenticated timing pending |
| Workspace initialization | State + account isolation + cloud authority | Automated tests; live timing pending |
| Generation → Manifest → ledger | Existing complete scoped authority/single-flight gates | Relevant hydration/regression tests; live timing pending |
| Pending ledger recovery | Existing local-unsynced transaction repair | Preserved; no operational test write |
| Router/UI/modules/identity | Existing initialization and rendering | Signed-out shell settles; authenticated timings pending |
| Loading dismissal | Auth presenter / successful authoritative startup | Signed-out observed; protected workspace pending |

Auth context-ready can start cloud authority before other bootstrap work finishes. Timing spans can overlap and must not be summed. Full Global GTIN sync remains in the background; optional CDNs remain async. Capsule/tablet assets (~977/1,146 KB uncompressed) were downloaded in the actual trace, but are not established as the overall incident cause. No cache reset, authority bypass or speculative database optimization was made.

## Automated and CI results

- New classification/bootstrap/observer/preload/build-fence suite: **20 PASS / 0 FAIL**.
- Related Auth, security #47/session boundaries, permission/tenant changes, Manifest/ledger hydration, Receiving and Expiry scanner contracts: **255 PASS / 0 FAIL**.
- Default Production-config build and exact Staging Preview build: **PASS**. Unapproved Preview build: correctly rejected. Existing `vercel.json` main deployment block and Pages workflow remain unchanged.
- GitHub runtime SHA CI: [Startup and Handheld](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42518127062) **PASS**; [security checks](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42518131834) **PASS**; [session boundaries](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42518131876) **PASS**.
- [Duty readiness](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42518131791) **FAIL: one historical byte-freeze assertion** in `tests/duty-release-isolation.test.cjs`, reporting `js/app.js`. It asserts current source still equals an older Duty release manifest. The authorized startup change intentionally changes that file. The historical test was not rewritten to conceal the failure; PR remains Draft, and required CI is not claimed all green. Duty's other assertions in that job passed.
- The historical whole suite is **not green**. A bounded exploratory comparison before the preload change recorded baseline 1,319 PASS / 138 FAIL / 4 SKIP and initial candidate 1,338 PASS / 137 FAIL / 4 SKIP; three files exceeded a 12-second per-file limit on both. Counts omit timed-out files. One additional candidate failure was the intentional historical Duty byte-freeze; some baseline artifact-layout checks differed with build-output availability. It is not evidence of a clean full suite or a final full-suite rerun. Details: `BASELINE_COMPARISON.json`.
- Local Chromium installation failed; the subsequent actual browser measurements used the available remote Chrome. No Windows or physical-hardware PASS is inferred.

## Preview configuration / diagnostics

The exact branch's Preview alone emits `staging/startup-timing.js` and a **Staging: startup timings** button. It records bounded numeric spans and stage names, navigation and asset paths. It records no tokens, identities, payloads, response bodies or storage contents, and performs no upload/backend write. Observer tests preserve return values, promise identity and rejection behavior.

Deployed HTTP readbacks verified version SHA/environment/ref; runtime Supabase config and HTML/CSP contain Staging `tovkcakucyagvbzvlnks`, no Production ref, and HTML contains 51 matching preloads. The key is the existing verified browser-publishable Staging key. Default/Pages builds keep Production binding; arbitrary Preview branches remain rejected. No project settings or Production aliases changed.

## Owner acceptance / exact next action

1. Open the verified Preview on Windows, sign in to Staging, then refresh with no active order and with an approved synthetic active order. Repeat reloads. Open **Staging: startup timings** and provide the snapshot plus observed total so any remaining Auth/authority delay can be attributed. Do not create Production data for this test.
2. Enable Chrome mobile emulation and reload; disable it and reload. Confirm Desktop returns without storage changes, including the browser previously affected by the old flag. Check intentional Handheld selection separately.
3. Verify logout followed by reload requires authentication.
4. On real Zebra, verify Handheld opening, Receiving scans/quantities, Expiry scans, refresh/session behavior and PC synchronization using approved test data.

| Required scenario | Current status |
|---|---|
| Windows fresh/restored session, active/empty orders | PENDING owner |
| Chrome mobile emulation on/off; stale flag | Automated synthetic signals PASS; actual Windows pending |
| Normal Desktop and explicit Handheld | Automated PASS; signed-out remote Chrome DOM selection PASS |
| Repeated reload | Signed-out remote Chrome PASS; authenticated pending |
| Logout and reload | Related automated tests PASS; live authenticated pending |
| Physical Zebra / Receiving / Expiry / multi-PC | Automated contracts PASS; physical acceptance NOT PERFORMED |
| Entire user's 30–60 second delay resolved | NOT VERIFIED |

## Files and Production impact

Application: `index.html`, root `ui.js`, `js/app.js`, `js/auth.js`. Preview/build: `vite.config.js`, `staging/startup-timing.js`. Verification: two `tests/startup-*.test.cjs` additions, `.github/workflows/startup-handheld-staging.yml`. Documentation: checkpoint, changelog and this evidence directory. No dependency/lockfile, scanner transport/business logic, transaction/Manifest implementation, exports, Duty implementation, security migrations or Edge source changed.

Production main remains `cbd249427dbe8a0acfd6426ef8eede2f2f4e5f29`. No Production release is authorized or performed. Recheck current main before any future promotion. Keep Draft status, pending owner/hardware acceptance and the disclosed historical CI gate; no USER VERIFIED/DONE claim.
