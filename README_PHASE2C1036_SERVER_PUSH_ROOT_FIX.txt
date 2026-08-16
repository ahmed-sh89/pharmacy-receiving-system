PharmFlow Phase 2C.10.3.6 — Active Order Manifest Server Push Root Fix

CONFIRMED LIVE DIAGNOSIS
The server query returned:
Success. No rows returned.

Therefore PC3 was not failing to download an existing manifest.
The manifest was never persisted to Supabase.

ROOT FIX
1. Added new V2 Manifest RPCs with a self-contained pharmacy membership check.
2. Save is now verified twice:
   - RPC returns exact Order File / Item counts.
   - immediate read-after-write verifies the row really exists on the server.
3. PharmFlow may show SYNCED only when the Active Order Manifest is actually persisted.
4. If the Manifest save fails, status remains OFFLINE / pending and an explicit error is shown.
5. Any PC that already has the active Orders locally automatically repairs a missing server Manifest.
   This means PC1 can populate the server WITHOUT deleting, resetting or re-uploading the Orders.
6. PC3 then pulls the repaired Manifest normally.
7. Remote Manifest application no longer emits a recursive local Manifest-save loop.

REQUIRED SQL
Run once:
PHASE2C1036_ACTIVE_ORDER_MANIFEST_SERVER_FIX.sql

TEST ORDER
A) Deploy the web build and run the SQL.
B) Open PC1 first (the PC that still has the active Orders).
C) Wait 2-5 seconds. PC1 should repair the empty server Manifest automatically.
D) Run PHASE2C1036_VERIFY_ACTIVE_ORDER_MANIFEST.sql.
   It MUST show at least 1 row with order_files > 0 and order_items > 0.
E) Only after that, hard refresh PC3.
F) PC3 should restore the same Active Orders and then Receiving Ledger quantities.

DO NOT:
- Delete Historical Data
- Reset Current Workspace
- Re-upload Orders
