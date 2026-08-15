PharmFlow Phase 2C.9.2 — Handheld Routing & Focus Hotfix

Fixes observed on the physical Handheld after Phase 2C.9.1:
- After sign-in, Handheld opens Mode Selection instead of the PC Dashboard.
- Mode Selection contains only Receive Order, Near Expiry, and Sign Out.
- Android software keyboard is dismissed immediately after sign-in.
- No input is focused while the worker is on Mode Selection.
- Scanner focus is used only after entering the appropriate scanning workflow.
- Zebra detection supports Chrome builds whose user-agent does not explicitly say Zebra.
- The browser is remembered as a PharmFlow Handheld after detection.

No new SQL is required for Phase 2C.9.2.
If not already run, PHASE2C91_HANDHELD_EXPIRY_CAPTURE.sql is still required for Near Expiry.

No GTIN mapping, quantity arithmetic, cloud synchronization, or expiry database logic was changed.
