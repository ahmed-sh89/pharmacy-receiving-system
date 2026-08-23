PharmFlow Phase 2C.11.4.7 — Server-First Login Hydration

FILES TO UPLOAD
- js/cloud-workspace.js
- index.html

NO SQL.

Purpose:
Prevent stale finalized/current-order browser snapshots from flashing briefly
after Sign In. Supabase authorities now determine the first authenticated
workspace state.

RECAPPED COMMIT
Subject: Prevent stale orders on sign in
Description: Make authenticated workspace hydration server-first and remove
stale scoped browser snapshots when both cloud authorities confirm no active order.
