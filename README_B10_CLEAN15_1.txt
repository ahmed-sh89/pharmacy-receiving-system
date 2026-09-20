B10 Clean15.1 — Handheld Session Regression Root Fix

Scope
- Project B / pharmflow-dev only.
- No SQL changes.
- No Receiving UI/business-flow changes.
- Keeps Clean15 adaptive RPC/Egress scheduler intact.

Root cause fixed
Rapid Handheld scans can overlap several authenticated RPCs. Near JWT expiry,
multiple callers could enter refreshAuthToken() concurrently using the same
rotating refresh token. One request could refresh successfully while a second
losing request failed and cleared AuthState/localStorage, forcing the Handheld
back to the Sign In gate.

Fix
- Single-flight refresh promise: one token refresh per browser page at a time.
- Concurrent RPC callers await the same refresh result.
- Adopt a newer same-origin stored session if another context refreshed first.
- Do not destroy a valid stored session on transient network/server refresh errors.
- Only explicit terminal refresh-token rejection locks the app for Sign In.
- Cache-bust auth.js as B10CLEAN15_1.

Hard non-regression
- Clean15 adaptive polling / Egress reduction preserved.
- Receiving writes remain immediate.
- PC <-> Handheld synchronization unchanged.
- Active Order Manifest / REMOVE unchanged.
- Supabase remains authority.

Post-deploy test
1. Hard refresh/close+reopen Project B on Handheld and PC.
2. On Handheld, perform 20-30 consecutive scans at normal fast scanner speed.
3. Confirm scanner remains on Receiving and does not show Sign In.
4. Confirm quantities synchronize to PC.
5. Scan on PC and confirm Handheld receives the delta.
6. Keep Project A untouched.
