PharmFlow Phase 2C.11.4.12 — Auth Gate Atomic Reveal Root Fix

UPLOAD ONLY:
- js/auth.js
- index.html

NO SQL.

CONFIRMED BUG
renderAuthState() was removing the login overlay immediately after authentication,
before unlockApplicationAfterAuth() completed cloud workspace hydration.

FIX
Only unlockApplicationAfterAuth() may reveal PharmFlow, after hydration is complete.

ONE-TIME AFTER DEPLOYMENT
Ctrl + Shift + R

RECAPPED COMMIT
Subject: Keep auth gate until workspace ready
Description: Remove the competing early auth-overlay reveal from renderAuthState
so the application becomes visible only after server-authoritative hydration.
