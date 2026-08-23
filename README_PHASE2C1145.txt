PharmFlow Phase 2C.11.4.5 — Selected Order Finalize Root Fix

WHAT CHANGED
- Finalize now marks ONLY the single selected Order Number as Received.
- Archive creation is scoped to ONLY that selected order.
- Other active orders remain in Current Workspace.
- Selected-order receiving transactions are removed from the live workspace after archive so quantities cannot leak into another order.
- The remaining active order becomes the selected order automatically.
- A one-time guarded SQL recovery is included for the accidental combined archive involving:
  TO-000455987 and TO-000457715.

FILES TO REPLACE
1. js/orders.js
2. js/session.js

ONE-TIME SQL
3. PHASE2C1145_RECOVER_COMBINED_FINALIZE.sql
Run only after the two JS files are deployed.

EXACT TEST
1. Deploy the two JS files.
2. Run the recovery SQL once in Supabase SQL Editor.
3. Refresh PharmFlow.
4. Confirm both orders are active/uploaded.
5. Select TO-000455987 only.
6. Finalize it.
7. Verify Archive contains TO-000455987 as an independent record with Delete Order.
8. Verify TO-000457715 remains active/uploaded and can still be received/finalized separately.
9. Do NOT finalize TO-000457715 until step 8 is confirmed.

STATUS
READY FOR TEST — not DONE until user verification.

RECAPPED COMMIT
Subject: Fix selected order finalization
Details: Scope lifecycle, archive, workspace cleanup and quantities to the selected order only; preserve other active orders; include guarded recovery for the accidental combined finalize.
