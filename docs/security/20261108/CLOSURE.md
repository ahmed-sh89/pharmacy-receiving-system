# Security Release #47 — Production closure

Date: 8 November 2026 (Asia/Riyadh). **CLOSED — USER VERIFIED**.

This records Product Owner acceptance of the deployed approved remediation release. It does not certify a vulnerability-free application or close ongoing security maintenance.

## Deployment evidence retained

- [PR #47](https://github.com/ahmed-sh89/pharmacy-receiving-system/pull/47): approved head `0ba04efc5f2272ef6f496914693c31f130a2c6b2`; Production release SHA `76a14f0f77c55bea8e6df76a5695f428ab1ccfbb`.
- Production Supabase `zznoshzcyxmtwfbznjyr`; two approved migrations/history atomically applied in order: `20261108123709_security_session_boundaries.sql`, `20261108124636_security_live_session_request_gate.sql`.
- Approved password-admin and settings-rc Edge sources deployed as v8/v6 with JWT enforcement. Exact release hashes remain in release-hashes.json.
- Official [Pages run 42492205460](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42492205460) SUCCESS; served release SHA verified in the execution session.
- Prior scoped automated evidence remains unchanged in verification.json and ASSESSMENT.md. Those files describe the pre-release baseline and test limitations, not a new whole-system test.
- Detailed execution checkpoint: Library `libfile_79dcbcea4ee88191a3636432faf816e5`; prechange snapshot `libfile_597feb9428308191ae36f32a7006195c`. Their earlier OPEN status is superseded by this explicit owner acceptance.

## Product Owner manual acceptance

**USER VERIFIED — PASS — 8 November 2026**, explicitly confirmed by Product Owner:

| Operational check | Result / verifier |
|---|---|
| Login and persistence after Refresh | PASS — USER VERIFIED |
| Receiving, Orders and Reports read-only loading | PASS — USER VERIFIED |
| Expiry inventory read-only access | PASS — USER VERIFIED |
| Duty read-only access | PASS — USER VERIFIED |
| Administrator access according to account permissions | PASS — USER VERIFIED |
| Logout then Refresh requires authentication | PASS — USER VERIFIED |

Agent-authenticated UI checks remained blocked by Session Paused and were not retried. Owner acceptance establishes operational behavior only; comprehensive penetration testing, cross-pharmacy isolation, independent token-revocation verification, physical Zebra and multi-PC testing are not newly claimed.

## Data protection and residuals

Release-time transaction assertions verified preservation across 78 tables and intended function/permission boundaries. Later legitimate concurrent Handheld Expiry captures were identified and left intact. No operational data was modified in this documentation task, and no database or deployment checks were repeated.

| Finding | Continuing classification |
|---|---|
| SEC-005 | ACCEPTED RISK — CSP/framing limitations |
| SEC-006 | PARTIALLY VERIFIED — comprehensive leaked-password screening |
| SEC-013 | VENDOR DEPENDENCY — Supabase PostgreSQL security patch/backport confirmation |

Other reconciled SEC findings retain their existing scoped closure/remediation evidence. No confirmed unresolved Critical/High issue was established in the reviewed release scope. Actual backup restoration remains untested; no restore or paid infrastructure was initiated.

## Documentation delivery

Checkpoint, changelog, this closure and the assessment status notice are the complete change scope. Merge only through the existing protected PR workflow after required checks pass. A subsequent documentation main SHA does not replace the recorded security release SHA. Existing automatic Pages workflow may publish the documentation merge with its own version stamp; no manual redeployment or release replay is required.

Development may continue under the existing scoped approval and non-regression rules; maintain residual risks separately.
