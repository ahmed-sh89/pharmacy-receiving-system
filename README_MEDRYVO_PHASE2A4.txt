MEDRYVO — PHASE 2A.4 NEUTRAL AUTH BOOT STATE

Problem:
Ctrl+Shift+R / hard reload could briefly display "Complete access" for a valid
Owner/Admin. The stored Supabase session was restored before pharmacy/role
context had finished loading, so an intermediate access decision was rendered.

Fix:
- Medryvo now starts in a neutral "Preparing Medryvo" state.
- Login and Complete Access panels are physically hidden while auth is resolving.
- initializeAuth() no longer renders an access decision for a stored session.
- bootstrapMedryvo() finishes pending access + pharmacy context first.
- Only after context is resolved can renderAuthState() show:
    * Dashboard for valid access
    * Complete Access for a genuinely unassigned account
    * Sign In for no session
- Keeps Phase 2A.2 sidebar-state fix.
- Keeps Phase 2A.3 default Dashboard-after-sign-in fix.

Files to upload:
- index.html
- js/auth.js
- css/auth.css

No SQL changes.
No Supabase changes.

Suggested commit:
Phase 2A.4 - Add neutral auth boot state and remove Complete Access flash

Test:
1. Upload all 3 files in one commit.
2. Deploy and hard refresh.
3. While signed in as OWNER, press Ctrl+Shift+R several times.
4. "Complete access" must never flash.
5. Repeat while signed in as ADMIN.
6. If loading is visible at all, only "Preparing Medryvo" may appear briefly.
7. Sign Out still shows normal Sign In.
