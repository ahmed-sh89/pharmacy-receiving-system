# Manage Orders import — permission revalidation race

Date: 27 October 2026, Asia/Riyadh. **READY FOR TEST**, pending Product Owner authenticated Staging import/persistence verification. Not USER VERIFIED or DONE.

## Source/environment

Production main and audit/SEC-001 baseline remain `b618af9e0e55f30a616fd7e09eec9392ca6764c1`. Source starts at SEC-001 Staging `cad393449889410c326e2b3ea71d90cfede2d5ca`; isolated branch `fix/manage-orders-import-staging-20261027`. Only Staging `tovkcakucyagvbzvlnks` is selected. No alias, Supabase schema/data/Auth/RLS/Storage or Production changes. Deployment identity and exact Preview URL are recorded in delivery after publication; do not use the default pharmflow-test alias, which remains Production.

## Confirmed first broken boundary

Classification: **frontend permission-event lifecycle / asynchronous import coordination**. Not an Excel decoding defect or proven database failure.

1. Add Order Files opens the native picker through `js/app.js` `bindCoreApplicationButtons` → `#orderFileInput.click()`.
2. Returning focus runs the existing `js/permissions.js` focus listener → `resume()` → `load()`. Its intended fail-closed behavior clears the saved permission projection, sets phase `loading`, and temporarily disables/hides restricted controls until the server response.
3. Its document capture listener handles both `input` and `change`. While permission state is loading it called `preventDefault()`/`stopImmediatePropagation()` on the file input events.
4. Consequently `bindCoreFileInputs` never receives the selection. `handleOrderFileSelection` never starts; **Worker starts0 / imported orders0 / no toast** in the reproduced browser fixture. Restoring permissions later does not replay the lost browser event.
5. Thus no order-registration/Manifest request is reached for that selection. The brief Reconnecting message is expected revalidation; the defect is dropping an already selected asynchronous input during that interval, not the revalidation check itself.

This exact ordering was reproduced with the **unmodified baseline guard**, the actual `bindCoreFileInputs`, original supplier files, the real browser Worker and actual renderer. The previous SEC-001 parser fixture did not load the document-level permission guard, which explains why it could pass while missing this failure.

The browser fixture is isolated: permission and persistence responses are controlled mocks and all external requests are blocked. It establishes the actual event-loss mechanism, not proof that a live authenticated Supabase import succeeded. Product Owner screenshots corroborate empty Active Orders and revalidation; they do not provide a live console/network trace. No signed-in test session was available in the connected browser (zero tabs), and no credentials, users or operational pharmacy records were created/changed to manufacture a PASS.

## Smallest coherent correction

- `js/permissions.js`: allow only order-file `input`/`change` **delivery** to its async handler. All click/scanner/other guarded events retain the same checks. During loading, keep a previously enabled native file input alive long enough to deliver its selection. A prior denied/disabled input is not reopened as a grant.
- `js/excel.js`: capture File objects immediately as before, retain the single-import lock, await the existing `whenReady()` promise, and require current RECEIVING write authorization before processing. Recheck at parser/structural/Manifest/registry/source boundaries; reuse pending permission reads rather than issuing new RPCs. The parser validates all SEC-001 limits unchanged.
- Fence every pending selection to identity epoch, user ID, pharmacy ID, session presence and mandatory-password state. A same-user token refresh stays valid; logout/login, user/pharmacy switch or forced-password change cancels the import with a visible message. An old manifest failure cannot restore its saved workspace into a different account.
- No cached/stale grants, retry polling or broad auth redesign. Missing permissions fail closed. Tests explicitly supply authorization mocks instead of a runtime test bypass.
- Cache versions for the two changed runtime files and the isolated branch build guard are updated. All SEC-001 artifact bytes, Worker protections, original line normalization, duplicate rules, per-order aggregation, quantities, Group and backend authorization contracts remain unchanged.

## Focused evidence

**81 Node tests PASS /0 FAIL /0 SKIP** with the two private originals supplied:

```text
tests/order-import-authority.test.cjs
tests/sec001-excel-security.test.cjs
tests/sleep-wake-permissions.test.cjs
tests/auth-request-timeout.test.cjs
tests/receiving-consolidation-review.test.cjs
tests/receiving-duplicate-line-allocation.test.cjs
tests/receiving-order-attribution.test.cjs
tests/work-orders-scope.test.cjs
tests/handheld-scanner-rearm.test.cjs
tests/receiving-split-queue.test.cjs
tests/receiving-startup-hydration.test.cjs
tests/receiving-safety-gates.test.cjs
```

Actual isolated Chromium suites:

- `manage-orders-permission-race.browser.cjs`: baseline event loss reproduced before correction; fixed path waits without early Worker/registry writes, resumes after FULL permissions; readonly,403 and identity changes reject visibly; permission refresh during a pending manifest save pauses downstream writes and resumes; duplicate/invalid files still show errors. Uses real focus listener and both supplier files. Persistence mocked, no live Supabase claim.
- `sec001-excel-browser.cjs`: patched library/SRI, Worker, original file selection, Active Orders renderer, duplicate/error feedback. Explicit authorization fixture.
- `receiving-consolidation.browser.cjs`: existing Receiving Search/Dashboard/immutable saved report regression. No backend network.

| Original file | Source lines | Operational items | Ordered total | Date |
|---|---:|---:|---:|---|
| TO-000529235.xlsx |2 |2 |12 |2026-10-26 |
| TO-000528294.xlsx |2 (27+35) |1 |62 |2026-10-26 |

The exact original files remain outside Git; no supplier workbook/password/token was committed. SEC-001 original old/new matrix equivalence, mapping/GTIN/date/leading-zero parsing and Expiry XLSX export tests remain green. Existing numeric Item Code canonicalization is unchanged. No full legacy-suite green certification or physical Handheld/multi-PC claim is made.

## Live verification boundary

Staging catalog reads confirmed the existing permission, registration and Manifest RPC definitions/signatures and their server-side guards; no migration is indicated by this reproduced pre-handler failure. No live authenticated browser console/network record, committed order writes, refresh persistence or Receiving↔Expiry navigation acceptance was available. These remain **UNVERIFIED**, not PASS. No operational HHP084 data was touched. No session/security protection was bypassed to obtain access.

Reproduce with private file paths:

```bash
PHARMFLOW_SUPPLIER_DIR=/private/originals PLAYWRIGHT_MODULE=/installed/playwright TC26_CHROMIUM_EXECUTABLE=/installed/chromium node tests/manage-orders-permission-race.browser.cjs
```

The baseline reproduction mode `EXPECT_IMPORT_BLOCKED=1` expects the old behavior and is intended for the baseline checkout; it must fail against a fixed implementation. Fixture output identifies mocked persistence explicitly.

## Product Owner's single acceptance scenario

On the exact new Staging Preview, sign in to the existing isolated test pharmacy. Open Receiving → Manage Orders → Add Order Files and select both originals. Confirm both orders appear, totals12 and62, no receiving quantity change, and duplicate selection is rejected. Export once to Excel; refresh and navigate Expiry→Receiving to confirm the same saved orders/quantities remain. Briefly switch tabs during selection/import. Report PASS or the visible message. Do not reset/delete operational data or use the Production/default alias.

If a different live failure remains after this event boundary is fixed, collect its actual console/RPC response and investigate that next boundary as a focused task; do not infer successful persistence from this fixture. Final status stays READY FOR TEST until Product Owner acceptance. Production promotion requires separate authorization.
