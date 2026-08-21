# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.3.4 — Expiry History Consolidated
Status: READY FOR TEST

## CONSOLIDATION
This package replaces BOTH:
- Phase 2C.11.3.2 — Expiry History UI + Delete All
- Phase 2C.11.3.3 — Expiry History Delete PC-Only

2C.11.3.3 was implemented on top of 2C.11.3.2, therefore this consolidated
package preserves both change sets in one deployment.

## INCLUDED CHANGES
1. Expiry counter UI duplication fixed.
   - PC: CAPTURED + count.
   - Handheld: RECENT + count.
2. Expiry History source/range behavior retained.
3. PC:
   - Single-record Delete available.
   - DELETE ALL EXPIRY HISTORY available only in ALL DEVICES + ALL HISTORY.
   - Delete All retains protected multi-stage confirmation.
4. Handheld:
   - Expiry History is view-only.
   - No single-record Delete.
   - No Delete All.
   - CLEAR SCREEN remains UI-only.
5. Defensive Handheld guards prevent destructive history actions even if stale UI/cache appears.
6. Expiry History deletion is intended to affect current-pharmacy Expiry captures only.
7. Receiving, Orders, Global GTIN, Returns Archive and unrelated historical domains remain protected.

## DATABASE NOTE
Delete All expects the pharmacy-scoped RPC:
delete_all_pharmacy_expiry_captures(p_pharmacy_id)

If the RPC is not present in Supabase, Delete All must remain unverified and should fail safely rather than performing an unsafe browser-side bulk delete.

## TEST
- PC counter shows one CAPTURED label.
- Handheld counter shows RECENT.
- Handheld history has no destructive controls.
- PC single-record Delete works.
- PC Delete All appears only under ALL DEVICES + ALL HISTORY.
- Delete All requires confirmation.
- Verify unrelated PharmFlow data remains untouched.

## EXACT NEXT ACTION
Deploy this package INSTEAD OF deploying 2C.11.3.2 and 2C.11.3.3 separately,
then run the focused Expiry History tests above.
