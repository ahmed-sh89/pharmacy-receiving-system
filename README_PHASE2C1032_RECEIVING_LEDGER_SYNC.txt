PharmFlow Phase 2C.10.3.2 — Receiving Ledger Sync (Root Fix)

ROOT CAUSE FOUND
1. Active Orders were successfully synchronized through the new Active Order Manifest.
2. Receiving transactions still had an old guard:
   PharmFlowCloudWorkspace.hydratedPharmacyId === pharmacyId
3. If the old full Cloud Workspace hydration did not complete, PC2 could still see the
   uploaded Orders from the Manifest, but pullCloudWorkspaceTransactions() returned
   immediately forever.
4. Therefore Order Files synchronized while Received Quantities remained local to PC1.
5. The upload queue also swallowed transaction upload errors, making the failure invisible.
6. Some manual adjustment paths were still using the merged workspace orderId rather than
   the selected individual Order.

ROOT FIX
- Receiving transaction sync is now independent from the legacy Cloud Workspace snapshot.
- Active Order Manifest + shared Supabase receiving transaction table are the two authorities.
- Receiving has a dedicated 1-second synchronization loop:
    local queue -> Supabase -> full shared ledger pull -> local rebuild.
- PC2 can reconstruct receiving state after refresh/sign-in from the shared transaction ledger.
- Quantities are rebuilt deterministically from transaction history rather than only applying
  unseen remote deltas.
- Up to 5000 current receiving transactions are loaded per pull.
- Transaction upload/pull errors are now logged and surfaced in Cloud status.
- Active Order Manifest explicitly marks the order structure ready for receiving sync.
- selectedOrderNumber is preserved in transaction records.
- Manual +/- adjustments use the same selected-order resolution as scanner receiving.
- Focus/visibility immediately forces a receiving sync.

SQL
- No additional SQL is required if PHASE2C1031_SHARED_RECEIVING_TRANSACTIONS.sql
  has already been executed successfully.
