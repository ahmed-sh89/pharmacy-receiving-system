PHARMFLOW PHASE 2C.4.1 — FINALIZE BUTTON EVENT FIX

Replace only index.html.
Cause: js/orders.js existed but was not loaded by index.html, so the Finalize Receiving button had no click listener.
No SQL required.
