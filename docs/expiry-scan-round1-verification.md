# Expiry Scan UI refinement — Round 1

Start b72c63de49176ffe5a75fb119f06223ddaaaf77b. Runtime b86ab28646da2b83c9dc52286e7c0a7ed6478854. Branch feature/expiry-stage1-visual-gate, Vercel pharmflow-test, Supabase tovkcakucyagvbzvlnks. Production untouched; no schema/migrations/backend changes.

## Component change

The Scan renderer formerly generated five dashboard cards; its canonical presentation now renders two compact current-session metrics inside the Scan card header. It uses the same successful signed employee-session receipts and original unique-item/quantity definitions. Inventory period cards and server queries are unchanged.

Active Item spans the capture workspace, product identity is clearer, and Save & Next aligns with the form controls. Desktop known/review/error states use green/amber/red plus text/icons. The individual receipt table separates persisted Batch/Serial, Expiry and Quantity; saved operator/time remain secondary identity details. Actual sample_serial is shown per capture with a styled detail dialog. No grouping, invented multi-serial relationship or quantity-derived serial count.

Session Edit/Delete reuses existing versioned transaction path and common dialog owner with session-only appearance/options. Cancel/Save Changes/Delete Entry, explicit identity/current values, retained validation, pending labels and duplicate-submit guard. Inventory dialog defaults unchanged. Canonical viewport calculation now respects parent bottom padding in Scan only, eliminating measured 16px document overflow.

## Files

- index.html
- css/dashboard.css
- js/expiry-desktop-v2.js
- js/expiry.js (Desktop rendering/status labels only)
- tests/expiry-capture-review.test.cjs
- tests/expiry-desktop-operational-ux.test.cjs
- tests/expiry-inventory-filter-reset.test.cjs
- tests/expiry-record-modal.test.cjs
- PHARMFLOW_CURRENT_CHECKPOINT.md
- PHARMFLOW_DECISION_REGISTER.md
- docs/expiry-scan-round1-verification.md

## Verification

| Gate | Result |
|---|---|
| Focused automated | 151 PASS, 0 FAIL, 1 native concurrency SKIP |
| Full automated | 602 PASS, 43 baseline FAIL, 1 SKIP; no new failure names |
| Preview build/syntax/diff | PASS |
| Fresh session / actual save | PASS: zero -> item1/qty1 -> item1/qty3 |
| Actual session Edit/Delete | PASS: qty3 -> qty4 -> qty3; correct individual capture |
| Persisted serial detail | PASS: SN-R1-001/SN-R1-002 remain separate captures |
| Green known / amber review | PASS inspected; unknown draft not saved |
| Inventory regression | PASS focused tests for selection/filter/zero/Resolve/Restore/export; live ACTIVE aggregate3 and original controls |
| Actual rendered 1363×936 | PASS: no document overflow, balanced Scan/form/table/dialogs |
| Rendered ~1366×768 / other sizes | NOT TESTED: fixed cloud Browser viewport, no supported resize API; 768px geometry automated only |
| Physical Handheld/multi-PC | NOT TESTED; no workflow changes |

Seven JPEG captures: empty session (341a0dc before 16px geometry fit), populated session, recognized, needs review, Edit, Delete, and recorded Serial (the remaining six on b86ab286). Screenshot set contains seven files; no fabricated viewport or serial evidence. User-visible source captures are in the delivery ZIP.

Status READY FOR USER TEST at available verified viewport. Exact requested native viewport visual gate remains outstanding; not USER VERIFIED/DONE and not a blanket visual PASS.

## Next decision

Inventory Year → January–December filter, multi-month across years, is approved for a later Inventory round only. Retain Inventory selection and paper checkbox. No Inventory implementation in this round.
