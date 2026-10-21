# Expiry staging database safety gate — 2026-10-08

Starting commit: `7428639ef5301b8d2413f03771a2ba4f106ee7d6`.
Branch: `feature/expiry-stage1-visual-gate`.

**PASS for the tested staging database contracts. This is not approval to migrate
Production or activate capture.**

## Verified target and boundary

Before any write, project metadata, URL and SQL access identified active
`pharmflow-staging`, reference `tovkcakucyagvbzvlnks`, PostgreSQL 17.11, with
zero public tables. All writes targeted this project. Production supplied only
read-only schema/function/grant/policy metadata; no pharmacy rows were copied.
Existing platform Auth and Storage implementations were used, not simulated.
Synthetic users, memberships, HHP084-labelled pharmacy and workers were created.

The relevant baseline tables, grants, RLS and helper definitions were installed,
then the generated Expiry proposal was executed. Existing authorization and
Receiving helper definitions matched the read-only baseline. Global Master
permissions were not changed. These are synthetic-account tests, not verification
of the real System Owner/HHP084 accounts or every Receiving workflow.

## Executed results

| Check | Result | Evidence |
|---|---|---|
| Native PostgreSQL lock contention | PASS | PostgREST used independent native backend PIDs 17382/17383; overlapping writes blocked behind the operation lock, returned identical acknowledgement; separate item operations yielded quantity 6. |
| Idempotency and uncertain retry | PASS | Ignored acknowledgement followed by reconciliation/retry returned the same event/state; changed payload and different owner rejected. Duplicate unknown capture returned one review. |
| Legacy/new writer compatibility | PASS | All legacy Expiry capture/review paths rejected; operation-aware save succeeded. Existing recount/clear bodies preserved statically. |
| Rollback | PASS | Forced exception after internal save rolled back operation and state; DDL transaction rollback left no probe table. This is transaction rollback, not a Production down-migration test. |
| Exact identity and required fields | PASS | Stored payload readback retained U0030, S00110, 1234A, leading zeros and exact framed raw scans. Missing required fields/photos rejected. GS1 review retained GTIN, lot, serial, expiry and both references. |
| Actual two-photo Storage | PASS | Uploaded actual PNG binaries; exact readback; replacement protection; captured member/admin deletion denied; authorized resolved-case cleanup deleted both binaries and retained audit. |
| Storage authorization | PASS | Anonymous read and cross-pharmacy replacement/deletion denied; original binary unchanged. Concurrent deletion before finalization caused save rejection, not a broken review. |
| RLS, workers, HHP084/System Owner | PASS | Cross-pharmacy/outsider/anonymous access denied; wrong/null Handheld workers rejected; synthetic System Owner without membership and HHP084 member retained intended access. Private tables remained inaccessible to clients. |
| Receiving compatibility | PASS (focused) | Actual V3 review creation and exact identifier; existing Storage upload, replacement, read and admin cleanup passed after correction. No Receiving code or permissions changed. |
| Local backend regressions | PASS | 20 passed, 0 failed, 1 skipped (local PostgreSQL runner unavailable; actual staging native tests above did execute). |

Raw synthetic results are in `tests/expiry-backend/staging-evidence/`.
Historical failures remain visible. The initial Storage failures were corrected;
transient network timeouts were retried only after access recovered. The lifecycle
retest reached resolution but incorrectly attempted direct table UPDATE, which
the baseline grants deny. It was resumed through the unchanged deployed V2
resolution RPC; the actual authorized binary cleanup then passed. No grants were
widened. This is combined executed evidence, not a fabricated clean full-run log.

## Proven defects corrected

1. Storage's rolled-back permission INSERT has incomplete metadata. The guard
   now permits only the real Storage DB service to probe; incomplete objects
   never enter the evidence registry and cannot finalize captures. Direct
   authenticated incomplete-metadata inserts were tested and rejected.
2. Storage finalizes uploads in a service-role transaction without `auth.uid()`.
   Only an INSERT from `supabase_storage_admin` with service_role may recover
   uploader identity from object ownership. Operation owner, object owner and
   existing pharmacy membership must all agree. The temporary claim used for
   the unchanged membership helper is restored. UPDATE/DELETE checks are not
   bypassed. Both real uploads and concurrent unknown finalization passed.

Canonical changes are in `tests/expiry-backend/integrity-contract.sql`; the
proposal was regenerated with `build-proposal.py`. Test-only contention probe
was removed from staging after execution. No application deployment or capture
activation occurred.

## Remaining release boundary and next action

No unresolved database defect was proven by these staging tests. Zebra browser,
camera/device workflow, full Receiving UI and real-account verification were
not run. Historical uncertain client writes cannot be inferred from synthetic
tests; the previous requirement to reconcile them remains before client activation.

Next: Product Owner review of this corrected migration and evidence, followed by
staging Handheld acceptance with the existing client. Before controlled shared
database approval, reconfirm the relevant read-only schema baseline and reconcile
any uncertain legacy client operations. Keep capture disabled; obtain explicit
Production migration approval separately. Disable capture for rollback and
retain operation/evidence data; do not remove guards or replay legacy writes.

## Reproduction

`staging-safety.py` is pinned to the verified staging URL and accepts only
environment-provided API key and synthetic password. It expects the established
synthetic fixtures and test-only `staging-probe.sql`. Reinstall that probe only
on staging for a rerun, then remove it. `staging-resolution-baseline.sql` records
the unchanged existing resolution contract used by the cleanup test; neither
test SQL file belongs in the release migration. No credentials or tokens are
included in the evidence package.
