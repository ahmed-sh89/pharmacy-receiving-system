PHARMFLOW — PHASE 2C.5 ITEM TRANSFER REPORT

Purpose
- Official Item Transfer is available only for Received/finalized orders.
- It reads ONLY the immutable original uploaded-order snapshot saved in Phase 2C.2.
- Physical receiving/scanning quantities are never used as a fallback.
- Order date and warehouse/source metadata come from the registered uploaded order.

Files to replace
- index.html
- js/reports.js
- css/dashboard.css

No SQL is required for this phase.

Test
1. Open Reports.
2. Under Item Transfer Report choose a Received order.
3. Load Report.
4. Verify Transfer Qty equals the ORIGINAL uploaded order quantity, regardless of actual receiving counts.
5. Export Excel and PDF.
6. An Uploaded/non-finalized order must not be offered in the selector.

If an older Received order has no original source snapshot, PharmFlow will refuse to generate Item Transfer rather than substitute receiving quantities.
