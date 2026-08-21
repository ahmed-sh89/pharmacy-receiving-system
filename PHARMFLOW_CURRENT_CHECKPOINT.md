# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.1.3 — Handheld Local Qty + PC Preserve
Status: READY FOR TEST

## USER VERIFIED / PROTECTED
- 2C.11.0 Unified Pharmacy Workspace is USER VERIFIED.
- Handheld enters Receiving without pairing.
- Known scans work on PC and Handheld.
- PC↔Handheld synchronization works.

## APPROVED QUANTITY MODEL
PC:
- Preserve existing PC Last Scan design and behavior. Handheld UX work must not remove or redesign it.

Handheld:
- Large editable number = quantity physically handled in the CURRENT LOCAL HANDHELD BATCH for the current item.
- Example: PC1=20, PC2=30, Handheld worker scans one pack then enters 9 additional packs. Local Handheld Qty becomes 10.
- Compact row below displays Ordered / Total Received across all devices / Remaining.
- In the example: Ordered 100 / Total Received 60 / Remaining 40.
- Tapping local quantity asks for ADDITIONAL packs, not shared-total replacement.
- Enter closes numeric keyboard and adds the entered packs.

## QUICK +/- FEEDBACK
- +/- on PC and Handheld no longer creates a large green success toast.
- Existing small green visual confirmation remains.

## OTHER 2C.11.1.2 BEHAVIOR PRESERVED
- Known Item Not in Order: no auto keyboard; Cancel Scan available.
- Unknown/GTIN mismatch: no auto keyboard; Cancel Scan discards accidental review draft/photo.
- Recent: THIS HANDHELD default with Undo; ALL DEVICES view-only.

## TEST
1. PC Last Scan must remain visible and unchanged.
2. Handheld: scan known item once => local quantity 1.
3. Enter 9 additional packs and press Enter => keyboard closes; local quantity 10.
4. If PC1 had 20 and PC2 had 30, compact row must show Total Received 60 when Handheld local reaches 10.
5. +/- must update quantity with only subtle green feedback and no large success toast.
6. PC↔Handheld synchronization must remain correct.
