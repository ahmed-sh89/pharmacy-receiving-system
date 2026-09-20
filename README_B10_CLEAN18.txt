PharmFlow B10 Clean18 — Canonical RPC Read Gates

Root cause confirmed from Supabase request fingerprint: callers outside the adaptive scheduler could still invoke the same cloud read functions and recreate 1s/3s bursts.

Changes:
- Enforced read de-duplication at the RPC-owning functions themselves.
- Transaction delta reads: minimum 2.5s between underlying RPC starts.
- Full Active Order Manifest reads: minimum 10s unless explicitly forced.
- Workspace generation reads: reuse known generation for 30s unless explicitly forced.
- Gates reset on authenticated account-context change.
- Preserves Clean16 adaptive scheduler and Clean17 startup/dirty-save behavior.
- No Auth, quantity, UI, SQL, schema, or Project A changes.
