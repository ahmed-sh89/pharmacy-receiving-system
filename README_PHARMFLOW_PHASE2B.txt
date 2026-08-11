PHARMFLOW — PHASE 2B BRAND + DASHBOARD REDESIGN

Preserves all Phase 2A.4 auth fixes and Owner/Admin multi-pharmacy behavior.

Changes: PHARMFLOW user-facing brand, new logo, centralized brand config, redesigned Login/Sidebar/Dashboard, pharmacy/code/role dashboard context, quick actions, responsive blue/orange visual system, PharmFlow export filenames.

IMPORTANT: internal legacy Medryvo identifiers/localStorage/RPC names are intentionally preserved to avoid breaking deployed Supabase functions or sessions.

UPLOAD: index.html; assets/pharmflow-mark.svg; js/config.js; js/app.js; js/auth.js; css/style.css; css/sidebar.css; css/dashboard.css; css/auth.css
NO SQL. NO SUPABASE CHANGE.
Commit: Phase 2B - PharmFlow brand and dashboard redesign

ADDED BEFORE PHASE 2B RELEASE — RETURNS ARCHIVE FOUNDATION:
- Returns Archive is included in the Sidebar and application page structure.
- It is a simple reference archive only; no reports and no file-content parsing.
- Future record structure: Date + Return Number/Title + uploaded files.
- Supported file intent: Excel, PDF, images and other supporting documents.
- Return files will have independent delete controls at any time.
- Returns Archive deletion is completely separate from Historical Data deletion in Settings.
- Historical Data deletion must never delete Returns Archive files.
- Returns Archive storage usage will be tracked separately when the functional archive is implemented.
