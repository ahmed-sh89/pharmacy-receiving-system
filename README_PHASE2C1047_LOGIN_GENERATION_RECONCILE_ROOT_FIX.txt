PHARMFLOW PHASE 2C.10.4.7
LOGIN GENERATION RECONCILIATION ROOT FIX

STATUS: READY FOR TEST

OBSERVED DEFECT
Immediately after sign-in, repeated:
Active Orders cloud save failed: STALE_WORKSPACE_GENERATION

ROOT CAUSE
The client could emit files:updated during sign-in before its current
workspace_generation had been reconciled with Supabase. The Active Order
Manifest save then used the previous generation, and the server generation
fence correctly rejected it. The defect is login sequencing, not receiving sync.

ROOT FIX
- Add loginAuthorityReady gate.
- Reconcile workspace generation before Active Manifest hydration.
- Pull/restore server Active Manifest before enabling structural writes.
- Reconcile generation once more to close a concurrent Reset race.
- Ignore active-manifest/server-authority-empty events as write triggers.
- Re-check readiness after files:updated debounce.
- Gate focus/visibility authority reconciliation during login bootstrap.
- Cache-bust deployed assets to v=2C1047.

NON-REGRESSION
- No SQL migration.
- Phase 2C.10.4.6 Historical Delete remains unchanged.
- Receiving Transaction Ledger unchanged.
- Verified PC↔PC and PC↔Handheld scan sync unchanged.
- Global GTIN and Returns Archive unchanged.

TEST
1. Deploy and hard refresh.
2. Sign out, then sign in.
3. No STALE_WORKSPACE_GENERATION toast.
4. Existing Active Order restores.
5. Wait 10 seconds; no delayed stale toast.
6. Refresh once; order remains and no stale toast.
7. One controlled scan must still synchronize PC↔PC/Handheld.

RECAPPED COMMIT SUBJECT
Fix stale generation on login

EXTENDED DESCRIPTION
Phase 2C.10.4.7
- Reconcile generation before any sign-in Manifest write
- Gate structural cloud writes until server authority is ready
- Ignore server hydration events as write triggers
- Close focus/visibility authentication race
- Preserve verified receiving/Handheld synchronization
- No SQL migration required
