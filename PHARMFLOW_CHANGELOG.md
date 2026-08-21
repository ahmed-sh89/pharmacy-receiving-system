# PHARMFLOW CHANGELOG — 2C.11.3.0

- Implemented approved Handheld Expiry capture workflow.
- Full medicine GS1/2D auto-populates encoded Batch, Expiry and Serial.
- Full GS1 requires worker Quantity only; date fields are locked to encoded expiry.
- GTIN-only uses Quantity + Month dropdown (1 Jan–12 Dec) + Year dropdown.
- Removed automatic numeric keyboard after Expiry scan.
- Added manual Expiry CLEAR SCREEN.
- Added safe saved-confirmation auto-clear after 12 seconds without clearing unsaved work.
- Display actual Serial when available.
- Preserved existing Expiry worker selection and capture RPCs.
- Preserved verified Receiving architecture.
- No SQL migration.
