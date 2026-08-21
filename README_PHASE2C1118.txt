PHARMFLOW 2C.11.1.8 — HANDHELD IDLE/WAKE ROOT FIX

Upload/replace ALL files in this ZIP at matching paths.
No SQL migration.

Changed production files:
- index.html
- js/handheld-runtime.js
- js/ui.js
- js/cloud-workspace.js
- js/receiving.js
- css/dashboard.css

ROOT FIX
Android Chrome can silently lose the focused DataWedge input after idle time.
This release adds a local-only scanner focus watchdog and wake recovery while
explicitly protecting worker Quantity/photo/select input.

RECAPPED COMMIT SUBJECT
Fix handheld idle scanning

EXTENDED DESCRIPTION
- Repair hardware scanner focus after idle
- Recover on browser visibility/focus/pageshow/network wake
- Do not steal focus while worker enters operational data
- Share the same recovery with Receiving and Expiry
- Preserve Unified Workspace and PC behavior
- No SQL migration
