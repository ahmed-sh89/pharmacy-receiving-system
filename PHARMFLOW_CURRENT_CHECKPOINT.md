# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.3.9 — Clean Recovery: PC Batch Counter + GS1 Field Recovery
Status: READY FOR TEST

## USER VERIFIED FROM 2C.11.3.8
- Receiving PC Auto Clear after 30 seconds: USER VERIFIED / DONE.
- Expiry PC Auto Clear after 30 seconds: USER VERIFIED / DONE.
- Expiry Handheld Auto Clear after 30 seconds: USER VERIFIED / DONE.
- Correct Received Total Confirm button blue: USER VERIFIED / DONE.

## FAILED IN 2C.11.3.8
- PC Batch Qty stayed at 1 while Received continued 1 -> 2 -> ...
- Expiry Batch/Serial extraction incorrect on PC.
- Expiry Batch/Serial extraction incorrect on Handheld.

## 2C.11.3.9 ROOT FIX
- PC Batch Qty now uses the earlier verified consecutive local-device transaction calculation.
- Handheld keeps the newer worker-batch boundary behavior; PC and Handheld are intentionally separated here.
- Shared GS1 parser keeps real FNC1/GS separators authoritative.
- Adds conservative recovery for scanner/browser separator loss using the common medicine sequence AI10 Batch -> AI21 Serial -> AI17 Expiry, with AI17 accepted only when YYMMDD is plausible.
- Cache version for ui.js/scanner.js advanced to 2C1139.

## PRESERVED / NON-REGRESSION
- Typography enlargement retained.
- Receiving PC 30s Auto Clear retained.
- Expiry PC/Handheld 30s Auto Clear retained.
- Blue Confirm Correct Total retained.
- Receiving synchronization architecture unchanged.
- Supabase/cloud persistence unchanged.
- Global GTIN, Orders, Reports, Archive and deletion boundaries unchanged.
- No SQL migration.

## EXACT NEXT TEST
1. PC Receiving: scan same item three times. Batch Qty must show 1 -> 2 -> 3 and Received must increment each scan.
2. PC Expiry: scan known medicine and compare Batch, Serial and Expiry to the package.
3. Handheld Expiry: same exact test.
4. Quick regression: Auto Clear remains 30 seconds and PC↔Handheld receiving sync remains correct.
