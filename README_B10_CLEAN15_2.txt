PharmFlow B10 Clean15.2 — Handheld Root Fix + Workspace Status
2026-09-02

Scope: Project B / pharmflow-dev ONLY. Do not deploy to Project A.

Root cleanup / fixes:
1. Removed destructive background-auth behavior: a failed token refresh during scan/sync no longer clears a valid UI session or routes the Handheld to Sign In. Explicit Sign Out remains the session-clearing path.
2. Handheld authentication boot no longer routes through the desktop Dashboard first, preventing the temporary all-zero KPI screen before Handheld initialization.
3. Receiving header now exposes authoritative workspace state: SYNCING WORKSPACE, CONNECTED + Active Order count, CONNECTED + NO ACTIVE ORDERS, or OFFLINE/RECONNECTING.
4. Workspace refresh owns one explicit loading state and clears it in finally, so UI status follows actual hydration rather than placeholder data.
5. Preserves Clean15 adaptive RPC/Egress synchronization. No SQL changes.

Acceptance test:
- Sign in on Handheld after PC Reset Current Workspace + upload 2 orders.
- No temporary desktop zero-KPI dashboard should appear.
- Enter Receiving: header should settle on CONNECTED · 2 ACTIVE ORDERS.
- Perform 30 consecutive scans at normal working speed.
- Handheld must remain in Receiving and must not show Sign In.
- Verify all scans and quantities on PC and Handheld.
- Verify Manifest/REMOVE behavior remains correct.
