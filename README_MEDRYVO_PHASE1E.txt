MEDRYVO — PHASE 1E LOGIN UX

Changes:
- Fixes Forgot Password redirect explicitly to:
  https://ahmed-sh89.github.io/pharmacy-receiving-system/
- Adds Show / Hide password controls.
- Adds Remember email on this device.
- Medryvo stores ONLY the email address in localStorage.
- Password is never stored by Medryvo.
- Browser password managers may save/fill passwords through standard autocomplete attributes.
- Adds a friendly message for expired/invalid recovery links.

Suggested commit:
Phase 1E - Fix recovery redirect and improve login credentials UX

No SQL changes required.
