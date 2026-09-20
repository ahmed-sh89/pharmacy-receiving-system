PharmFlow DEVISO2 — Fast Sign-In Restore

TARGET: pharmflow-dev only.

ROOT CAUSE
The Dev repository was forked before Production Phase 2C.11.4.13.
Therefore it still contained the blocking 2C.11.4.12 authentication flow that waits for full cloud hydration before showing Dashboard. This is why Dev Sign In took about 6 seconds. DEVISO1 isolation itself was not the cause.

CHANGE
- Restore the verified fast authentication reveal behavior from Production A 2C.11.4.13.
- Keep DEVISO1 tenant hard isolation unchanged.
- Keep Global GTIN read-only in Dev.
- Cache-bust auth.js in index.html.

UPLOAD ONLY
- js/auth.js
- index.html

NO SQL.

TEST
1. Upload to pharmflow-dev only.
2. Hard refresh once.
3. Sign Out -> Sign In with dev001@gmail.com.
4. Dashboard should open promptly while background sync continues.
5. Confirm account shows PharmFlow Dev / DEV001.

Recommended Commit: Restore fast Dev sign in
