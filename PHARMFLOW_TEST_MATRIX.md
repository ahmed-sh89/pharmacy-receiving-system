# PHARMFLOW TEST MATRIX — 2C.11.4.0

| ID | Test | Expected | Status |
|---|---|---|---|
| R-BATCH-PC | PC 3 repeated scans after zero | Batch 1→2→3 | READY FOR TEST |
| R-BATCH-HH | Handheld 3 repeated scans after zero | Batch 1→2→3 | READY FOR TEST |
| R-UNDO-HH | Undo latest own Handheld scan | Received + Batch decrement | READY FOR TEST |
| E-DOMPY-HH | Dompy Expiry on Handheld | Matches PC Batch/Serial/Expiry | READY FOR TEST |
| E-CONESTAL-HH | Conestal Expiry on Handheld | Remains correct | READY FOR TEST |
| REG-SYNC | PC↔Handheld receiving sync | Preserved | READY FOR TEST |
| REG-AC-PC | Receiving PC Auto Clear | Preserved | USER VERIFIED |
| REG-AC-EXP | Expiry PC/HH Auto Clear | Preserved | USER VERIFIED |
