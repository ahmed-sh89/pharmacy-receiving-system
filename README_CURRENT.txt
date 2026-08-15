PharmFlow Phase 2C.9.6.2 — Needs Review PC Context + Expiry Field Alignment

Fixes:
- PC Needs Review now reads pharmacy_id from the same AuthState.context source used successfully by Near Expiry workers/capture.
- REVIEW counter refreshes when Near Expiry opens.
- Review Resolve/Delete also use the corrected pharmacy context.
- No additional SQL is required beyond PHASE2C96_UNIFIED_NEEDS_REVIEW.sql.

Handheld Near Expiry:
- Quantity, Month and Year now have matching height, border radius and visual weight.
- Quantity value is centered horizontally and vertically.
- Number spinner controls are hidden on Zebra.
- Helper spacing is balanced so all three boxes align cleanly.

Use the same PHASE2C96_UNIFIED_NEEDS_REVIEW.sql already included in the 2C.9.6 family.
