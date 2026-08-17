PHARMFLOW PHASE 2C.10.4.3 — HISTORICAL DELETE RECEIPT / UI FIX

STATUS: READY FOR TEST
BUG CLASSIFICATION: UI / async completion notification

CHANGE
- Confirmation actions are now awaited instead of fire-and-forget.
- Confirmation execution is single-flight to prevent accidental double execution.
- Delete All Historical Data closes the loading overlay before showing its final receipt.
- Success and failure receipts remain visible for 8 seconds.
- Success is still shown only after the existing Supabase verification completes.

NON-REGRESSION
- No SQL migration.
- No change to Active Order Manifest logic.
- No change to order upload logic.
- No change to receiving synchronization or scan synchronization.
- No change to Reset Current Workspace.
- Historical deletion remains isolated from Active Orders, Returns Archive and Global GTIN Master.

FOCUSED TEST
1. Deploy this package and hard refresh.
2. Use Delete All Historical Data with the required confirmation phrase.
3. Expected: after server verification completes, a green toast appears:
   Historical data deleted successfully · Server verified · Active Orders unaffected · Global GTIN Master active
4. Confirm current Active Orders remain present.
5. Confirm Global GTIN Master remains active.
6. Confirm Returns Archive remains unaffected.

RECOMMENDED COMMIT
Phase 2C.10.4.3 — Fix Historical Data deletion success receipt and async confirmation flow

- Await destructive confirmation callbacks through the full Supabase operation
- Prevent duplicate confirmation execution while an action is in progress
- Show Historical Data success receipt only after server verification completes
- Close loading overlay before rendering final success/error notification
- Extend deletion result receipt visibility for operational clarity
- Preserve Active Orders, Returns Archive and Global GTIN Master boundaries
- Preserve verified PC-to-PC and PC-to-Handheld receiving synchronization
- No SQL migration required
