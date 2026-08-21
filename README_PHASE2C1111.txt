PHARMFLOW 2C.11.1.1 — HANDHELD QUANTITY + RECENT UX FIX

Upload/replace all files in this ZIP at matching paths.
No SQL migration.

Changed production files:
- index.html
- js/ui.js
- css/dashboard.css

This patch is UI/correction behavior only. It does NOT modify the verified
2C.11.0 Unified Workspace scanner, receiving, or synchronization architecture.

RECAPPED COMMIT SUBJECT
Fix handheld quantity UX

EXTENDED DESCRIPTION
- Restore working primary Handheld quantity display
- Make QTY the primary control directly under Last Scan identity
- Reduce +/- and secondary receiving metrics to prevent confusion
- Close numeric keyboard on Enter/Done
- Restore Recent Scans button hidden by legacy CSS
- Preserve audit-safe recent scan correction
- Preserve verified PC↔Handheld sync
- No SQL migration
