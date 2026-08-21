# PHARMFLOW TEST MATRIX — 2C.11.1.9

| ID | Test | Expected | Status |
|---|---|---|---|
| UW1 | Direct Handheld Receiving | No pairing | USER VERIFIED |
| SYNC1 | PC↔Handheld live sync | Automatic | USER VERIFIED |
| IDLE1 | Idle then scan | Works without reload | USER VERIFIED |
| ACK1 | First physical scan | `SCANNED +1 · PACK SAVED` visible | READY FOR TEST |
| ADD1 | 10 physical packs | Scan 1 + enter remaining 9 = local batch 10 | READY FOR TEST |
| DEV1 | Handheld Recent | No raw device UUID | READY FOR TEST |
| DEV2 | PC activity/history | Friendly device label, no raw UUID | READY FOR TEST |
| REG1 | Sync after manual add | Shared totals remain correct | READY FOR TEST |
