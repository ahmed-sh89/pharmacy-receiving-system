PHARMFLOW PHASE 2C.9.7

1. Run PHASE2C97_SMART_EXPIRY_GS1.sql once in Supabase SQL Editor.
2. Upload the project files to the repository root.

Changes:
- QR session URL joins directly; no second Join click.
- Join flow has bounded timeouts and returns to Modes on failure instead of hanging.
- Expiry Needs Review searches Global Master, not Current Order.
- Linking adds the new GTIN as a pharmacy-learned alternate GTIN and resolves the pending expiry record.
- Near Expiry GS1 scan auto-reads AI 17 expiry, AI 10 batch and AI 21 serial.
- One representative serialized pack can be scanned; worker enters total quantity for the same Batch/Expiry group.
- Sample serial is stored only as the scanned representative serial, not as the serial for every unit.
