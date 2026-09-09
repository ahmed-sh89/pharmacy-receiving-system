# Project A receiving authority hotfix — local verification

Baseline: `c4e3d97a7db4094885624ec074aa36f3284de0bc` (initially clean).

Run from Project A with Node:

```text
node tests/receiving-authority-evidence.mjs --before
node tests/receiving-authority-evidence.mjs
node tests/receiving-authority-postfix.mjs
```

These VM tests use synthetic accounts, in-memory storage, mocked RPCs, disabled
timers and a forbidden real fetch. They never start the browser application.
Expected network-error/session-ended messages exercise legacy status handling.

Adapted from the tested uncommitted Project B reference without modifying B.
A loads root `supabase.js` and `js/ui.js`. Its existing v2 ledger endpoint and
5000-row limit remain; no delta endpoint, cursor, polling redesign or SQL was
ported. Empty/smaller responses are tested against A's actual merge path.

The baseline manifest control reproduces A's additional false-zero projection;
the harness then rebuilds its fixture to isolate the subsequent snapshot rollback.
Baseline receiving: 11 -> 0 -> 0. Corrected: 11 -> 11 -> 11; negative control 9.
The inherited stress fixture checks 1000 transaction IDs with 11 total units.
An additional test checks 1000 actual units and IDs across empty/smaller responses.
Normal and stress authority RPC sequences both decrease from 6 to 4 in A.
The extended suite passes 29 checks, including A's app and handheld readiness.

Self-review covered all six runtime files. A's scheduler functions, polling
intervals and idle guards were compared with baseline and preserved. No quantity
maximum workaround was introduced. B-only UI/lifecycle changes were not ported.

This is local mock evidence, not live hardware/backend/deployment verification.
The existing 5000-row read cap cannot reconstruct unseen older evidence on a fresh
device. Startup fails closed when required authority is unavailable.
The delayed-append lifecycle race remains unresolved: Reset, Finalize, REMOVE,
Reopen, order deletion and new/replacement uploads remain operationally frozen.
