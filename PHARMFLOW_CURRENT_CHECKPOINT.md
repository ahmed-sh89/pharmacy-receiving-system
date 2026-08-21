# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.3.0 — Handheld Expiry Workflow
Status: READY FOR TEST

## USER VERIFIED / PROTECTED
- 2C.11.1.9 Receiving baseline is USER VERIFIED / DONE.
- Unified Pharmacy Workspace direct Handheld Receiving.
- PC↔Handheld live synchronization.
- Receiving high-volume quantity tests.
- Handheld idle/wake recovery.
- Receiving quantity flow and friendly device labels.

Receiving files are carried forward unchanged in behavior and are non-regression protected.

## EXPIRY BUSINESS RULES IMPLEMENTED
### Medicine GS1 / QR / 2D
- Shared GS1 parser extracts available GTIN, Batch/Lot, Expiry and Serial.
- Global GTIN resolves Item identity/category.
- Batch, Expiry and Serial display automatically.
- Month/Year controls become read-only/disabled when expiry was encoded.
- Worker enters Quantity only and presses SAVE & NEXT.
- Numeric keyboard is NOT opened automatically after scan.

### GTIN-only barcode
- Item resolves from Global GTIN.
- Worker enters Quantity.
- Worker selects Month from dropdown `1 · Jan` through `12 · Dec`.
- Worker selects Year from dropdown.
- Manual free typing of expiry month/year is not required.

### Unknown item
- Available raw GS1 details (Batch/Expiry/Serial) remain visible when encoded.
- No automatic numeric keyboard.
- Existing Needs Review save path remains available.
- Dedicated photo/advanced Unknown Expiry review remains planned with Needs Review lifecycle; this core does not alter storage schema.

## CLEAR SCREEN
- Manual `CLEAR SCREEN` is available in Expiry.
- It clears only the current visual/unsaved form and returns scanner to READY.
- It never deletes a saved expiry record or changes saved quantity/history.
- Saved confirmation automatically clears after 12 seconds.
- Auto-clear NEVER discards an unsaved active item or steals focus while worker is editing.

## SERIAL
- Actual Serial value is shown when present (not only `Detected`).
- Existing expiry capture RPC continues storing sample_serial.

## DATABASE
No SQL migration. Existing Expiry worker and capture RPC/schema are reused.

## EXACT TEST
1. Select worker.
2. Scan a medicine GS1/2D containing expiry/batch.
   Expected: item + batch + actual serial (if encoded) + expiry auto-filled; Month/Year disabled; Qty=1.
3. Tap Qty only if needed, enter total quantity, Enter closes keyboard, then Save.
4. After Save: screen returns READY; saved confirmation disappears automatically after ~12 seconds.
5. Scan GTIN-only barcode.
   Expected: Item resolved; Month/Year enabled; dropdown Month shows `1 · Jan` ... `12 · Dec`; Year dropdown available.
6. CLEAR SCREEN before Save.
   Expected: current visual form clears; no saved capture is created/deleted.
7. Leave Expiry idle >6 minutes and scan again.
   Expected: scanner still works due shared verified idle/wake runtime.
8. Quick regression: Receiving known scan still works.
