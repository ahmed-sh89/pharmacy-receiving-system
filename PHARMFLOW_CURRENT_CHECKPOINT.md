# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.4.2 — Handheld Final Recovery
Status: READY FOR TEST

## USER VERIFIED / PRESERVED
- Consecutive Batch Qty semantics fixed in 2C.11.4.1.
- PC Receiving current behavior is protected.
- PC Dompy Expiry parsing is correct.
- More than 10 tested Handheld Expiry products parse correctly.
- Receiving/Expiry Auto Clear verified.
- Confirm Correct Total blue verified.

## HANDHELD UNDO UX
Undo transaction execution already works. The defect was UI feedback:
the Recent list appeared frozen and toast was hidden behind the modal.
Fix:
- Undo button changes immediately to UNDONE -N.
- Inline feedback inside Recent says N pack(s) undone.
- Recent panel refreshes without requiring close/reopen.
- Existing audit-safe SCAN_UNDO transaction behavior is unchanged.

## HANDHELD EXPIRY CLEAR SCREEN
- Removed the lower Clear Screen button from the HTML DOM entirely.
- The only Expiry Clear Screen is the top action replacing Capture.
- This avoids accidental tapping near SAVE & NEXT.

## DOMPY HANDHELD EDGE CASE
- General GS1 parser is NOT changed.
- PC Dompy path is protected.
- Conestal and the >10 correctly parsed Handheld products are protected.
- Recovery activates only if AI10 Lot itself contains a complete valid
  AI17 YYMMDD + AI21 Serial sequence, which matches the observed Zebra
  separator-loss edge case.

## TEST
1. Handheld Recent: Undo one +1 scan -> button/inline feedback immediately says 1 pack undone.
2. Undo a multi-pack transaction if available -> exact N shown.
3. Handheld Expiry: only one CLEAR SCREEN at top; none above/below SAVE.
4. Dompy Handheld: Batch/Serial/Expiry match PC.
5. Conestal plus one other known-good item remain correct.
6. No PC regression test beyond a quick smoke check.
