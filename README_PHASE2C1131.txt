PHARMFLOW 2C.11.3.1 — EXPIRY UX + HISTORY + 30s AUTO CLEAR

Upload/replace ALL files in this ZIP at matching paths.
No SQL migration.

Changed production files:
- index.html
- js/expiry.js
- css/dashboard.css
- js/handheld-runtime.js
- js/ui.js
- js/receiving.js
- js/cloud-workspace.js

KEY CHANGES
- No automatic numeric keyboard after Handheld Expiry scan
- Quantity keypad only after intentional tap
- Visible Handheld CLEAR SCREEN
- Safe 30-second Auto Clear after Save on PC + Handheld
- Compact single-row Worker control
- Operational Expiry history filters:
  HANDHELD / PC / ALL DEVICES
  TODAY / 7 DAYS / ALL HISTORY
- Default history is recent, not all historical data
- No SQL migration

RECAPPED COMMIT SUBJECT
Polish expiry handheld UX

EXTENDED DESCRIPTION
- Gate quantity keyboard behind intentional tap
- Restore scanner focus after Expiry resolution
- Implement 30-second safe Auto Clear
- Compact worker selector
- Scope Recent/Captured history by device class and period
- Preserve historical records for Reports
- Preserve verified Receiving baseline
