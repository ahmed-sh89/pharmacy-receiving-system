MEDRYVO — PHASE 1D PASSWORD RECOVERY

Changes:
- Recovery email links now open a dedicated Set a New Password form.
- Uses the Supabase recovery access token from the URL.
- Updates password through /auth/v1/user, never by editing auth.users directly.
- Signs out the temporary recovery session after password change.
- Adds Forgot Password? to Sign In.
- Keeps the approved responsive no-scroll auth design.

No SQL is required.

Commit: Phase 1D - Add secure password recovery flow
