PharmFlow Phase 2C.9.3 — Final Handheld Receiving + Near Expiry UX

Included in one update:
1. Join PC Session no longer opens the Android keyboard automatically.
2. Receiving scanner and Near Expiry scanner remain hardware-scanner only.
3. MODE/Modes is always visible at the top of Receiving and Near Expiry.
4. Receiving worker screen is simplified; PC/admin buttons are hidden.
5. TOTAL SCANS is a visible button for scans made by this Handheld.
6. Tapping TOTAL SCANS opens the Handheld item review list.
7. Undo is not shown on the main screen. "Undo Item" appears only beside items in Total Scans.
8. Near Expiry now accepts Zebra scanner input even when DataWedge/Chrome does not append Enter.
9. Near Expiry resolves the scanned GS1/GTIN, then moves to Quantity.
10. Worker selection is remembered per device.
11. Protected Supabase RPC calls retry once after refreshing an expired JWT.
12. Raw "JWT expired" is no longer the expected user-facing worker-management failure.
13. Near Expiry opens at the top so Modes remains visible.

No new SQL is required for Phase 2C.9.3.
The Phase 2C.9.1 expiry SQL must already have been run.

Recommended physical Zebra test:
A) Sign in -> no keyboard.
B) Receive Order -> Join screen -> no keyboard until Session Number is tapped.
C) Join -> MODE visible -> scan -> green feedback -> Total Scans increments.
D) Total Scans -> item list -> Undo Item corrects the selected recent item.
E) Near Expiry -> Modes visible -> choose worker -> scan GS1 -> item resolves.
F) Enter Qty -> Month -> Year -> Save & Next -> scanner ready again.
G) Settings -> Add Worker after a long login session -> token refresh is handled automatically.
