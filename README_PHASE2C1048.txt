PHARMFLOW PHASE 2C.10.4.8 — HANDHELD UNKNOWN GTIN NEEDS REVIEW
STATUS: READY FOR TEST

ROOT FIX
- Known Handheld item exposes Ordered / Received / Remaining in the compact Last Scan card.
- Unknown GTIN is persisted to Supabase BEFORE asking for quantity; a fast next scan cannot lose it.
- Red flash + ITEM NOT RECOGNISED + visible raw GTIN.
- Physical Qty defaults to 1; Enter or SAVE & CONTINUE updates the already-persisted review row.
- PC Needs Review count/list is pharmacy-scoped so Handheld rows cannot disappear because of device-local order IDs.
- Resolution to an existing order item remains normal receiving (manual=false); Over remains quantity-derived only.
- New GTIN is learned as a pharmacy-scoped alias after pharmacist review; the protected system-wide Global Master is not silently mutated by a pharmacy user.

NON-REGRESSION
- No destructive migration.
- Phase 2C.10.4.6 historical deletion unchanged.
- Phase 2C.10.4.7 login generation fix unchanged.
- Shared receiving ledger / PC↔PC / PC↔Handheld sync architecture unchanged.
- Global Master protected boundary preserved.

DEPLOY
1. Run PHASE2C1048_HANDHELD_UNKNOWN_GTIN_NEEDS_REVIEW.sql in Supabase.
2. Upload index.html, js/receiving.js, js/ui.js, css/dashboard.css preserving paths.
3. Hard refresh PC and Handheld.

FOCUSED TEST
A. Known GTIN in order: Handheld shows item identity + Ordered/Received/Remaining; scan +1 syncs to PC.
B. Unknown GTIN: red flash, GTIN visible, Physical Qty=1; BEFORE Save the PC Needs Review must already become >=1 after refresh/realtime update.
C. Change Qty and press Enter: row remains pending with exact new Qty; Handheld returns to scanner.
D. PC Needs Review: row visible. Link to existing order item; it receives Qty as normal, Manual must stay 0; Over changes only if total Received exceeds Ordered.
E. Sign out/in or refresh: pending review survives.

RECAPPED COMMIT SUBJECT
Harden handheld unknown GTIN flow
