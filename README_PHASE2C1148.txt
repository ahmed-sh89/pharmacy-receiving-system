PharmFlow Phase 2C.11.4.8 — Authoritative First Render

UPLOAD ONLY:
- js/state.js
- js/app.js
- index.html

NO SQL.

This fixes the remaining sign-in flash at its true source:
initializeState() was still loading stale browser workspace before the UI and
before Supabase authority.

The new startup sequence is:
AUTH -> EMPTY RUNTIME -> AWAIT SUPABASE AUTHORITY -> ROUTER/UI FIRST RENDER.

RECAPPED COMMIT
Subject: Make first render server authoritative
Description: Prevent local workspace persistence from rendering before
Supabase Active Order authority during initial startup and same-tab sign-in.
