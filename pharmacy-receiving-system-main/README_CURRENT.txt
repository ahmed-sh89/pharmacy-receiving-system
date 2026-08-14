PHARMFLOW — CURRENT PROJECT REFERENCE

Current UI identity:
- Light Latte global background.
- Warm Porcelain authentication card.
- Copper/Brown primary accent instead of blue.
- Sidebar text 14px / bold 700 for readability.
- Session number/ID is hidden from normal user-facing UI; only session status is shown.

Current functional baseline:
- Multi-PC cloud workspace / receiving remains enabled.
- Multiple GTIN per item / safe pharmacy GTIN learning remains enabled.
- Global GTIN Master remains the central master source.
- Receiving, reports, orders, archive, returns archive and handheld logic were not intentionally changed by this visual cleanup.

Database reference SQL retained in this package because it documents/installs database-side functionality:
- PHASE2B6_SERVER_SESSION_TERMINATION.sql
- PHASE2C51_DELETE_SINGLE_ORDER.sql
- PHASE2C61_SAFE_GTIN_LEARNING.sql

Important:
Do not rerun database SQL on an existing production database unless that migration/fix is specifically required.
