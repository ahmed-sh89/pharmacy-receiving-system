PharmFlow Phase 2C.11.4.10 — Finalize Persistence Root Fix

UPLOAD ONLY
- js/session.js
- js/cloud-workspace.js
- index.html

NO SQL.

ROOT CAUSE
Finalize was synchronizing only the Active Order Manifest. The separate full
Cloud Workspace compatibility snapshot retained finalized Orders/statistics.
Reset Current Workspace removed the symptom because its server reset clears
both stores.

ROOT FIX
Finalize now synchronizes BOTH current-workspace authorities from the same
post-finalize runtime state. Finalizing the last Order explicitly persists an
empty Current Workspace and empty operational session.

RECAPPED COMMIT
Subject: Fully persist finalized workspace
Description: Synchronize both Active Order Manifest and full Cloud Workspace
after selected-order finalization, including explicit empty-state persistence
when the last active order is finalized.
