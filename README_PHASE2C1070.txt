PHARMFLOW 2C.10.7.0 — HANDHELD + LIFECYCLE STABILIZATION

UPLOAD/REPLACE ALL FILES IN THIS ZIP AT THEIR MATCHING PATHS.
No SQL migration is required.

Modified production files:
- index.html
- css/dashboard.css
- js/handheld-runtime.js (NEW)
- js/orders.js
- js/session.js
- js/auth.js

Important: keep existing scanner.js / receiving.js / expiry.js from the uploaded GitHub source. The new runtime owns only the Handheld hardware boundary and routes into those existing business resolvers.

RECAPPED COMMIT SUBJECT
Stabilize handheld lifecycle

EXTENDED DESCRIPTION
Phase 2C.10.7.0
- Add one clean Handheld scan runtime for Receiving and Expiry
- Prevent competing legacy scan handlers on Handheld
- Add truthful ready/processing/blocked scanner state
- Restore automatic session termination handling
- End live session before PC sign-out
- Clear Current Workspace after Finalize without Reset
- Refresh historical Archive/Reports after verified deletion
- Preserve Global GTIN, Returns Archive and Expiry Workers
- No SQL migration required
