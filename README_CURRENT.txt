PharmFlow Phase 2C.10.2.7 — Multi-Order Report + Filter-Matched Email + Cross-PC Upload Sync

1. CROSS-PC ACTIVE ORDER FILES
- Uploading/changing order files now forces an immediate guarded Cloud Workspace save.
- PC2 receives the full workspace including Active Order Files metadata and per-order source rows.
- This is in addition to the regular cloud polling/reconciliation.
- Account/pharmacy isolation from 2C.10.2.6 remains intact.

2. MULTIPLE ORDERS
- When more than one active Order is loaded, Current Order in the top bar becomes an Order selector.
- The selected order is stored in the shared workspace.
- New receiving transactions are attributed to the selected Order.
- Per-order original source rows are preserved inside the shared workspace.
- Multi-order discrepancy reports are built separately by Order.
- If one Item Code exists in more than one Order, received quantities use transaction Order attribution.
  Legacy unattributed quantities use deterministic FIFO allocation as a compatibility fallback.

3. FILTERS
- Default Discrepancy Types now starts with every checkbox selected.
- Label displays All selected.
- Email Differences now uses EXACTLY the same rows currently displayed after:
  discrepancy-type filter + category filter.
- Example: Received Any Quantity + Over Received selected -> the email uses exactly those displayed rows.

4. MULTI-ORDER EMAIL
- One email/report can contain multiple Orders.
- Each Order has its own professional section and table.
- Orders with no displayed rows are omitted.
- Multi-order subject:
  Supply Discrepancy Report | X Orders | YYYY-MM-DD

5. PROFESSIONAL EMAIL DESIGN
- Arabic heading is larger, centered and bold:
  الإخوة الكرام بالمستودع
- Professional PharmFlow copper/neutral styling.
- Separate table per Order.
- Clear Order Number / Order Date / displayed item count.
- Copy Email copies rich HTML when the browser supports HTML clipboard.

IMPORTANT GMAIL LIMITATION
- A standard Gmail compose URL cannot inject a reliable HTML table.
- Open in Gmail therefore:
  1) copies the formatted HTML report automatically,
  2) opens Gmail with To + Subject,
  3) user pastes once with Ctrl+V.
- This preserves the professional table formatting and avoids the broken plain-text table seen previously.

No new SQL migration is required specifically for Phase 2C.10.2.7.
If PHASE2C1025_DEPLOY_FROM_2C1023.sql has not been run yet, it is still required.
