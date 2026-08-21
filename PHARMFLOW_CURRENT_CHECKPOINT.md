# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.3.7 — Expiry Auto Clear + PC Clear Layout
Status: READY FOR TEST

## INCLUDED BASE
This package includes the pending 2C.11.3.6 shared GS1 parser root fix and
RECENT label correction. Do not deploy 2C.11.3.6 separately.

## FIXES
- Expiry untouched scanned item now auto-clears after 30 seconds on PC and Handheld.
- If worker intentionally touches Quantity / Month / Year, auto-clear is cancelled
  so unsaved work is protected.
- Manual CLEAR SCREEN remains UI-only.
- Saved-state 30-second cleanup remains.
- PC Receiving now shows one Clear Screen only, positioned below Last Scan metrics.
- Handheld-specific Receiving Clear Screen is hidden on PC.
- Shared GS1 Batch/Serial/Expiry parser fix from 2C.11.3.6 is included.
- RECENT label on PC and Handheld is included.
- Receiving quantity/sync logic is unchanged.

## TEST
1. PC Receiving: exactly one CLEAR SCREEN, below metrics, no overlap.
2. Expiry PC: scan item and do nothing for 30 seconds -> visual item clears to READY.
3. Expiry Handheld: same 30-second untouched test.
4. Scan again and touch Quantity before 30 sec -> must NOT auto-clear.
5. Same medicine 2D on PC and Handheld -> Batch, Serial, Expiry correct.
6. PC + Handheld show RECENT.
7. Quick Receiving scan regression.
