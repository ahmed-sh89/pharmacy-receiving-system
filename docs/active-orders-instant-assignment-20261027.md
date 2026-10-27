# Active Orders restoration and instant Handheld assignment — 27 October 2026

Status: READY FOR TEST after Preview verification. Staging only. Parent `07eab4683f1647601abeeee772c19d98992b5dd4`; branch `fix/active-orders-instant-assignment-staging-20261027`. Production `b618af9e0e55f30a616fd7e09eec9392ca6764c1` unchanged. No migrations, aliases, backend permissions or operational data modifications.

## Source comparison and demonstrated failure

Current main and parent have identical `cloud-workspace.js` and `js/pharmflow-next.js`; no missing Production commit to cherry-pick. Retain latest Production authority/ledger/bootstrap implementation, `prepareActiveOrderManifestWrite`, `save_pharmflow_active_order_manifest_v4` generation/revision fencing and assignment read-after-write verification. Historical `d3d6a94e` introduced modal structural refresh; `82d923c` synchronized files and Handheld projection on every structural event and restored the durable ledger after final authority; `e452f22e` waits for permission recovery on foreground synchronization. All are already ancestors of this Staging baseline. Keep those paths and the current Receiving consolidation/SEC-001 fixes.

Baseline `pullActiveOrderManifest` recorded `lastManifestFullReadAt` BEFORE the permission-guarded RPC. A synchronous permission rejection therefore consumed its ten-second cooldown. Reproduction against exact parent function: two immediate ordinary reads -> one RPC invocation, timestamp set although neither read succeeded. Competing readers returned false while busy rather than joining the pending response. The modal opened without an authority read/loading state; it could display its pre-hydration empty list. Its same-active-order signature short-circuit updated counts but left existing checkbox states unchanged. These concrete client failure mechanisms match the reported symptoms. No signed-in browser/network trace was available to establish the exact timing breakdown of the Product Owner's ten seconds.

## Correction

- Open Manage Orders with compact loading/error/retry projection, await existing permission readiness, require Receiving view access and read current Manifest authority directly. No new polling or arbitrary startup delay. Empty is displayed only after an actual successful empty authority response. The modal owns file-list rendering even during background UI refreshes.
- Share concurrent full Manifest reads per identity; apply the ten-second normal read throttle only to successful current-scope authority responses. Reject late responses across user/pharmacy/logout/password scope changes and prevent older overlapping reads from rolling back confirmed newer manifests. Keep the adaptive background scheduler and full Receiving-ledger startup gate.
- Use the existing approved assignment API on checkbox change or Select All. Remove separate assign/remove buttons. Hold a single save across modal close/reopen, disable conflicting inputs while pending, show pending text, and synchronize existing inputs from authoritative Manifest updates. Green success occurs once, only after the existing v4 save and assignment readback match. Failure recovers authority and renders the confirmed assignment, with error feedback. The existing API supports an explicit configured empty assignment (including unchecking the last order); the older unused reports.js implementation is not substituted.
- Fence prepare/save/assignment continuations to the original identity. No Auth/RLS relaxation, database contract change, Receiving rewrite or changes to Handheld visibility rules.

## Verification and limits

90 focused Node tests PASS, zero FAIL/SKIP. Includes nine new authority tests, eight prior import authority tests, twelve SEC-001 tests with the actual original supplier workbooks, and existing permission recovery, auth timeout, startup-ledger, consolidation, order attribution, split queue, device work scope and Handheld scanner gates.

Three isolated Chromium scripts PASS:

1. `tests/active-orders-instant.browser.cjs`: actual modal, permission implementation, file renderer and current Manifest/assignment functions against shared local RPC fixtures. Loading stays visible while response is held, background render cannot show false empty, concurrent reads share one response, two orders/assignments restore, direct check/uncheck including last removal, Select All, pending/rapid conflicting events, no early success, failure rollback, assignment-only update, refresh, second separately loaded page, identity change, failed read/Retry, readonly and legitimate empty response.
2. `tests/manage-orders-permission-race.browser.cjs`: actual original files, secure Worker, file-picker permission race, totals12/62 and two source lines per file, denial/identity guards, duplicates/invalid input feedback.
3. `tests/receiving-consolidation.browser.cjs`: Receiving/Search projection, Dashboard and immutable saved per-Order report.

These browser endpoints are local fixtures, not authenticated Supabase persistence. Existing two real Staging orders and assignments were confirmed persisted by the Product Owner before this task. No available authenticated Staging browser/session or credentials: live refresh latency, direct Staging assignment/removal, cross-device visibility and physical Handheld remain UNVERIFIED in this release. No test orders uploaded, altered or deleted on live Staging; no Production data accessed for mutations.

Staging build, JS syntax, diff checks PASS; Production-target build rejected by exact-branch Preview guard. SEC-001 artifact unchanged: SheetJS CE0.20.3 SHA256 `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`; Worker `eda2ed6dc06571b9d455529524934bdcd0f4ef9a8025b49577d30094b11c6873`; input guard `5e5c9abd16cf15fbcc91fd31ed3c81bedba6cbc4a2822e8fcd02063869dcf183`. No private workbook content committed.

## Minimal acceptance

On the new verified Staging Preview, use the isolated test pharmacy: refresh and open Manage Orders. A brief loading message should precede the same two existing orders and their saved assignments. Uncheck then recheck one order; each should show Saving followed by green success, without another button. Refresh and check the same state from a second session/Handheld. Select All should save the complete scope. Preserve test orders and quantities12/62; no reimport, reset or deletion is needed. Keep READY FOR TEST until Product Owner acceptance; no main merge or Production release authorization implied.
