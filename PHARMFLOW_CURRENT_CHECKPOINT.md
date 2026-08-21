# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.4.1 — Consecutive Batch Semantics Fix
Status: READY FOR TEST

## CORRECTION TO 2C.11.4.0
2C.11.4.0 correctly moved Batch Qty away from cloud history, but stored a
separate cumulative local counter per Item Code. That still produced the wrong
business behavior:

Dompy x10 -> Panadol x10 -> Dompy x1
incorrectly displayed Dompy Batch Qty = 11.

## APPROVED BUSINESS LOGIC
Batch Qty = the CURRENT CONSECUTIVE physical batch on this device.

Example:
- Dompy scan x10 -> Batch Qty 10
- switch to Panadol, first scan -> Panadol Batch Qty 1
- Panadol x10 -> Batch Qty 10
- return to Dompy, first scan -> Dompy Batch Qty 1

Received Total remains cumulative/global and synchronized across devices.

## IMPLEMENTATION
- Replaced per-item session map with one active local batch:
  { itemCode, quantity }.
- Positive scan/quantity for a different item starts a new batch.
- Same item continues the current batch.
- Correction/Undo for an older different item does not corrupt the currently
  displayed active batch.
- Correct Received Total closes the active local batch.
- No Supabase/schema change.

## PRESERVED
- PC Receiving Auto Clear.
- Expiry Auto Clear PC + Handheld.
- PC Expiry Dompy parsing.
- Unified Workspace sync.
- Handheld history/Undo recovery code from 2C.11.4.0.

## TEST
1. Correct Dompy total to 0.
2. Scan Dompy 10 times -> Batch Qty 10.
3. Scan Panadol 10 times -> Panadol Batch Qty 10.
4. Scan Dompy once -> Dompy Batch Qty MUST be 1, while Received keeps its cumulative total.
5. Repeat same sequence on Handheld.
