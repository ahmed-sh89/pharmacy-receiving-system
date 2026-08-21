# PHARMFLOW MASTER SPEC — EXPIRY CURRENT OVERRIDE

Updated: 21 August 2026

## Handheld Expiry Capture
- Handheld-first professional compact UI.
- Worker selection is one compact row and remembered per device.
- Full medicine GS1/2D automatically extracts available GTIN, Batch/Lot, Expiry and Serial.
- When expiry is encoded, worker enters Quantity only then Save.
- GTIN-only uses Quantity + Month dropdown (1 Jan–12 Dec) + Year dropdown.
- Quantity numeric keyboard MUST NOT open automatically after scan; only intentional tap may open it.
- Manual CLEAR SCREEN is visible and UI-only.
- After successful Save, visual saved state auto-clears after 30 seconds of inactivity on PC and Handheld.
- Auto Clear never deletes saved records and never discards an active unsaved/editing form.
- Operational history is recent/scoped, not a replacement for Reports.
- History can distinguish HANDHELD / PC / ALL DEVICES and Today / 7 Days / All History.
- Full historical reporting is handled by Expiry Reports.
