PharmFlow Phase 2C.11.4.11 — Consolidated Runtime Load Root Fix

UPLOAD ALL FILES IN THIS PATCH:
- index.html
- js/state.js
- js/app.js
- js/auth.js
- js/session.js
- js/cloud-workspace.js

NO SQL.

WHY THIS IS DIFFERENT
The source fixes existed, but index.html was still requesting old cache versions for
auth/session/cloud-workspace. This release consolidates the full intended runtime
and forces all related modules to load together as version 2C11411.

ONE-TIME AFTER DEPLOYMENT
Do Ctrl+Shift+R once on the PC.

RECAPPED COMMIT
Subject: Load consolidated workspace runtime
Description: Consolidate server-first auth/state and finalize persistence fixes
and update all runtime cache keys so the browser actually executes the current code.
