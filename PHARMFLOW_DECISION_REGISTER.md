# Decision Register — B10 Clean17

1. Supabase remains authoritative.
2. Startup authority has exactly one in-flight owner; concurrent callers reuse it.
3. Background polling must not race initial authority hydration.
4. Local persistence heartbeat is not evidence of a cloud data change.
5. Compatibility cloud snapshot writes require a changed workspace signature.
6. Immediate transaction writes and Active Order structural writes remain unchanged.

## 2026-10-17 — Global Master Group integrity
1. Use exactly six Groups. Store `HomeHealth`; display `Home Health` consistently.
2. Require Group only when creating a genuinely new Global Item. Existing-item linking and Needs Review remain Group-free.
3. Normalize category fallback only when it exactly validates as an approved main Group. Preserve subordinate category fields.
4. Preserve `PFTEST002` and `PFTEST003` unresolved. The Product Owner confirmed National Day Gift Card `9999982` was intentionally deleted through Settings; it is absent and excluded from classification. Do not restore, reclassify, or investigate its deletion further unless a new material integrity issue appears.
5. Gate B code may be prepared locally. Production SQL and app release each require separate explicit approval.
