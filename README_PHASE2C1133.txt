PHARMFLOW 2C.11.3.3 — EXPIRY HISTORY DELETE PC-ONLY

Upload/replace all files in this ZIP at matching paths.
No new SQL migration.

Changed production files:
- index.html
- js/expiry.js
- css/dashboard.css
- carried-forward verified files

RULE
PC:
- Single Delete allowed.
- Delete All allowed in All Devices + All History.

HANDHELD:
- View-only history.
- No Delete.
- No Delete All.
- Clear Screen remains UI-only.

RECAPPED COMMIT SUBJECT
Restrict expiry delete to PC
