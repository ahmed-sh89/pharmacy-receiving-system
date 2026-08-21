PHARMFLOW 2C.11.4.3 — DOMPY BATCH EDGE FIX

Small targeted patch.
No SQL migration.

Fix:
Do not treat the first `17` inside a Batch as GS1 AI17.
Choose the rightmost structurally valid AI17 + YYMMDD + AI21 boundary.

Expected Dompy:
Batch CL0117
Serial 2073835044260
Expiry 10/2028

RECAPPED COMMIT SUBJECT
Fix Dompy handheld batch parsing
