PharmFlow — Current Project Reference
Phase 2C.8.4 — Latte + Copper Identity

Current visual identity:
- Light Latte page canvas.
- Copper / muted terracotta primary actions.
- Espresso / dark brown primary text.
- Semantic operational colors remain: green success, amber remaining/warning, red over/error.
- Sidebar text remains 14px and is intentionally bolder for readability.
- PharmFlow mark is transparent and uses a barcode-inspired copper P.
- Session Number/ID is not intended for normal user display; status is sufficient.

Current functional baseline:
- Multiple GTIN per item / pharmacy-learned GTIN workflow.
- Unknown GTIN resolution and safe mapping.
- Multi-PC/cloud workspace logic remains unchanged.
- Receiving, reports, archive, returns, and handheld logic unchanged.

Database references retained:
- PHASE2B6_SERVER_SESSION_TERMINATION.sql
- PHASE2C51_DELETE_SINGLE_ORDER.sql
- PHASE2C61_SAFE_GTIN_LEARNING.sql
- PHASE2C81_GTIN_AMBIGUITY_HOTFIX.sql (reference to successful ambiguity fix)

No SQL is required for this visual Phase 2C.8.4 update.
