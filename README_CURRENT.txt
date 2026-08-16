PharmFlow Phase 2C.10.2.9 — All Orders + Dedicated PC1/PC2 Active Order Sync

IMPORTANT: THIS RELEASE HAS ONE NEW SQL FILE
Run once in Supabase:
PHASE2C1029_SHARED_ACTIVE_ORDERS.sql

1. CURRENT ORDER — ALL
- Added All Orders as the default combined view when more than one active Order exists.
- All Orders keeps the original aggregate Dashboard logic.
- Selecting an individual Order recalculates Dashboard/Progress from that Order only.
- Switching back to All Orders restores combined totals.

2. MODERN ORDER PICKER
- Removed the browser-native select appearance.
- Replaced it with a PharmFlow custom picker:
  All Orders / individual Order cards, description, selected state and custom popover.

3. PC1 -> PC2 ACTIVE ORDER SYNC
- Added a dedicated Supabase table/RPC called Active Order Manifest.
- It is scoped ONLY by pharmacy_id, not by browser or user-local storage.
- Any authenticated member of the same pharmacy reads the same Active Order Files.
- Uploading Order Files on PC1 saves this structural manifest immediately.
- PC2 explicitly pulls the manifest during login and on every visible cloud reconciliation cycle.
- The manifest carries:
  active order files, source rows, merged item structure and selected order.
- Receiving quantities are intentionally NOT authoritative in the manifest;
  receiving transactions continue through the existing transaction cloud sync.
- Reset Current Workspace clears this dedicated manifest as well.

WHY THIS IS DIFFERENT FROM 2C.10.2.8
- 2C.10.2.8 tried to make the full Cloud Workspace upload more deterministic.
- Your live test proved that was still not sufficient for Active Order Files.
- 2C.10.2.9 therefore does NOT rely on that path alone.
  It introduces a separate pharmacy-wide structural authority specifically for active uploaded Orders.

No other requested changes were silently omitted in this release.
