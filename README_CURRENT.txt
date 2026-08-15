PharmFlow Phase 2C.10.1 — Data Integrity & Multi-PC Foundation

1. Erroneous Manual Items
- A Manual/Unordered item with Received Qty = 0 now exposes Remove Manual Item.
- Available from Search and Item Review.
- Removal persists locally and is pushed to the shared workspace.
- Removed manual items no longer remain searchable or appear in current reports.

2. Supabase / Multi-PC authority
- A stale PC can no longer upload its old locally-cached order into an empty cloud workspace after login.
- Cloud workspace is reconciled while the app is visible and whenever the browser regains focus.
- If PC1 finalizes/deletes the current order, PC2 clears the stale current workspace on reconciliation.
- Structural cloud changes are pulled in addition to transaction updates.

3. Finalized Archive
- Finalize writes the archive record to Supabase BEFORE clearing the local workspace.
- The finalized Archive list is restored cloud-first across PCs.
- Delete All Historical Data also deletes the new cloud finalized-archive records.
- SQL required: PHASE2C101_DATA_INTEGRITY_CLOUD_ARCHIVE.sql

4. Multiple Orders / Original Source
- Existing multi-file/multi-order workspace is preserved.
- Order numbers remain preserved in orderFiles.
- Original uploaded-order snapshots remain the authoritative source for Item Transfer.
- Item Transfer continues to use Ordered Quantity from the original uploaded order, never actual Received Qty.

5. Post-Finalize discrepancy email
- When discrepancies exist, Finalize opens a professional email preview.
- Preview includes Order Number, Order Date, Item Code, Item Name, Ordered Qty, Received Qty, Difference and Status.
- Message text:
  الاخوة الكرام بالمستودع
  تحية طيبة وبعد
  يوجد فرق توريد في الطلبية ادناه
  ...
  للإفادة والتشييك
  خالص الشكر ..
- User reviews To + Subject + table before choosing Open in Gmail.
- Open in Gmail opens a compose window; PharmFlow never auto-sends.
- No discrepancy = no email interruption.

Important deployment:
Run PHASE2C101_DATA_INTEGRITY_CLOUD_ARCHIVE.sql once before testing multi-PC archive/finalize.
