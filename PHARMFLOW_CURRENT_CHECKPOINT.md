# PharmFlow current checkpoint — 28 October 2026

PARTIAL STAGING DELIVERY. Implemented scope READY FOR USER TEST on the verified Preview. Production unchanged; no merge/promotion authorized.

Production baseline main: `08843e42399b8830af6f0eb0773f04e0269cf0b6`. Owner reports October 28 security release USER VERIFIED for tested workflows. Preserve SEC-007 and both password handlers, Pages runtime allowlist and Vercel main deployment block.

Branch: `feature/consolidated-staging-20261028`. Staging database: `tovkcakucyagvbzvlnks`; Production `zznoshzcyxmtwfbznjyr` read-only. Preview URL/commit: see [deployment record](docs/staging-20261028/DEPLOYMENT.md).

Implemented: PERF-001 report classification once per pass/shared indexes, historical search before sorting, restored-auth redundant public request removed; UX-001 safe same-scope revalidation without a blank view and simplified text; OWNER-002 Owner-only paginated two-sheet Excel export; UI-001 compact Access action CSS. OWNER-001 already supports administrative code editing with unchanged pharmacy UUID; HHP084 protected.

OPEN: DATA-001 needs stable item identity, pharmacy-scoped tombstones and coordinated resolver/cache changes; no delete change made. EXPIRY-SAVE-001 two separate committed saves observed, but prolonged client Saving root cause unproven; real Staging same-operation retry remained quantity 1, all fixtures rolled back. No real Azinc changes.

Staging migration: `20261028012722_owner_global_items_export_v1` (one read-only RPC, Owner/live-session guarded). No Production migration, Edge deployment, operational write or Auth configuration change.

Measured local CPU: Receiving Report 906.63 → 9.66ms (400 items/2 orders, identical output); historical search 301.91 → 79.09ms (30,000 transactions). Controlled public setup step 40.56 → 0.25ms with a 40ms simulated response. These are not pharmacy-PC/browser/network benchmarks or full startup timing.

Verification/limitations: [implementation and test evidence](docs/staging-20261028/IMPLEMENTATION.md). Actual Staging master export 16 items/21 identifiers; >1,000-row rollback paging test passed. Existing baseline test failures remain documented. Browser signed-in/visual, physical TC26, real multi-PC sync and full Production performance acceptance are not certified.

Next: test only the implemented scope on the verified authenticated Staging app. Keep DATA-001 and Azinc incident OPEN. Preserve order-source versus receiving quantities, historical identities/FKs, scoped permission revocation, capsule design and approved handheld scan/focus behavior. Do not promote to Production without a later explicit approval.

Previous checkpoint retained at [archive](docs/staging-20261028/PREVIOUS_CHECKPOINT.md).
