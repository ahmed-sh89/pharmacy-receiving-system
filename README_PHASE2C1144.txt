PHARMFLOW 2C.11.4.4 — FINALIZE ORDER SELECTION SYNC FIX

No SQL migration.

ROOT CAUSE
- The header Select Orders picker correctly changed AppState to one selected order.
- The Receiving UI refreshed, but the Finalize Receiving button was not refreshed.
- Therefore the button retained its earlier ALL ORDERS disabled state and stale tooltip:
  "Select one order before Finalize Receiving".

ROOT FIX
- Immediately re-evaluate Finalize Receiving after the operator confirms a new order selection.
- No change to finalization validation, archive logic, receiving quantities, GS1 parsing,
  Handheld behavior, Expiry, reports, Global GTIN, Supabase schema, or synchronization.

FOCUSED TEST
1. Open the existing persisted multi-order workspace.
2. With ALL ORDERS selected, Finalize must remain blocked.
3. Select exactly one active Order and press OK.
4. Expected: Finalize Receiving becomes enabled immediately and the stale tooltip disappears.
5. Do not finalize yet if the current order is needed for further tests.
6. Re-select ALL ORDERS. Expected: Finalize becomes blocked again.

STATUS
READY FOR TEST — requires user verification on the existing production workspace.

RECAPPED COMMIT SUBJECT
Fix Finalize order selection sync

RECAPPED COMMIT DESCRIPTION
Refresh the Finalize Receiving control immediately after changing the header order scope.
Preserves all existing Receiving, Handheld, Expiry, report, archive and GS1 behavior.
