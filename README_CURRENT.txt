PharmFlow Phase 2C.9.8 — Physical Zebra UX Stabilization

Receiving Handheld
- Fixes Last Scan / quantity controls covering the Item Name.
- Item Name is shown before quantity controls.
- Removes the duplicate bulky Last Action / All Devices strip.
- Minus | Quantity | Plus remain visible.
- The middle quantity action is clearly labelled ADD QUANTITY.

Receiving Join
- Scanning the PC Session QR/Session Number on Zebra auto-joins without pressing Join.
- Manual entry still supports the Join button.
- Join has one 12-second overall deadline.
- Global GTIN refresh happens in background after Receiving opens.
- Join failure/timeout returns to the Join screen rather than trapping the worker.

Near Expiry Handheld
- Batch and Serial are compact.
- Qty / Month / Year use less vertical space.
- Save & Next remains visible/sticky during normal capture.
- READING has animated feedback.
- Global Master GTIN lookup has a 5-second timeout.
- If lookup stalls: LOOKUP TIMEOUT — SCAN AGAIN, then READY TO SCAN.

No new SQL is required for Phase 2C.9.8.
Keep the SQL already required by Phase 2C.9.7.
