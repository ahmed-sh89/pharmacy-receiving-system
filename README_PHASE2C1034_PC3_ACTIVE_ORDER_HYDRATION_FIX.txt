PharmFlow Phase 2C.10.3.4 — PC3 Active Order Hydration Fix

Root cause fixed:
The dedicated Active Order Manifest could correctly restore uploaded orders on a new PC, but the legacy Cloud Workspace reconciliation loop could run afterward, see its older/empty snapshot, and clear the just-restored orders again. This made PC3 show No Active Order even though the same pharmacy had active uploaded orders on PC1/PC2.

Fix:
- Active Order Manifest is explicitly tracked as present and treated as structural authority.
- Empty legacy Cloud Workspace can no longer erase manifest-restored active orders.
- Manifest runtime state resets safely when authenticated pharmacy/user context changes.
- No Historical Data deletion is required.
- No new SQL is required if PHASE2C1029_SHARED_ACTIVE_ORDERS.sql and PHASE2C1031_SHARED_RECEIVING_TRANSACTIONS.sql were already executed.

Test:
1. Keep PC1 with current uploaded orders. Do not reset/delete/re-upload.
2. Deploy this phase.
3. Open same pharmacy user on PC3 and hard refresh once.
4. Orders should hydrate automatically.
5. Select All Orders and verify dashboard totals.
6. Receive one item on PC1 and verify quantity reaches PC3 through receiving ledger sync.
