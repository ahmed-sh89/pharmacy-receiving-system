PharmFlow Phase 2C.5.3
- Archive shows real uploaded Order Number instead of internal ORD-* ID.
- Adds Order Date and Received Date columns.
- Adds protected Delete Order action for single-order archive records.
- Delete requires Admin + confirmation + typing Order Number + final confirmation.
- Uses the delete_pharmflow_order_complete RPC already installed with Phase 2C.5.1 SQL.
- Global GTIN Master, Returns Archive, users, and other orders are not touched.
- Cleans duplicate placeholder entries from Item Transfer order selector.

Replace:
index.html
css/dashboard.css
js/ui.js
js/session.js
js/reports.js

No new SQL is required if PHASE2C51_DELETE_SINGLE_ORDER.sql was already run.
