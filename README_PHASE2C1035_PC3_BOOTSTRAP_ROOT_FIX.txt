PharmFlow Phase 2C.10.3.5 — PC3 Bootstrap Root Fix

LIVE RESULT THAT TRIGGERED THIS FIX
PC1/PC2 had the shared uploaded Orders, while PC3 showed No Active Order.

ROOT ISSUE
The application still started legacy Cloud Workspace hydration before treating
the Active Order Manifest as the first bootstrap authority on a new/empty PC.
That created a race where an empty/old legacy snapshot could win before the
shared manifest had populated PC3.

CHANGES
- Empty PC now pulls Active Order Manifest FIRST.
- Manifest bootstrap retries up to 4 times.
- Legacy Cloud Workspace is secondary.
- A legacy empty workspace cannot clear Orders while a valid manifest exists.
- Login, visible polling, focus and tab visibility all trigger manifest bootstrap.
- Receiving Ledger is pulled immediately after Orders are restored.
- Manifest pull errors are retained/logged instead of being silently treated as
  a legitimate empty workspace.

NO DELETE / RESET / RE-UPLOAD IS REQUIRED.

NO NEW SQL IS REQUIRED for the fix itself.

If PC3 STILL shows No Active Order:
run PHASE2C1035_DIAGNOSE_ACTIVE_ORDER_MANIFEST.sql and send the result.
That read-only query will prove whether the server manifest currently contains
the Orders for this pharmacy.
