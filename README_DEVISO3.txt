PharmFlow DEVISO3 — Authentication Boundary Root Fix

TARGET
pharmflow-dev (B) ONLY. Never upload these files to Production A.

CONFIRMED FAILURE
Test 01 could authenticate on the B URL and its operational workspace rendered.
DEVISO1 guarded mutations but did not stop non-DEV tenant bootstrap/hydration.

ROOT CAUSE
The environment policy was installed only around write RPCs.
Auth accepted any valid pharmacy context, published auth:context-ready and allowed
the application to hydrate/render that pharmacy.

ROOT FIX
1. Validate the authenticated pharmacy immediately after get_my_app_context.
2. For any pharmacy other than DEV001:
   - do not copy account context into AppState;
   - do not publish auth:context-ready;
   - do not start/hydrate the application workspace;
   - clear any existing runtime operational state;
   - keep the auth gate locked;
   - show an explicit DEV Safety Block with Sign Out.
3. DEV001 continues normally.
4. Existing mutation guards and Global GTIN read-only rules remain as defense-in-depth.

AUTHORIZED DEV TENANT
Code: DEV001
Pharmacy ID: ffcac9ca-dfca-4344-9490-a77dcdba9d01

UPLOAD ONLY
- js/auth.js
- js/dev-isolation.js
- index.html

NO SQL.

VERIFICATION
A. Sign in to B with Test 01:
   Expected: DEV Safety Block. Dashboard/Orders/Receiving data must NOT render.
B. Sign out and sign in to B with dev001@gmail.com:
   Expected: PharmFlow Dev dashboard loads normally.
C. Global GTIN remains readable but not editable from DEV Admin.

RECAPPED COMMIT
Subject: Enforce DEV auth boundary
Description: Block non-DEV pharmacy contexts before AppState, cloud hydration,
or rendering while retaining write guards and Global GTIN read-only protection.
