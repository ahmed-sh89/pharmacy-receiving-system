PHARMFLOW PHASE 2C.3 — RECEIVING SUMMARY

No SQL is required for this phase.
Replace these GitHub files:
- index.html
- js/reports.js
- js/ui.js
- css/dashboard.css

Commit:
Phase 2C.3 - add receiving verification summary exports

Test:
1) Hard refresh and sign in.
2) Open an uploaded order and scan several items with deliberately mixed quantities.
3) Open Receiving.
4) Verify Total / Fully Received / Short / Over / Not Received and unit totals.
5) Export Excel and PDF.

IMPORTANT:
This summary is operational receiving verification only.
It does not modify the immutable uploaded order source and is not the source for Item Transfer/business reports.
