# Selective Production preparation — refreshed 28 October 2026

**PREPARED ONLY — NOT DEPLOYED.** The repeated-fingerprint server scalability blocker from commit `232f7fe` is resolved by the V2 refinement. The new export and three UI refinements are READY FOR USER TEST on Staging; they are not yet Product Owner accepted. Production-sized Windows/browser readiness and later explicit Production approval remain gates.

Production main stays `08843e42399b8830af6f0eb0773f04e0269cf0b6`; no Production write/migration/Auth/Edge/deployment or merge. Preserve the original five USER VERIFIED Staging improvements. Latest implementation/measurements/limitations: `docs/staging-final-20261028/IMPLEMENTATION.md`. The preparation branch contains the same refined runtime but excludes Vite's Staging binding and the applied Staging migration-history file.

## Included / excluded

Include accepted Reports/search/filter/performance, startup/revalidation behavior, compact Access actions and Owner export, plus V2 consistency/streaming correction, Export Data placement, Loading text and Administrator presentation mapping. Capsule design and actual owner/system_owner/permissions remain unchanged. Exclude DATA-001, Azinc/Expiry behavior/data, Pharmacy Code logic, SEC-009, Staging environment rebinding, fixtures, and unrelated security changes. Vercel main=false, Production config, password handlers and Pages workflow remain unchanged.

## Proposed Production backend

`proposals/accepted-improvements-release/owner-export-apply.sql` is NOT applied to Production. Its preflight checks SEC-007 exact body/owner/ACL/search_path and refuses an existing V2/schema. It creates one private singleton revision table (RLS, no client access), one definer statement-trigger function, two triggers on existing Master tables, and one read-only Owner/live-session guarded V2 paging function. Export itself writes nothing. Master write statements update the revision once transactionally; no Master/history/identity row is rewritten by the migration. Counts happen once; no full fingerprints. V1 is not installed in Production. No new indexes, snapshots/files, storage, Auth or Edge changes.

Isolated PostgreSQL tested apply/rollback, correct Owner access, non-owner/anonymous/revoked-session rejection, mutation detection and preservation of Master data/SEC-007. Actual Staging migration `20261028022820_owner_export_revision_stream_v2` was separately applied and validated. Production must use the guarded proposal, never replay Staging fixtures or push all repository migrations.

## Deployment — requires later approval

1. Obtain Product Owner acceptance of V2 download and three UI refinements on the exact Staging Preview. Complete focused production-sized browser/Excel acceptance; Node measurements alone are insufficient. Resolve any failures before promotion.
2. Recheck current main and exact reviewed release SHA/CI, Production project `zznoshzcyxmtwfbznjyr`, schemas/indexes and SEC-007. Stop on drift. Obtain explicit approval for the precise code/SQL hash, Production migration and main/Pages promotion.
3. Apply only the guarded V2 proposal against Production after that approval, record its real migration ID/hash. Verify RPC/schema grants, Owner access and non-owner/revoked-session denials through read-only checks. Do not alter passwords, permissions, business data or Edge/Auth settings.
4. Merge only the reviewed selective release via green PR checks. Existing main push publishes GitHub Pages; Vercel main deployment stays disabled. Do not publish the feature branch's Staging Vite binding or manually promote Vercel.
5. Verify exact served SHA, Production CSP/config and Worker. Perform focused non-destructive Reports/Refresh/Loading/Account/Access checks and actual export count/text/association/Excel integrity; record results. No deletion or Azinc tests.

## Rollback — prepared, not executed

1. After explicit rollback approval, revert only this feature release through a reviewed main commit and existing Pages workflow. Recheck intervening main changes; never force-reset or revert October 28 security, SEC-007, password handlers or Vercel main block.
2. Confirm the restored baseline UI no longer calls V2. Only if separately approved, run `owner-export-rollback.sql` on the Production project. Exact function hashes and trigger ownership are checked; it removes only V2, its two triggers, private trigger function, revision table/schema without CASCADE. An unexpected dependency/drift aborts the transaction. Master/history/auth records remain unchanged.
3. Recheck served baseline, security bindings and record rollback. No operational data restore/quantity correction is required.

Rollback to old Staging `87be759` can continue using the retained V1 RPC, but it reintroduces slow export and is not an approved Production solution. Production baseline has no V1 and must not acquire it as a workaround.

## Current approval boundary

READY FOR USER TEST — PRODUCTION UNCHANGED. The next step is acceptance of the refined Staging exporter/UI, with a clear Windows/browser scale limit recorded. No Production operation is authorized. Later migration/main merge/Pages release and any rollback each require explicit approval of their final reviewed artifacts.
