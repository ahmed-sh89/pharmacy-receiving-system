PHARMFLOW 2C.11.3.9 — CLEAN RECOVERY: PC BATCH COUNTER + GS1 FIELD RECOVERY

Status: READY FOR TEST
No SQL migration.

CHANGED
- PC Receiving Batch Qty restored to the previously verified consecutive local-scan calculation.
- Handheld keeps its worker-batch boundary calculation.
- Shared GS1 parser keeps real FNC1/GS as authoritative and adds conservative recovery when scanner/browser loses separators:
  AI10 Batch -> AI21 Serial -> AI17 Expiry.
- Existing 30-second Auto Clear fixes retained.
- Existing blue Confirm Correct Total retained.
- Typography changes retained.

TEST
1. PC Receiving: scan same item 3 times -> Batch Qty 1,2,3 and Received increments each scan.
2. PC Expiry: same medicine -> exact Batch, Serial, Expiry.
3. Handheld Expiry: same medicine -> exact Batch, Serial, Expiry.
4. Reconfirm PC Receiving and PC/Handheld Expiry Auto Clear after 30 sec.
5. Quick PC↔Handheld receiving sync regression.

RECAPPED COMMIT SUBJECT
Recover batch counter and GS1 fields

EXTENDED DESCRIPTION
Restore verified PC consecutive-scan Batch Qty behavior while preserving Handheld worker-batch behavior. Harden shared GS1 parsing for separator-loss paths without changing receiving synchronization, cloud persistence, expiry history, or database schema.
