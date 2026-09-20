PHARMFLOW B10 CLEAN15.6 — PC SEARCH UX + BATCH RESET

Scope
- Project B only.
- PC Receiving only.
- No SQL/Supabase changes.
- No Handheld UI/workflow changes.
- No changes to Ordered/Received/Remaining calculation logic.

Changes
1) PC Scan/Search readability
   - Larger selected item name and item number.
   - Larger Ordered / Received / Remaining values.
   - Light visual background colors for the selected-item metric blocks.
   - Larger QUANTITY label, quantity value and +/- controls.

2) Keyboard workflow
   - Pressing Enter while focused in the PC smart quantity input runs Add Quantity.
   - Key repeat is ignored to prevent accidental repeated submission.
   - Handheld is explicitly excluded from this Enter binding.

3) PC Last Scan batch boundary
   - PC 30-second auto-clear now resets only the local current batch state before clearing Last Scan.
   - PC CLEAR SCREEN does the same.
   - No receiving transaction, shared Received total, history, order quantity or Supabase data is deleted/changed by the clear.
   - The next scan after clear/auto-clear starts a fresh local batch at quantity 1.

Cleanup
- Replaced the old tiny desktop manual/search CSS block with one consolidated desktop-only readability block.
- Did not add a second override layer over the old compact block.
- Did not include the abandoned Clean15.5 per-order display-metric logic after duplicate order-file input was identified as the source of the earlier 304 display.

Acceptance tests
- Search an item on PC and verify the selected-item content is clearly readable.
- Enter quantity > 0 and press Enter; it should add once without mouse use.
- Scan same item repeatedly while Last Scan is still active; local batch should continue.
- Press CLEAR SCREEN; scan same item again; local batch should show 1.
- Repeat after the 30-second auto-clear; next scan should show local batch 1.
- Verify Received Total/history remain unchanged by clear itself.
