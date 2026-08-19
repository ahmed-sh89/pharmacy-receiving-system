PHARMFLOW PHASE 2C.10.5.3 — RECEIVING LIFECYCLE ROOT FIX
STATUS: READY FOR TEST

ROOT FIXES
- Known Global Master item not in Order: PC uses known Item Code/Name; no manual re-entry. ADD & RECEIVE; if multiple selected Orders, pharmacist selects Target Order.
- Needs Review: stable centered desktop workspace; known hints prefill unordered fields.
- Review photo: click thumbnail to open full-size viewer on PC.
- Review photos are temporary evidence: removed on resolution/delete and Receiving Finalize.
- Reset Current Workspace now atomically clears pending RECEIVING Needs Review + its Storage photos in the same server transaction as active workspace reset.
- No Active Order hard-gates dashboard counters to zero and Session UI to INACTIVE, preventing stale local statistics from rendering.
- Existing server-verified Historical Delete success/error receipt remains preserved.

SQL REQUIRED
Run once: PHASE2C1053_RECEIVING_LIFECYCLE_ROOT_FIX.sql

FILES CHANGED
- js/receiving.js
- js/needs-review.js
- js/ui.js
- js/orders.js
- js/app.js
- js/config.js
- css/dashboard.css
- index.html
- PHASE2C1053_RECEIVING_LIFECYCLE_ROOT_FIX.sql

NON-REGRESSION
- Global GTIN Master is never deleted by Reset/Finalize cleanup.
- Historical Data and Returns Archive are untouched by Reset cleanup.
- Receiving report quantities remain based on uploaded Order business data.
- Shared receiving ledger / Active Order Manifest architecture is preserved.
- Unknown GTIN remains Needs Review and cannot silently receive against an order.
