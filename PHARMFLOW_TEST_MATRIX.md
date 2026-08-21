# PHARMFLOW TEST MATRIX — 2C.11.1.2

| ID | Test | Expected | Status |
|---|---|---|---|
| UW1 | Direct Handheld Receiving | No pairing/session code | USER VERIFIED |
| UW4 | Known scan | Correct item +1 | USER VERIFIED |
| UW5 | PC↔Handheld sync | Shared quantities sync | USER VERIFIED |
| Q1 | Large Handheld number | Equals shared Received | READY FOR TEST |
| Q2 | Manual total + Enter | Keyboard closes; shared total becomes entered value | READY FOR TEST |
| EX1 | Known Extra | No auto keyboard; Cancel returns READY | READY FOR TEST |
| EX2 | Unknown GTIN | No auto keyboard; Cancel discards pending draft | READY FOR TEST |
| H1 | Recent default | THIS HANDHELD | READY FOR TEST |
| H2 | All Devices | View-only cross-device history | READY FOR TEST |
| PC1 | PC Last Scan | Persistent card hidden | READY FOR TEST |
