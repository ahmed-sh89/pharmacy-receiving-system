MEDRYVO — FINAL AUTH UI PATCH

Implemented:
- Final approved full-screen blue Medryvo authentication design.
- Minimal brand only: logo + Medryvo + PHARMACY OPERATIONS PLATFORM.
- Removed the old marketing paragraph and the three feature bullets.
- Compact vertical white form card.
- Responsive layout for PC, tablet and Zebra/Android.
- Owner Back to Sign In button remains visible.
- Browser Back now returns through Medryvo auth screens before leaving the site.
- Existing Supabase/auth form IDs and RPC behavior are preserved.
- Favicon remains the Medryvo logo.

Suggested GitHub commit:
Phase 1 - Final Medryvo auth design and browser back navigation

TEST AFTER DEPLOY:
1. Ctrl+Shift+R.
2. Confirm only logo/name/tagline remain on left.
3. Open Register a New Pharmacy and press browser Back -> returns to Sign In.
4. Open First system setup and press browser Back -> returns to Sign In.
5. Confirm the in-page Back to Sign In button also works.
6. Check scrolling on the Owner form.
7. Test on Zebra before creating the System Owner.
