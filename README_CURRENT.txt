PharmFlow Phase 2C.9.4 — Near Expiry Capture UX

Changes:
- Fixed runtime error: escapeHtml is not defined.
- Fixed Add Worker and Save & Next path affected by that error.
- Month is now a dropdown (01 January through 12 December).
- Year is now a dynamic dropdown: current year through current year + 10.
- Quantity is the only manual numeric expiry-entry field.
- Pressing Enter in Quantity dismisses the Android keyboard and moves to Month.
- Added CAPTURED counter/review button.
- Captured list shows saved expiry records and allows protected single-record Delete with a second confirmation tap.
- Deleting an expiry capture does NOT delete Global GTIN, order data, receiving data, workers, or other expiry records.
- Added Near Expiry to the PC sidebar using the same capture engine/data.
- Zebra scanner remains keyboard-free.

SQL:
Run PHASE2C94_EXPIRY_DELETE_CAPTURE.sql once in Supabase SQL Editor before testing Delete.
The existing PHASE2C91_HANDHELD_EXPIRY_CAPTURE.sql must already be installed.

Test:
1. Settings > Add Worker.
2. Zebra > Near Expiry > choose worker.
3. Scan item.
4. Enter Quantity and press Enter: keyboard closes.
5. Choose Month and Year from dropdowns.
6. Save & Next.
7. Open CAPTURED and delete one saved record using Delete > Confirm.
8. On PC, verify Near Expiry appears in sidebar and opens Capture.
