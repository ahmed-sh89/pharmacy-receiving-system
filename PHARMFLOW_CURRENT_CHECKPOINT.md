# PHARMFLOW CURRENT CHECKPOINT

Date: 20 August 2026
Version: Phase 2C.10.7.1 — Handheld Order Context + Focus Root Fix
Status: READY FOR TEST

## TEST EVIDENCE FROM 2C.10.7.0
- Known item physically in the active PC order: Handheld scan produced no item card. FAILED.
- Unknown/not-in-order scan: Handheld reached Item Not Recognised and showed identity data. This proves raw Zebra capture/parser path is now active.
- Quantity numeric keyboard repeatedly opened/closed. FAILED.

## ROOT CAUSES ADDRESSED
1. Live session snapshot rows arrive on Handheld without browser-local `orderNumbers` membership metadata. Receiving then rejected a genuine session item during deterministic order selection even though the item row itself came from the authenticated PC live session.
2. Handheld runtime auto-focus could reclaim scanner focus while the worker was editing Quantity, causing numeric keyboard instability.

## 2C.10.7.1 CHANGE
- A row present in an authenticated live Handheld session snapshot is treated as authoritative current-session membership when local per-order metadata is absent. It is NOT converted to Manual/Over Stock.
- Aggregate session metrics use the session item's Ordered/Received/Remaining values when per-order membership is unavailable.
- Auto-focus never steals focus from Quantity/date/photo/action inputs.
- Scanner focus returns after the action finishes.
- READY label now exposes actual transported context: ITEMS n · ORDERS n/SESSION.
- No SQL migration.

## PRESERVED
- PC Receiving search #24 remains USER VERIFIED.
- Unknown GTIN still goes to Needs Review.
- Known GTIN not in session/order remains Extra/Needs Review path.
- Global GTIN / Returns Archive boundaries unchanged.

## EXACT NEXT TEST
1. Hard refresh Handheld and join a NEW PC session.
2. Before scanning, read the READY line and record ITEMS/ORDERS.
3. Scan the same known order item GTIN 06287043583491 once, then x3. Expected correct item +1 each scan, no freeze.
4. Scan one unknown/not-in-order item; tap Physical Qty and type 3. Numeric keypad must remain stable until Enter/Save.
5. Send screenshot only if known item still fails; the READY line will reveal whether the PC session transported item rows.
