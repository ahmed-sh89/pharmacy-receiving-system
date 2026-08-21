# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.3.8 — Receiving PC + Expiry GS1/Layout Root Fix
Status: READY FOR TEST

## USER-REPORTED ISSUES FROM 2C.11.3.7
1. Handheld Expiry layout again required scrolling.
2. Expiry Batch extraction remained incorrect.
3. PC Expiry Batch and Serial extraction were incorrect, although Expiry Auto Clear worked.
4. PC Receiving did not Auto Clear.
5. PC Receiving should use the older Batch Qty presentation; `SCANNED +1` is Handheld-only.
6. `Confirm Correct Total` should return to blue.
7. First PC scan showed Received=1 but Batch Qty=0.

## ROOT FIX — GS1 DATA INTEGRITY
The parser previously guessed an implicit AI 17 boundary inside variable-length
Batch/Serial data. This can corrupt a legitimate Batch containing the digits
`17` by treating those batch characters as the Expiry AI.

New rule:
- AI 10 Batch and AI 21 Serial terminate only at real normalized FNC1/GS or their maximum length.
- No AI17 guessing inside Batch/Serial.
- Parenthesized GS1 remains explicitly AI-parsed.
This shared parser is used by PC and Handheld Expiry.

## ROOT FIX — PC RECEIVING BATCH QTY
- PC uses legacy Batch Qty presentation.
- `SCANNED +1 · PACK SAVED`, Last Action and All Devices context are hidden on PC.
- They remain available on Handheld.
- If Received has already incremented but history hydration is one render behind,
  PC Batch Qty uses the successful Last Scan delta so the first scan displays 1,
  not 0.
- Quantity adjustment modal uses the same PC batch calculation.

## PC RECEIVING AUTO CLEAR
- Last Scan visual state Auto Clears after 30 seconds on PC.
- Does not change Received, history or Supabase.
- Does not clear while Quantity adjustment modal is open.
- Handheld Receiving behavior is unchanged.

## UI
- Handheld Expiry vertical layout compressed back to one-screen operational density.
- Save/Clear controls no longer use sticky positioning that covers content.
- Confirm Correct Total restored to blue.
- Expiry Auto Clear from 2C.11.3.7 retained.

## NON-REGRESSION
- Receiving sync architecture unchanged.
- Handheld Receiving Scan + local worker quantity unchanged.
- Expiry history/deletion rules unchanged.
- No SQL migration.

## EXACT TEST
1. Same medicine 2D on PC + Handheld:
   verify exact Batch, exact Serial and Expiry.
2. Handheld Expiry normal capture should fit without routine scrolling.
3. PC Receiving first scan:
   Received=1 AND Batch Qty=1 immediately.
4. PC must NOT show green `SCANNED +1` acknowledgement.
5. Leave PC Receiving Last Scan untouched for 30 seconds:
   card clears visually; Received remains unchanged.
6. Open Quantity correction:
   Confirm Correct Total is blue.
7. Quick PC↔Handheld receiving sync regression.
