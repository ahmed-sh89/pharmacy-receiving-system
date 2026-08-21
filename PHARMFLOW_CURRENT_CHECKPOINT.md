# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.4.3 — PC Parser Restore + Handheld Batch Edge Fix
Status: READY FOR TEST

## CRITICAL REGRESSION
After 2C.11.4.2, PC Expiry began resolving item/GTIN but Batch, Serial and Expiry
were blank for medicines. Before that change PC Dompy was explicitly verified:
Batch CL0117, Serial 2073835044260, Expiry October 2028.

## ROOT RECOVERY — PC
- scanner.js is restored byte-for-byte to the 2C.11.4.1 version.
- No new global GS1 parser logic is applied.
- PC Expiry parser path is therefore returned to the last user-verified working baseline.

## HANDHELD-ONLY DOMPY EDGE FIX
Observed on the same pack:
- printed Batch = CL0117
- Handheld parsed Batch = 11
- Serial and Expiry were already correct.

Cause:
Batch contains digits `17`, which can be confused with GS1 AI17 when Zebra strips
the FNC1 following AI10.

Fix:
- no global parser change;
- Handheld-only post-parse recovery;
- work from the RIGHT side using exact parsed Serial (AI21);
- locate the LAST structurally valid AI17 YYMMDD before that serial;
- recover the complete AI10 Batch up to that boundary.
This preserves embedded `17` inside Batch, including CL0117.

## PRESERVED USER VERIFIED
- Consecutive Batch Qty semantics.
- Undo quantity execution.
- Clear Screen top location.
- Receiving/Expiry Auto Clear.
- Confirm Correct Total blue.
- Conestal and >10 known-good Handheld medicine scans.

## TEST
1. PC Expiry: scan any known medicine (Conestal or Dompy).
   Batch + Serial + Expiry must be populated again.
2. PC Dompy must show:
   Batch CL0117 / Serial 2073835044260 / Expiry Oct 2028.
3. Handheld Dompy must show the same exact values.
4. Handheld Conestal must remain:
   Batch 240276 / Serial KY5X4W2MWOQK / Expiry Nov 2026.
5. No Receiving regression testing beyond a quick smoke scan.
