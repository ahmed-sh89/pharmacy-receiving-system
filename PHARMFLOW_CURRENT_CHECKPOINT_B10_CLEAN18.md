# B10 Clean18 — RPC Read Gates
Status: IMPLEMENTED — REQUIRES USER VERIFICATION

Supabase logs after Clean17 still showed the legacy 1s/3s request fingerprint. Clean18 moves de-duplication to the canonical cloud-read functions, so any startup, foreground, UI, or legacy caller must pass through the same gates.

Acceptance test: one Project B tab, refresh once, no interaction for 30 seconds. Supabase logs must no longer show transaction reads every second or Manifest/Generation full reads every 3 seconds.
