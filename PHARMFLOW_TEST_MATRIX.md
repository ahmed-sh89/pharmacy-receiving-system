# PHARMFLOW TEST MATRIX — 2C.11.3.0

| ID | Test | Expected | Status |
|---|---|---|---|
| REC1 | Receiving known scan | No regression | USER VERIFIED BASELINE |
| EXP1 | Full GS1 medicine | Item/Batch/Expiry/Serial auto | READY FOR TEST |
| EXP2 | Full GS1 date controls | Month/Year disabled; Qty only | READY FOR TEST |
| EXP3 | GTIN-only medicine | Qty + Month dropdown + Year dropdown | READY FOR TEST |
| EXP4 | Month dropdown | 1 Jan through 12 Dec | READY FOR TEST |
| EXP5 | Quantity Enter | Keyboard closes; no focus instability | READY FOR TEST |
| EXP6 | Save | Capture saved; returns READY | READY FOR TEST |
| EXP7 | Clear Screen | UI-only; no saved-data deletion | READY FOR TEST |
| EXP8 | Saved auto-clear | Confirmation clears ~12 sec; unsaved form protected | READY FOR TEST |
| EXP9 | Idle/wake | Scan works after >6 min idle | READY FOR TEST |
| EXP10 | Serial | Actual encoded serial shown/saved when present | READY FOR TEST |
