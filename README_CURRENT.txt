PharmFlow Phase 2C.9.1 — Handheld Near Expiry Final

Handheld now has two worker jobs:
1. Receive Order
2. Near Expiry

Near Expiry:
- Worker is selected once per device (Captured By) and remembered.
- Flow: Scan -> Item -> Qty -> Month -> Year -> Save & Next.
- Month is numeric; e.g. 08 displays August.
- Item Code, Item Name, GTIN and Category are read from Global GTIN.
- Captured By and Captured At are stored with every expiry record.
- Last saved item is shown briefly for confirmation.
- Expiry scan works independently of a PC receiving session.

Settings:
- Pharmacy Admin can add or disable Near Expiry worker names.
- Disabling a worker does not delete historical expiry records.

Database:
Run PHASE2C91_HANDHELD_EXPIRY_CAPTURE.sql once in Supabase before testing Near Expiry.

Receiving / Multiple GTIN / Cloud / Multi-PC arithmetic was not changed.
