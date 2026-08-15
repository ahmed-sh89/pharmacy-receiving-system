PharmFlow Phase 2C.10.0 — Receiving Pending Review Workflow

- Fixes Total Scans count/list mismatch by using the same Handheld scan source for both.
- Known GTIN + item in current order: receive immediately.
- Known GTIN in Global Master but not in current order: Amber review card, Quantity only, Save for Review.
- Unknown GTIN: Amber review card, Quantity only, Save for Review.
- Pending review quantity does not affect Received Qty or order totals before pharmacist/admin approval.
- PC Needs Review shows explicit reason and Pending Quantity.
- SQL required: PHASE2C100_RECEIVING_PENDING_REVIEW_REASONS.sql
