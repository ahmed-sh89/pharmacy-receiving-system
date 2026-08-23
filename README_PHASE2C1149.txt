PharmFlow Phase 2C.11.4.9 — Atomic Auth Reveal Root Fix

FULL TRACE FINDING
The stale 328 / 956 flash was not a new localStorage/cloud hydration.
auth.js removed authLocked and hid authGate before asynchronous account/cloud
hydration. That exposed the already-mounted Dashboard DOM from the previous
signed-in runtime. Only afterwards did reconciliation replace it.

ROOT FIX
- unlockApplicationAfterAuth() is asynchronous.
- Authentication cover remains visible while startApplication() performs the
  existing server-first hydration.
- No direct fire-and-forget restore calls remain in the reveal path.
- Dashboard is revealed once, only after authoritative state is ready.

UPLOAD ONLY
1. js/auth.js
2. index.html

NO SQL.

TEST
Sign Out -> Sign In.
Expected: auth/loading cover remains until ready, then Dashboard appears directly
with current authoritative values. Old 328 / 956 must never be visible.

RECAPPED COMMIT
Subject: Reveal app after cloud hydration
Description: Keep the authentication gate over PharmFlow until the complete
server-authoritative workspace hydration finishes, eliminating stale dashboard
flash during sign-in.
