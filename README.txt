PharmFlow Phase 2C.4.2 - Legacy Current Order Registry Repair

Replace only:
  js/orders.js

No SQL is required.

Purpose:
If the currently loaded order predates the persistent Order Registry, Finalize Receiving will safely register that current order from its already-saved workspace metadata, then continue normal duplicate/finalize protection.
