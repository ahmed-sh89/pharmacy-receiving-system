PHARMFLOW PHASE 2C.10.3.9
MULTI-ORDER ATOMIC UPLOAD + ALL ORDERS ROOT FIX

STATUS
READY FOR TEST

PRESERVED VERIFIED FIX
Phase 2C.10.3.8 synchronization architecture is preserved:
- PC ↔ PC receiving synchronization
- PC ↔ Handheld receiving synchronization
- synchronized scan visibility

ROOT CAUSES FIXED
1. A new order was registered in the lifecycle before Active Order Manifest
   persistence was synchronously verified. A transient manifest delay/failure
   made the operator retry, then the second attempt appeared as Already Uploaded.
2. A PC could add an order on top of stale local manifest state and overwrite
   the server's active-order set.
3. After adding a second order, selectedOrderNumber was changed to ALL but the
   newer selectedOrderNumbers array could remain scoped to the old order.
   Dashboard/Receiving therefore showed unchanged quantities despite 2 orders.
4. selectedOrderNumbers was not stored in the Active Order Manifest.
5. Dashboard Total Scans was local-device filtered instead of selected-order
   scoped across synchronized devices.

CHANGES
- Pull latest Active Order Manifest before every order import.
- After import, synchronously save + read-after-write verify the complete
  manifest with up to 3 retries before showing upload success.
- Never instruct the operator to re-upload when server verification is pending.
- Default selection after order addition is explicitly ALL active orders in
  both selectedOrderNumbers and selectedOrderNumber.
- Persist selectedOrderNumbers in the server manifest.
- Dashboard selected-order scan metric counts synchronized transactions from
  all devices in the selected order scope.

DATABASE
No new SQL migration required.

FOCUSED TEST
1. Start with one active order visible on PC1 and PC2.
2. Upload a genuinely new second order ONCE on PC1.
3. Confirm success appears on first attempt.
4. Confirm Select Orders shows both orders and defaults to All Orders.
5. Confirm Dashboard and Receiving quantities change to combined totals.
6. Select Order 1: verify its quantities only.
7. Select Order 2: verify its quantities only.
8. Select All Orders: verify combined quantities.
9. On PC2, confirm both orders and same selected-order totals.
10. Sign out/in on both PCs: both orders must remain.
11. Perform one scan and confirm Phase 2C.10.3.8 PC/Handheld synchronization
    remains working.

DO NOT RESET OR DELETE DATA FOR THIS TEST.
