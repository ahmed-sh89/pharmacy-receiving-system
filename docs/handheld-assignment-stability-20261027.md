# Handheld assignment stability and compact layout — 27 October 2026

**READY FOR TEST. Staging only.** Parent `6e5ec0829b0e00eb36e638e9ee53900959b9b30d`; branch `fix/handheld-assignment-stability-staging-20261027`. Production main remains `b618af9e0e55f30a616fd7e09eec9392ca6764c1`. No migration, Production deployment, alias, authentication/RLS or operational data modifications.

## Narrow source comparison and cause

Product Owner confirms fast restoration, direct assignment/removal and post-save success on the parent Preview. Those reported paths are accepted; this change addresses cross-order visual stability and only the assignment section's layout.

Current Production `js/pharmflow-next.js` preserves the mounted assignment form during Manifest/file events instead of rebuilding live controls; its root `cloud-workspace.js` prepares fresh generation/revision authority before local assignment mutation and verifies the complete assignment after v4 persistence. Reuse both patterns. Historical `95371d8` documents the repaint problem, but do not copy its early optimistic AppState mutation: later Production `8c27cb8` deliberately moved preparation before mutation. No cherry-pick or broad Receiving/auth redesign.

Parent `js/pharmflow-next.js` has one global `PF.assignmentSave`. During any save its renderer sets `input.disabled=pending||!ready||!writable` for EVERY order. Thus changing B disables confirmed A for the full prepare/save/readback round-trip, making the native blue checkbox look inactive. The previous browser test explicitly asserted that global disabling. This is a demonstrated source/isolated-browser lifecycle issue, not evidence that Supabase removed A. Parent code already retained checkbox.checked while pending; no authenticated trace established that its actual boolean changed or measured the Product Owner's exact2–3 seconds.

## Correction

- Maintain confirmed assignment projection separately from pending per-order intents. Update confirmed projection only from authoritative Manifest application/readback or completed on-open authority, never from a transient AppState write proposal or generic UI repaint.
- Keep keyed row elements mounted; update checkbox, selected background and explicit status in place. Unaffected rows stay enabled and visually stable. Only rows touched by a pending intent show spinner/`Saving...`; confirmed rows show green check-circle/`Assigned` or red X-circle/`Not Assigned`.
- Serialize full-Manifest writes through the existing API. Different rows may queue independently; the affected checkbox stays disabled until its request settles, so repeated same-row clicks cannot create conflicting writes. Queue/continuations remain scoped to the original identity/pharmacy. Close/reopen retains the pending model.
- Extend the existing client setter with an optional change list. AFTER fresh generation/revision preparation, merge only the requested per-order delta into current authoritative assignments, preserving unrelated rows/admin changes. Existing full-list callers and explicit zero-order assignments remain compatible. No new backend RPC or SQL.
- Select All conveys the complete current bulk intent, including locally confirmed rows that another session may have changed. Only changed rows need pending display. Existing v4 readback checks the WHOLE proposed assignment; a mismatch/partial response cannot produce success. Readback failure pulls current authority and displays an actionable error. One failed queued order does not undo another queued order's successful save.
- Compact two-column desktop grid; wrapped identifiers, checkbox and status in one unit; max-height176px with vertical scrolling only on overflow and no horizontal scrolling. Header/count remain outside the list. Preserve Select All. Remove obsolete action styling. Surrounding Active Orders and Order Data Check layout and logic are unchanged.

## Verification

**99 focused Node tests PASS, zero failures/skips.** Nine new setter tests cover fresh-authority delta merging, removal including last order, failure rollback preserving unrelated assignments, revision conflict authority, identity changes, invalid/inactive changes and legacy full-list compatibility. Existing90 tests retain Manifest authority/concurrency, import/session, Receiving/Handheld and SEC-001 coverage. Both actual original workbooks still parse: TO-000529235 total12; TO-000528294 source27+35/operational62, source lines preserved.

**Three isolated Chromium suites PASS:**

1. Expanded `tests/active-orders-instant.browser.cjs`: real modal/CSS/permissions, current Manifest and assignment functions, shared local RPC fixture. Observe EVERY DOM mutation and animation frame for untouched row checkbox value, selected background, element identity and enabled/status state while another row saves. Check assign/remove in both directions, independent pending state, rapid different-row serialization, same-row pending guard, failure rollback, failed-first/successful-next queue, confirmed statuses, Select All with changed remote authority, simulated partial bulk readback/no false success, refresh and separately loaded second fixture session. Loading/Retry/readonly/identity guards remain covered.
2. Same suite:18 desktop layout scenarios (1,2,4,5,10,20 orders × CSS zoom1/.8/.75), fixed176px maximum, no unnecessary1–4 scrolling, vertical overflow for10/20, no horizontal overflow, intact long identifiers. Internal visual review of2/20-order section screenshots. CSS zoom approximates the requested75–80% presentation; not a physical Windows/TC26 acceptance claim.
3. `tests/manage-orders-permission-race.browser.cjs` and `tests/receiving-consolidation.browser.cjs`: original workbooks through secure Worker, prior picker/revalidation race/denial/provenance/duplicate behavior, Receiving/Search/Dashboard and immutable per-Order saved report.

Three scripts total: the new state/layout checks are in the expanded existing browser script. Backend persistence in browser tests is a local fixture, NOT authenticated Supabase. No signed-in Staging browser tab/session was accessible. Live assignment/refresh/second-device behavior and actual Windows zoom remain UNVERIFIED for this new release. Product Owner prior acceptance is preserved as reported, not presented as new live test evidence.

Preview build, syntax and diff checks PASS; exact Preview-branch guard rejects a Production-target build. SheetJS CE0.20.3, secure Worker/input guard and importer/permission fixes unchanged. Parser SHA256 `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`; Worker `eda2ed6dc06571b9d455529524934bdcd0f4ef9a8025b49577d30094b11c6873`; input guard `5e5c9abd16cf15fbcc91fd31ed3c81bedba6cbc4a2822e8fcd02063869dcf183`.

## Minimal Product Owner acceptance

Use only the new verified Staging Preview and isolated test pharmacy. With A assigned, toggle B off/on and confirm A stays checked/blue while only B says Saving. Repeat in reverse; observe green success only after persistence. Try Select All, refresh and check the saved scope from a second session/Handheld. At75–80% zoom the two-column section should stay compact and scroll internally only when needed. Do not reimport/reset/delete orders or alter quantities. Keep READY FOR TEST until Product Owner verification. No Production promotion is authorized.
