# Startup and Handheld Staging investigation — 8 November 2026

Production inspected: `cbd249427dbe8a0acfd6426ef8eede2f2f4e5f29`.
Branch: `fix/startup-handheld-staging-20261108`.
No Production merge/deployment, backend changes, or operational test writes.
Security Release #47 closure and all approved business rules remain in force.

## Status

- UI-HANDHELD-DETECTION-001: **ROOT CAUSE VERIFIED / FIX IMPLEMENTED / AUTOMATED TESTS PASS**. Ready for owner browser/hardware acceptance; not USER VERIFIED or DONE.
- PERF-STARTUP-001: redundant request **ROOT CAUSE VERIFIED / FIX IMPLEMENTED**. The reported total 30–60 second delay is **NOT VERIFIED** and remains OPEN. No significant live improvement claim.
- Staging diagnostics and isolated Preview prepared for the next measurement. The complete task is not DONE.

## Verified responsible layers

Device: early `index.html` and the actually loaded **root `ui.js`** both read and wrote `PHARMFLOW_HANDHELD_DEVICE`. Android emulation could set it; subsequent Windows startup accepted the flag alone as device evidence. The similarly named `js/ui.js` is not loaded by this entry and was deliberately not edited.

A shared inline `PharmFlowDeviceMode` policy now owns early shell and operational detection. Windows defaults to Desktop even with the legacy flag. Automatic detection never persists a preference. `?handheld=1` and the existing deliberately selected `PHARMFLOW_HANDHELD_TEST_MODE` remain explicit modes. Zebra/Symbol/Enterprise identifiers and the generic narrow touch Android fallback remain supported. Fully emulated Android can look identical to real Android during that visit, but its classification is never persisted and disabling emulation restores Desktop on reload. The legacy ambiguous flag is ignored rather than guessed to be an explicit choice. No user storage editing/reset button is required. The policy is inline, adding no blocking asset request.

Startup: `bootstrapMedryvo` awaited `finishPendingAccessIfPossible`, which awaited registration status; bootstrap then awaited the same status again after context/permissions. Bootstrap now disables only the helper's redundant final status read and retains its own read. Other helper callers retain their existing default behavior. Pending owner setup, invitation redemption, registration submission, assignment claims, Auth/session validation, context, permissions and cloud authority are preserved. A registration submission may still need its existing status refresh; it is not treated as a redundant normal-refresh read.

## Complete source critical path and evidence limits

| Stage | Source ownership / order | Actual Windows timing |
|---|---|---|
| HTML/CSS/scripts/assets | `index.html`, classic ordered scripts, local deferred XLSX, optional async CDNs | NOT MEASURED |
| Auth restoration/refresh/password gate | `initializeAuth`, `refreshAuthToken`, `authRequest` | NOT MEASURED |
| Pending access | Assignment claim and conditional owner/signup/invite completion | NOT MEASURED |
| Context and permissions | `loadMyAppContext` → context RPC → permissions RPC; missing-pharmacy access check conditional | NOT MEASURED |
| Registration status | Normal restored startup: 2 reads before → 1 after | Controlled component measurement below |
| Workspace initialization | `initializeState`, account isolation and `ensureStartupCloudAuthority` | NOT MEASURED |
| Generation → Manifest → Ledger | Existing generation/manifest dependencies and complete ledger snapshot retained; scope/epoch checks and single flights retained | NOT MEASURED |
| Pending local ledger recovery | Existing `repairSharedReceivingLedgerFromLocal`; no test write performed | NOT MEASURED |
| Router/UI/other modules | Existing initialization, identity display, final render; full GTIN sync remains background work | NOT MEASURED |
| Loading dismissal | Auth presenter plus successful authoritative workspace initialization | NOT MEASURED |

The auth context-ready listener can begin cloud authority before bootstrap finishes; timing spans can overlap and must not be summed as sequential delays. Existing authority single flights are retained. A compatibility reconciliation call is conditional on a defined function; no implementation was found in the loaded sources, so it is not labeled a measured network stage.

The build reports ~977 KB capsule and ~1,146 KB tablets images plus ~688 KB combined CSS before gzip; size alone does not establish that these cause the reported delay. Optional CDN scripts are already async and full GTIN sync is already deferred. No speculative asset rewrite, parallelization across generation/manifest fences, cache reset, or Supabase change was made.

## Before / after timing

Three controlled runs execute the **real baseline and candidate bootstrap and pending-access functions**, with a synthetic 60 ms delay per registration response and all other dependencies held equivalent. Samples: baseline 125 / 124 / 121 ms; candidate 62 / 60 / 61 ms. This measures only the duplicated registration component: one request/round trip saved. It is not a live authenticated page measurement, nor evidence of resolving 30–60 seconds.

Actual before/after totals for authenticated Windows with active orders, empty orders, signed-out reload and repeated reloads remain **NOT MEASURED**. Network latency, stalled responses, cache/version state and rendering cost have not been attributed as the overall root cause. No live credentials or operational records were used.

## Staging measurement surface

Only this exact branch's Vercel Preview build emits `staging/startup-timing.js`. The bottom-right **Staging: startup timings** button displays a read-only snapshot. It captures HTML/navigation and asset timing, Auth network stages, context/permissions, generation, manifest, ledger, recovery, router/UI and first workspace startup. Observer wrappers preserve return values, promise identity and errors. Spans can overlap; failure does not become success. Only bounded stage names/numeric timings and asset paths are recorded; no tokens, identities, payloads, response bodies or storage values. Nothing is uploaded or written to a backend.

Preview runtime, CSP and version metadata target `tovkcakucyagvbzvlnks`, using its verified browser-publishable key. Default/Pages builds retain Production configuration. Other Preview branches remain rejected by the existing release guard. Preview does not alter Vercel project settings, Production aliases or `vercel.json`.

## Owner acceptance required

1. On Windows, open the exact Preview and sign in to Staging. Refresh with no active order, then with an approved synthetic active order, and repeat reloads. Use the timing button and report the snapshot/observed total. If no suitable Staging account or order exists, do not create Production data for this check.
2. Enable Chrome mobile emulation and reload; disable it and reload. Confirm Desktop returns without clearing storage. Repeat normal refresh, including the browser that had the old flag.
3. Check explicit `?handheld=1` and normal Desktop navigation. Verify logout followed by reload requires sign-in.
4. On the actual Zebra, verify normal Handheld opening, authenticated Receiving scans and quantities, Expiry scans, refresh/session handling and PC synchronization using approved test data. No physical test is labeled PASS here.

This Preview validates a candidate; successful Staging timings are not directly comparable to Production because hosts/backends/data differ. A valid comparable full before/after requires the same browser/device/cache/network and equivalent authenticated data, with the baseline captured through an isolated approved path. The in-Preview observer is available for the next diagnosis rather than declaring the incident resolved.

## Production impact

Production source inspected read-only and unchanged remotely. No main merge, Pages deployment, Supabase schema/data/Edge/Auth configuration changes or operational data mutations were performed. Changed application surfaces are detection and the ownership of one registration read. Sensitive scanning, transactions, ledger/manifest reconciliation, exports, Duty and permission implementations were not changed. Remaining risks are actual Zebra/browser behavior and the unresolved full startup latency; retain Draft status until measured acceptance.

## Automated results and outstanding manual matrix

- New device/bootstrap/observer/build-fence suite: **19 PASS / 0 FAIL**.
- Relevant security/Auth/authority/Receiving hydration/scanner/Expiry/permission suite: **255 PASS / 0 FAIL**. These include synthetic active/empty ledger authority, concurrent startup callers, failed reads, stale authentication, tenant/epoch changes and scanner input contracts. They do not establish real browser or hardware acceptance.
- Default build and exact Staging Preview build: **PASS**. Unapproved Preview branch: correctly rejected. Production config/CSP stays Production in the default artifact; exact Preview CSP/runtime/version target Staging. No mutation to a backend was needed.
- Historical whole-suite exploration remains **NOT PASS**. Existing missing historical commit fixtures, outdated source/version snapshots, older modal/quantity expectations and hanging cases were observed on unchanged baseline. `tests/duty-release-isolation.test.cjs` additionally fails its old byte-for-byte Duty release freeze assertion because this task intentionally changes protected frontend files; it is retained, not rewritten to hide the failure. This is a historical release manifest check, not a new operational assertion failure. See bounded baseline comparison when included.
- Agent local Chromium launch was unavailable and the browser download failed; no fabricated local browser or physical hardware PASS.

| Required manual verification | Result |
|---|---|
| Windows authenticated refresh, no active order | NOT PERFORMED |
| Windows authenticated refresh, active order | NOT PERFORMED |
| Logout then reload; repeated reloads | NOT PERFORMED in a real authenticated browser |
| Comparable real before/after totals | NOT MEASURED |
| Chrome emulation on → off → reload | Automated signal simulation PASS; actual Chrome test pending |
| Explicit Handheld | Automated policy PASS; actual UI acceptance pending |
| Zebra auto opening and physical scans | NOT PERFORMED |
| Receiving/Expiry Handheld and PC synchronization | Relevant automated contracts PASS; hardware/multi-PC acceptance pending |

Changed files: `index.html`, root `ui.js`, `js/app.js`, `js/auth.js`, `vite.config.js`, `staging/startup-timing.js`, `tests/startup-handheld-root.test.cjs`, `tests/startup-staging-build.test.cjs`, `.github/workflows/startup-handheld-staging.yml`, `PHARMFLOW_CURRENT_CHECKPOINT.md`, `PHARMFLOW_CHANGELOG.md`, and this task's evidence files. No dependency/lockfile change.
