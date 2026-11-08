# PharmFlow current checkpoint — 8 November 2026

## Current Staging task — startup and Handheld

Production main inspected: `cbd249427dbe8a0acfd6426ef8eede2f2f4e5f29` (unchanged remotely). Dedicated branch: `fix/startup-handheld-staging-20261108`.

- Device persistence root cause verified and fixed; shared early/runtime policy ignores legacy automatic flags on Windows, preserves explicit selection and Zebra/Android fallback. Automated classification passes; actual Windows/DevTools and physical Zebra acceptance remain pending.
- One redundant registration read removed from bootstrap only. Controlled 60 ms/response component comparison saves one round trip (~121 → 61 ms). Full reported 30–60 second startup cause and live before/after totals remain **NOT VERIFIED / OPEN**.
- Verification: 19 new focused/build-fence tests and 255 relevant regression tests PASS. Historical full suite is not green; do not equate scoped passing tests with full-suite success.
- Exact-branch Vercel Preview binds Staging `tovkcakucyagvbzvlnks`; read-only startup timing panel is Preview-only. No Production deployment, merge, backend changes or operational test writes.
- Next: owner tests exact Preview on Windows and Zebra, captures startup timings with empty/active synthetic orders and repeated reload/logout; continue diagnosis from measured spans. No USER VERIFIED/DONE claim and no Production promotion authorization.

[Scope, source trace, evidence and manual matrix](docs/startup/20261108/RESULTS.md). Prior Security Release #47 acceptance below remains intact.

Security Release #47: **CLOSED — USER VERIFIED**. Approved remediation deployed and operationally accepted; continuing security maintenance remains separate. This is not comprehensive security certification.

## Production state

- Repository: ahmed-sh89/pharmacy-receiving-system; Production Supabase: zznoshzcyxmtwfbznjyr. Staging remains isolated.
- Approved PR #47 head: `0ba04efc5f2272ef6f496914693c31f130a2c6b2`.
- Verified release main/runtime SHA: `76a14f0f77c55bea8e6df76a5695f428ab1ccfbb`. The subsequent protected documentation merge has its own main SHA; it does not change application source.
- Applied atomically with corresponding migration-history records: `20261108123709_security_session_boundaries.sql`, then `20261108124636_security_live_session_request_gate.sql`. Exact source/readback and preservation assertions passed in the release session; not repeated here.
- Edge: pharmflow-password-admin **v8**, pharmflow-password-admin-settings-rc **v6**; approved sources and JWT enforcement verified during release.
- PR #47 merged through protection; official GitHub Pages [run 42492205460](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42492205460) **SUCCESS**. No release replay.

## Acceptance and verification boundaries

**USER VERIFIED — PASS — 8 November 2026:** login; session persistence after Refresh; read-only Receiving, Orders, Reports, Expiry, Duty and Administrator access according to account permissions; logout followed by Refresh requiring authentication. This explicit Product Owner acceptance resolves the operational acceptance blocker. Agent-authenticated UI testing remained blocked by Session Paused; it is not relabeled AGENT VERIFIED.

Prior scoped automated evidence retained: consolidated 316 PASS / 0 FAIL / 3 SKIP; affected SQL 13 PASS overlaps; Staging SQL 11 assertions and 9 HTTP checks per endpoint PASS. Full historical suite was not green: 75 observed baseline failures reproduced on unchanged baseline. No completed tests rerun for documentation.

Manual acceptance is operational only: no comprehensive penetration test, cross-pharmacy isolation test or independent token-revocation proof. Physical Zebra and multi-PC acceptance is not newly claimed. Backup availability was verified before release; actual restoration was not tested.

## Residual risks

- SEC-005 — ACCEPTED RISK: CSP/framing limitations.
- SEC-006 — PARTIALLY VERIFIED: comprehensive leaked-password screening.
- SEC-013 — VENDOR DEPENDENCY: Supabase PostgreSQL security patch/backport confirmation.

Prior SEC-001/002/003/004/007/008/009/010/011/012 protections remain within their documented verification boundaries. No confirmed unresolved Critical/High issue was established in the reviewed release scope; no vulnerability-free claim.

## Preservation and next action

Documentation task modifies only checkpoint, changelog and security documentation. No application code, migrations, Edge Functions, Auth configuration, security rules or operational data changed. Migration-time fingerprints across 78 tables passed during release; later legitimate concurrent Handheld Expiry activity is preserved, not reversed.

Current development readiness: approved security release complete; ready for the next explicitly scoped development task. Track the three residual risks separately. Preserve Receiving, Expiry, Duty, pharmacy isolation, persistence, exports, synchronization and handheld workflows. Do not replay this release.

Detailed closure and retained release evidence: [security closure](docs/security/20261108/CLOSURE.md).
