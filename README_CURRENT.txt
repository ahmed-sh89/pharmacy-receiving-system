PharmFlow Phase 2C.9.5 — Near Expiry Page Architecture Fix

This release fixes two UI architecture bugs observed on real devices:

Near Expiry
- Near Expiry is now a permanent app page in index.html.
- PC and Zebra use the SAME capture markup and expiry.js logic.
- PC Sidebar > Near Expiry now opens the actual Capture page instead of an empty route.
- Zebra > Modes > Near Expiry now shows the capture page instead of a white screen.
- Zebra Expiry explicitly hides all other app pages and shows only Near Expiry.
- Modes and Captured remain visible at the top.

Handheld Receiving
- Last Scan quantity control is forced into a three-column layout:
  Minus | Quantity | Plus.
- The + button can no longer overflow outside the Zebra viewport.
- Quantity controls use the full available screen width.
- No receiving quantity/business logic was changed.

SQL
- No new SQL is required for Phase 2C.9.5.
- Keep the SQL already installed for 2C.9.1 and 2C.9.4.

First visual test after deployment:
1. PC: click Near Expiry -> Capture must be visible.
2. Zebra: Modes -> Near Expiry -> Capture must be visible.
3. Zebra Receiving: Last Scan must show Minus, Quantity and Plus at the same time.
