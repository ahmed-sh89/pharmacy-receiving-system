# PHARMFLOW_CHANGELOG

## 2026-08-19 — Phase 2C.10.5.4 — READY FOR TEST
- Root fix for uploaded-order membership/search consistency across PC, Handheld and Needs Review.
- Storage-safe Receiving reset cleanup.
- Handheld scan-ready UX and exception viewport improvements.
- Needs Review desktop workspace redesign.
- Added formal current checkpoint to repository.


==================================================
19 AUGUST 2026 — PHASE 2C.10.5.5 RUNTIME ROOT CLEANUP
==================================================
- Previous combined patch test result: only requirement #24 was user verified; #1–23 remained unresolved.
- Runtime audit found divergent order-context and review paths, including an undefined legacy saveReceivingNeedsReview call.
- Unified PC/Handheld receiving context around selected uploaded-order source rows and cloud session snapshot authority.
- Added true Handheld READY TO SCAN state after order snapshot hydration.
- Reused uploaded-order searchable source for PC GTIN resolver and Needs Review.
- Added Reset V4 RPC with no Storage table DML and deterministic local purge after server confirmation.
- Added guaranteed visible Reset/Historical Delete operation receipts.
- Status: READY FOR TEST.
