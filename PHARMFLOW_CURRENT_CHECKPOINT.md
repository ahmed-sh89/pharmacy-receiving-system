# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.4.4 — Unified GS1 Right-Side Recovery
Status: READY FOR TEST

## WHY THIS RELEASE
2C.11.4.3 did not restore PC medicine Batch/Serial/Expiry. PC could resolve
Item/GTIN but fields remained blank. Meanwhile Handheld Dompy still truncated
Batch CL0117 to 11.

The previous approach had separate/global plus Handheld-specific recovery paths.
That made the parser difficult to reason about.

## ROOT FIX
There is now ONE separator-loss recovery inside scanner.js for both PC and
Handheld.

Normal GS/FNC1 parsing remains authoritative.

Fallback runs only if the normal parse has GTIN but one or more medicine fields
are incomplete.

It parses from the RIGHT side so Batch values containing digits `17` are safe:
- AI10 Batch -> AI17 Expiry -> AI21 Serial
- AI10 Batch -> AI21 Serial -> AI17 Expiry

For 10->17->21 it uses the LAST structurally valid AI17 date before AI21,
not the first occurrence of digits `17`.

## EXPECTED KNOWN CASES
Dompy:
- GTIN 06285128000307
- Batch CL0117
- Serial 2073835044260
- Expiry Oct 2028

Conestal:
- GTIN 06286059000510
- Batch 240276
- Serial KY5X4W2MWOQK
- Expiry Nov 2026

## REMOVED
- Handheld-specific Batch post-processing from expiry.js.
- Product-specific logic remains prohibited.

## PRESERVED
- Consecutive Batch Qty: USER VERIFIED.
- Handheld Clear Screen top position: USER VERIFIED.
- Undo quantity execution: USER VERIFIED.
- Auto Clear behavior.
- No Receiving logic change.
- No SQL migration.

## TEST
1. PC Conestal -> all four GS1 fields populated.
2. PC Dompy -> CL0117 / 2073835044260 / Oct 2028.
3. Handheld Conestal -> unchanged correct values.
4. Handheld Dompy -> CL0117 / 2073835044260 / Oct 2028.
5. One additional known-good medicine on each device.
