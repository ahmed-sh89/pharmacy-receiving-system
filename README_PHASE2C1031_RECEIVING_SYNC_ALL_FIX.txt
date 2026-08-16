PharmFlow Phase 2C.10.3.1

FIX 1 — PC1/PC2 RECEIVING SYNC
- Added the missing Supabase transaction table + RPC functions used by cloud-workspace.js.
- Receiving transaction on PC1 is appended once and pulled by PC2.
- Remote transaction now preserves the Order Number / selectedOrderNumber.
- Sign out/in is not required; visible PC polls normally.
- Sync errors are no longer silently ignored.
- Reset Current Workspace clears the shared receiving transaction stream too.

FIX 2 — MULTIPLE ORDER DEFAULT
- After importing more than one active order, Current Order defaults to ALL.
- User can still switch to an individual order afterwards.

FIX 3 — ALL COMPLETED / REMAINING LOGIC
- ALL no longer relies on the merged orderData receivedQty values.
- ALL dashboard is calculated by summing each order's own original Ordered Quantity
  against that order's attributed receiving transactions.
- Therefore an item completed in Order 1 remains completed inside ALL.
- Same rule is used for Remaining, Over Received and Manual counts.

REQUIRED SQL
Run once before testing:
PHASE2C1031_SHARED_RECEIVING_TRANSACTIONS.sql
