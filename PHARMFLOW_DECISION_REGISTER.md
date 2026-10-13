# Decision Register — B10 Clean17

1. Supabase remains authoritative.
2. Startup authority has exactly one in-flight owner; concurrent callers reuse it.
3. Background polling must not race initial authority hydration.
4. Local persistence heartbeat is not evidence of a cloud data change.
5. Compatibility cloud snapshot writes require a changed workspace signature.
6. Immediate transaction writes and Active Order structural writes remain unchanged.

## 2026-10-13 — Expiry Scan Round 1 and deferred Inventory filter

Approved Scan presentation replaces five cards with only current authenticated session Items Scanned and Total Quantity in a compact header; underlying definitions are unchanged. Session receipt rows remain individual captures, displaying only their actual persisted serial. No multi-serial inference, quantity-based serial count or schema change.

Approved next Inventory refinement: hierarchical Year → January–December selection supporting multiple months across multiple years. Deferred until Product Owner accepts Scan Round 1. Inventory filters/selection/Resolve/Restore and printed shelf checkbox are unchanged in Round 1.


## 2026-10-13 — Expiry Round 2

Two top-level workspaces; Review outside tabs. Batch-centric session projection retains raw serials. All group mutations disabled until separately approved atomic membership-validated server correction. Inventory Year→months remains deferred.
