# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.3.10 — Focused Receiving + Expiry Fix
Status: READY FOR TEST

## USER VERIFIED / PRESERVED
- Receiving PC Auto Clear after 30 seconds.
- Expiry Auto Clear after 30 seconds on PC and Handheld.
- Confirm Correct Total button blue.
- Expiry item recognition.
- Unified Receiving synchronization baseline.

## FIX — CURRENT BATCH QUANTITY
Observed current device batch was one transaction behind:
Received 1 / Batch 0, then Received 3 / Batch 1, etc.

Root fix:
- compute current device batch from receiving history;
- if Last Scan transaction has not hydrated into history yet, add its delta exactly once;
- once the same transaction is present in history it is not added again.
Expected after reset-to-zero: 1 -> 2 -> 3 with each scan.

## FIX — HANDHELD EXPIRY CLEAR SCREEN
- Handheld Clear Screen moved to the top title position replacing `Capture`.
- Lower Clear Screen beside SAVE & NEXT hidden on Handheld.
- PC layout remains unchanged.
- Clear is UI-only.

## FIX — DOMPY HANDHELD GS1
- Normal FNC1 parser remains authoritative.
- Added normalization for ASCII FS/RS/US controls that can appear from Zebra/DataWedge.
- Added conservative fallback for structurally valid separator-lost medicine sequences:
  AI01 + AI10 + AI17 + AI21
  AI01 + AI10 + AI21 + AI17
- Correctly parsed Conestal path remains unchanged.

## TEST
1. Receiving PC: after zero, scan same item 3 times -> Batch Qty 1,2,3.
2. Receiving Handheld: same -> local worker batch 1,2,3.
3. Handheld Expiry: Clear Screen appears at top, no lower Clear beside Save.
4. Conestal Handheld remains correct.
5. Dompy Handheld Batch/Serial/Expiry matches the same pack on PC.
6. Reconfirm Auto Clear regressions.
