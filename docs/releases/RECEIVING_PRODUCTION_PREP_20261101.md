# Receiving release preparation — 1 November 2026

PREPARATION ONLY. BLOCKED FOR PRODUCTION DEPLOYMENT. No migration, operational write, deployment or main merge authorized or performed.

Remote main verified through GitHub and fetch: `4978f12e9daf92eb60205e140583b0e3aa758f49`.
Accepted Staging candidate: `f5896709dd458a094193c83e69f5a7e1442a51d4`.
Release branch: `release/receiving-approved-prep-20261101`.

## Included

- Scoped single-flight startup/Manifest/ledger hydration, explicit readiness and recoverable reconnect while retaining same-identity Receiving display; authorization/actions remain fail-closed.
- Update Order using internal Excel order identity, source/version audit, quantity-preserving reconciliation, compact confirmation, progress and uncertain-write read-back.
- Shared distinct-item Extra KPI/modal projection including Unassigned; no receipt duplication. Existing same-pharmacy validated exceptional correction and uniquely eligible Unassigned assignment after a revision.
- Persistent explicit Unassigned capture, unknown-item Unassigned default, immediate receipt/KPI synchronization, original receiving allocation priority unchanged.
- Previously accepted Order Items toolbar/typography, correction modal corporate styles and update-notification lifecycle.
- Required auth/password-gate revalidation, Handheld readiness, Needs Review Unassigned attribution and two report filters excluding Unassigned from assigned order totals. No email-report layout changes.

Application JS/CSS are byte-identical to the accepted candidate. Only index script query versions change additionally for existing browser caches. No new application behavior introduced by this release preparation.
Excluded from the diff: Staging build/binding/transport helpers, acceptance SQL against live Staging, uploaded synthetic workbooks, synthetic operational records, Expiry implementation, email-report redesign and obsolete incident checkpoint history. In-memory synthetic unit/SQL fixtures are tests only and excluded by the Pages runtime artifact allowlist.
Production configuration/CSP/Supabase URL and Vercel main-deployment block remain unchanged.

## Required database changes — NOT APPLIED

Read-only Production catalog inspection confirms the existing generation, Manifest, orders, source-items, compatibility workspace and receiving ledger tables/columns exist, along with append_pharmflow_receiving_action_v4 and save_pharmflow_order_source_items_v2. The three new RPCs and private operations table are absent.

Apply only after separate explicit database/release approval, in this order:

1. `20261030185516_receiving_revisions_and_allocation.sql`: private RLS audit/idempotency table; revision RPC and internal compensating allocation implementation.
2. `20261030190938_receiving_allocation_active_source_guard.sql`: restrict allocation to active current source boundaries.
3. `20261031010759_receiving_extra_batch_correction.sql`: validated Extra/Unassigned batch RPC; revoke direct authenticated allocation access.

Review/apply all three as ONE transaction with no intermediate committed exposure. The first file temporarily grants the general allocator; the last revokes it. Do not deploy frontend before final contracts/ACLs are verified. These additive DDL definitions do not backfill or correct existing receipts. Runtime operations create audited compensating entries and preserve physical quantity/provenance. Do not run tests/receiving-recovery-staging.sql against Production.

Before approved execution recheck main/schema drift, capture exact DDL/ACL before-state, serialize rollout and verify final authenticated/anonymous grants, RLS/tenant denial and RPC signatures. Use an approved isolated acceptance identity only; no exploratory pharmacy writes. Existing original receiving data and incident corrections are not part of this release.

Rollback: revert release code through reviewed PR/Pages process. Before first use, an approved DB rollback may remove only new unused definitions. After use, retain audit/compensating rows; do not drop audit history or reverse receipts as a code rollback. Separate guarded data recovery is required for any operational correction.

## Verification

Release extraction: 114 focused tests PASS, 2 optional external supplier-workbook cases SKIP; 62 existing required CI-source checks PASS; npm run build PASS. Some overlap exists between the two test groups; counts are not a unique combined total. SQL tests run in local PGlite, not Production.

Historical-only regression comparisons referencing unpushed local Staging SHAs were removed from two test harnesses; current behavior assertions remain. The report-cache test expects the new release version. Required PR workflow now includes focused Receiving tests and full git history for its existing baseline comparisons. No deploy workflow changed.

Accepted Staging live evidence: isolated Unassigned5 -> revised Ordered5/Received5 -> Extra0, original receipt preserved with net-zero correction pair, UI and DB agree after refresh. Named owner fixture had already been manually allocated; item1053331 remains6, no correction authorized/performed. Do not claim that receipt is1. Synthetic records remain untouched by this preparation.

CI status is reported from the final PR, not inferred from local tests. Promotion gate: reviewed PR/green required CI, explicit guarded database and Production deployment approval, final schema/ACL validation, then controlled Pages rollout and served-SHA/Production-binding smoke verification. Keep this PR draft until the gate is met.
