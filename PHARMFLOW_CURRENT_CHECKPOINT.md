# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.4.3 — Dompy Batch Edge Fix
Status: READY FOR TEST

## PRESERVED / USER VERIFIED
- Consecutive Batch Qty behavior is USER VERIFIED.
- Handheld Undo transaction itself works.
- Handheld Clear Screen is correctly located at the top.
- PC Dompy Expiry parsing is correct.
- More than 10 other Handheld Expiry products parse correctly.
- Receiving / Expiry Auto Clear behavior is preserved.

## EXACT REMAINING GS1 EDGE CASE
Dompy Handheld scan was returning an incomplete Batch while PC returned the
correct pack data.

Physical pack confirms:
- GTIN: 06285128000307
- Batch: CL0117
- Serial: 2073835044260
- Expiry: 10/2028

The Batch itself contains the digits `17`, which are also GS1 AI17 (Expiry).
A separator-loss fallback must therefore never split at the first `17`.

## ROOT FIX
- General GS1/FNC1 parser is unchanged.
- Recovery is used only when the combined AI10 Lot needs separator-loss repair.
- Every possible AI17 candidate is validated.
- Candidate must contain:
  valid YYMMDD expiry + immediately following AI21 + valid Serial length.
- The RIGHTMOST valid AI17 candidate is selected.
- This preserves the longest legitimate Batch prefix, including values such as
  `CL0117`, instead of interpreting the Batch's own `17` as the Expiry AI.

## TEST
1. Handheld Expiry: scan the same Dompy pack.
   Expected:
   Batch CL0117
   Serial 2073835044260
   Expiry 10/2028
2. Scan Conestal.
   Expected: unchanged correct result.
3. Scan one additional previously-correct medicine as regression check.
4. PC Dompy smoke check only; no PC behavior was intentionally changed.

## NO SQL MIGRATION
