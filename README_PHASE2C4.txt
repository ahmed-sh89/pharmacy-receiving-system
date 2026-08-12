PHARMFLOW — PHASE 2C.4 MANUAL FINALIZE RECEIVING

NO SQL REQUIRED.

Replace these files in GitHub:
- index.html
- js/orders.js
- js/app.js
- js/session.js
- css/dashboard.css

What this phase does:
1. Adds an explicit "Finalize Receiving" button on the Receiving page.
2. Finalization is MANUAL ONLY. Quantity equality never auto-finalizes an order.
3. Before finalizing, PharmFlow validates every Order Number in the current workspace against the Supabase order registry and blocks duplicate finalization.
4. Confirmation shows operational discrepancy counts only as a warning/reconciliation summary; these counts do NOT change the immutable uploaded-order source used by official reports.
5. Finalization changes registered workspace orders to Received using the existing finalize_pharmflow_order RPC.
6. If the PC owns a live Handheld session, PharmFlow ends that shared session first so the Handheld cannot keep scanning against a finalized receiving session.
7. The receiving workspace is archived and then cleared, returning the PC to a clean default workspace.
8. The legacy Settings "Close Current Order" action is removed from the page and its old handler is redirected to the new Finalize workflow so it cannot bypass data-integrity rules.
9. Local archive status is aligned to "Received".

Suggested commit:
Phase 2C.4 - add protected manual receiving finalization

Acceptance test:
- Load a NEW registered order.
- Receive deliberately mismatched quantities.
- Click Finalize Receiving manually.
- Confirm the order becomes Received in Orders/registry.
- Confirm the current receiving workspace clears.
- Confirm the same Order Number cannot be finalized again.
- If a Handheld live session is active, confirm it is ended before workspace cleanup when the real device is available.
