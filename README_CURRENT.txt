PharmFlow Phase 2C.9.6.1 — Unified Needs Review + Capture Ordering

Added before deployment of 2C.9.6:
- Near Expiry > CAPTURED is sorted by Captured At from newest to oldest.
- Every captured expiry row now shows its Source: HANDHELD or PC.
- Existing Captured By, Category, Quantity and Expiry information remain visible.
- No database schema change is required for this refinement.
- PHASE2C96_UNIFIED_NEEDS_REVIEW.sql is still the only new SQL required for the 2C.9.6 family.

Recommended display:
Newest capture
↓
Older captures
