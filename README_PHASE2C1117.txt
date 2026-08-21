PHARMFLOW 2C.11.1.7 — CLEAR SCREEN PC + HANDHELD

Upload/replace all files in this ZIP at matching paths.
No SQL migration.

Changed production files:
- index.html
- js/ui.js
- js/cloud-workspace.js
- js/receiving.js
- css/dashboard.css

CLEAR SCREEN RULE
The button only cleans the visible Last Scan UI.
It does not undo, delete, reset quantity, reset local batch, or change Supabase data.

RECAPPED COMMIT SUBJECT
Add clear screen controls

EXTENDED DESCRIPTION
- Rename Handheld Cancel Scan to Clear Screen
- Make Clear Screen visual-only
- Add matching PC Clear Screen control
- Preserve PC Last Scan layout
- Preserve audit-safe correction paths
- Preserve Unified Workspace and burst-sync fixes
- No SQL migration
