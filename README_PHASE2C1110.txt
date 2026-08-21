PHARMFLOW 2C.11.1 — HANDHELD RECEIVING UX

Upload/replace all files in this ZIP at their matching paths.
No SQL migration.

Changed production files:
- index.html
- js/ui.js
- css/dashboard.css

This phase intentionally does NOT modify scanner.js, receiving.js, workspace or synchronization architecture. 2C.11.0 is a user-verified baseline and is protected.

RECAPPED COMMIT SUBJECT
Polish handheld receiving UX

EXTENDED DESCRIPTION
Phase 2C.11.1
- Simplify Last Scan to core receiving information
- Keep compact quantity correction controls
- Add current-Handheld Recent Scans drawer
- Show last 20 exact scan transactions for mistake recovery
- Use audit-safe Undo correction instead of deleting history
- Preserve verified Unified Workspace scan and synchronization
- No SQL migration
