# Decision Register — B10 Clean17

1. Supabase remains authoritative.
2. Startup authority has exactly one in-flight owner; concurrent callers reuse it.
3. Background polling must not race initial authority hydration.
4. Local persistence heartbeat is not evidence of a cloud data change.
5. Compatibility cloud snapshot writes require a changed workspace signature.
6. Immediate transaction writes and Active Order structural writes remain unchanged.
