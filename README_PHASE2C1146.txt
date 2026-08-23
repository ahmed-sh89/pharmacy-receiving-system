PharmFlow Phase 2C.11.4.6 — Finalize Manifest Cleanup Root Fix

FILES TO UPLOAD TO GITHUB
- js/session.js
- index.html

ONE-TIME CURRENT DATA CLEANUP
- PHASE2C1146_CLEAR_STALE_FINALIZED_MANIFEST.sql
Run only AFTER GitHub deployment.

WHY
2C.11.4.5 correctly separated Archive records but updated only browser state.
Supabase Active Order Manifest remained stale and rehydrated finalized orders.

NEW BEHAVIOR
Finalize Order A:
- Archive A independently
- lifecycle A = Received
- remove A from Current Workspace
- save server manifest containing remaining Order B

Finalize Order B:
- Archive B independently
- lifecycle B = Received
- remove B
- clear server Active Order Manifest
- Current Workspace becomes empty automatically

NO NEW DATABASE MIGRATION.
The SQL file is one-time cleanup of the already-stale current manifest only.

RECAPPED COMMIT
Subject: Sync workspace after finalize
Description: Persist order-scoped Finalize cleanup to the authoritative Supabase Active Order Manifest and clear it when the last active order is finalized.
