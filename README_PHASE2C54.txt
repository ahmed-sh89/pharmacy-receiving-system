PharmFlow Phase 2C.5.4 — Dashboard & Orders UI Cleanup

Files to replace:
- index.html
- css/dashboard.css
- js/ui.js

No SQL.

Scope:
- Removes the large Welcome/Pharmacy hero from the PC Dashboard.
- Adds a compact Current Receiving context bar with active Order Number, file count and item count.
- Keeps Scan GS1 / Barcode as the first primary operational panel.
- Renames Orders & Mappings to Orders in the visible navigation/page language.
- Simplifies the Orders page and clarifies that Global GTIN Master is automatic.
- Renames import health metrics to operational terms: Items Loaded, GTIN Matched, Missing GTIN, GTIN Conflicts.
- No database, receiving, report, archive, session or handheld logic changes.
