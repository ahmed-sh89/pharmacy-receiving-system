MEDRYVO — PHASE 1L RECOVERY DOM ISOLATION

This fix was made from the FULL CURRENT GitHub project ZIP supplied by the user.

Root fix:
- The Set New Password form is no longer present in the rendered page during
  normal login at all.
- It is stored inside an HTML <template>, which browsers do not render.
- The form is mounted into the DOM only when the CURRENT URL is a genuine
  Supabase password-recovery URL.
- After recovery, normal login, or Sign Out, the recovery form is physically
  removed from the DOM.

This makes a recovery-form flash during normal Sign In structurally impossible,
rather than relying only on hidden/CSS/state timing.

Files to upload:
- index.html
- js/auth.js
- css/auth.css

Suggested commit:
Phase 1L - Isolate recovery form from normal login DOM

No SQL changes required.
