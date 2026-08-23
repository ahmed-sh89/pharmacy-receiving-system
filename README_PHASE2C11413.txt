PharmFlow Phase 2C.11.4.13 — Production Sign-In Speed Restore

TARGET
Production A only. Do not upload this to pharmflow-dev unless intentionally
synchronizing the old baseline later.

UPLOAD ONLY
- js/auth.js
- index.html

NO SQL.

PURPOSE
Remove the 2–3 second blocking delay introduced by the unsuccessful anti-flash
auth-gate changes.

The stale flash is intentionally left as a separate issue; this patch restores
fast Sign In without changing Receiving or data logic.

RECAPPED COMMIT
Subject: Restore fast production sign in
Description: Revert blocking auth reveal so Dashboard opens immediately while
workspace synchronization continues in the background.
