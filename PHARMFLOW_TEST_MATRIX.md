# PHARMFLOW_TEST_MATRIX

| Test | Expected | Status |
|---|---|---|
| PC known GTIN in Order | Normal +1 | READY FOR TEST |
| Handheld same item / All Orders | Normal +1 | READY FOR TEST |
| PC search Item Code/Name | Uploaded item shown | READY FOR TEST |
| Needs Review search | Uploaded item shown/linkable | READY FOR TEST |
| Known Master not in Order | Add & Receive Extra | READY FOR TEST |
| Reset once | Zero state, queue/session cleared | READY FOR TEST |
| Historical delete | Visible verified receipt | READY FOR TEST |
| Expiry GS1 | Auto batch/expiry, Qty only | READY FOR TEST |
| Expiry GTIN-only | Qty + Month + Year | READY FOR TEST |


PHASE 2C.10.5.5 FOCUSED RUNTIME REGRESSION
- R-1055-01 PC known GTIN in uploaded Order — READY FOR TEST
- R-1055-02 Handheld known GTIN in connected All Orders session — READY FOR TEST
- R-1055-03 Known Global Master / not in Order direct Add & Receive — READY FOR TEST
- R-1055-04 Unknown GTIN autosave/photo/qty → PC Needs Review — READY FOR TEST
- R-1055-05 Needs Review uploaded-order name/code search — READY FOR TEST
- R-1055-06 Reset once → zero operational state + inactive session — READY FOR TEST
- R-1055-07 Historical Delete visible server receipt — READY FOR TEST
- R-1055-08 Global GTIN persistence regression — READY FOR TEST
