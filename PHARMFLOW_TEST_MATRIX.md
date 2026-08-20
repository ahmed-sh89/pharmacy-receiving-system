# PharmFlow Test Matrix — 2C.10.7.0

| ID | Test | Expected | Status |
|---|---|---|---|
| H1 | Known GS1 Receiving x3 | Correct item, +1 each, no freeze | READY FOR TEST |
| H2 | Same GS1 Expiry | Correct item; batch/expiry auto; Qty only | READY FOR TEST |
| H3 | PC Disconnect | Handheld auto exits session | READY FOR TEST |
| H4 | PC Sign Out during session | Server session ends; Handheld exits | READY FOR TEST |
| H5 | Unknown GTIN | Needs Review flow; no silent loss | READY FOR TEST |
| H6 | Known GTIN not in order | Known extra / Add & Receive path | READY FOR TEST |
| L1 | Finalize | Archive saved; current counters zero; No Active Order | READY FOR TEST |
| L2 | Delete Historical | Visible receipt; archive/report history gone | READY FOR TEST |
| L3 | Delete Historical boundaries | Global GTIN/Returns/Expiry Workers preserved | READY FOR TEST |
| NR24 | PC search name/code | Searches uploaded orders | USER VERIFIED |
