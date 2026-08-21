# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.4.0 — Regression Recovery
Status: READY FOR TEST

## BASIS
Built directly from the Product Owner supplied current GitHub/main ZIP.
This is a regression-recovery release, not another history-derived Batch Qty patch.

## PRESERVED USER VERIFIED BEHAVIOR
- Unified Workspace: no Handheld Create/Join Session.
- PC ↔ Handheld receiving synchronization baseline.
- Receiving PC Auto Clear after 30 seconds.
- Expiry PC + Handheld Auto Clear after 30 seconds.
- Confirm Correct Total blue.
- Dompy Expiry parsing on PC is working and is protected.
- Conestal Expiry parsing is working and is protected.

## ROOT CAUSE — BATCH QTY
Later releases derived Current Batch Qty from cloud receivingHistory.
That made an operational UI counter depend on asynchronous history hydration,
causing zero/stale/one-scan-behind values.

## FIX — LOCAL RUNTIME BATCH
- Current Batch Qty is now a local runtime counter per browser/device and item.
- Every successful local receiving transaction changes it immediately.
- Scanner +1 therefore displays 1,2,3... without waiting for Supabase/history.
- Handheld ADD REMAINING updates the same local counter.
- Quick +/- and Undo apply their signed quantity.
- Correct Received Total establishes a new baseline and resets the local batch.
- Shared Received remains server/workspace synchronized and independent.
- No database/schema change.

## ROOT CAUSE — HANDHELD UNDO
Recent Scans is rendered from workspace receivingHistory, but Undo previously
looked only in ReceivingEngine.recentScans, an in-memory list lost on reload/sync.

## FIX — HANDHELD UNDO
- Undo first uses local recentScans.
- If missing, it reconstructs the exact scanner transaction from authoritative
  receivingHistory.
- It refuses to undo another device's transaction.
- Correction remains audit-safe through SCAN_UNDO; history is not deleted.

## FIX — DOMPY HANDHELD GS1
PC already parses the same Dompy pack correctly.
Handheld can receive the GS1 tail as one AI10 Lot string when FNC1 is stripped.
A conservative recovery now splits a combined Lot only when it contains:
- a structurally plausible AI17 YYMMDD expiry, and
- AI21 serial.
Normal FNC1 parsing remains primary, protecting PC and Conestal.

## EXACT TEST
1. PC Receiving: Correct Total to zero, then scan same item 3 times.
   Expected Batch Qty: 1 -> 2 -> 3; Received: 1 -> 2 -> 3.
2. Handheld Receiving: same repeated-scan test.
3. Handheld Recent Scans: Undo latest own scan.
   Expected Received and local Batch both decrease by that scan quantity.
4. Handheld Expiry Dompy: Batch/Serial/Expiry must match the already-correct PC read.
5. Handheld Expiry Conestal: must remain correct.
6. Reconfirm Auto Clear only as a quick regression check.

## NO SQL MIGRATION
