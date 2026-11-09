# Missing GTIN timeout — Staging hotfix

Date: 10 November 2026 (Saudi Arabia). Status: READY FOR TEST; authenticated Preview verification pending.

Production base: `5b2cef8f2dfe7768876d74e9ab300485720fd8cf` (PR #54 merged). Production diagnostics were read-only; no Production function, index, data, configuration or timeout was changed. The deployed failure remains open until a separately authorized hotfix release.

## Verified root cause

Manage Orders waits for permissions and Active Order Manifest authority, then calls the existing shared IdentifierService projection read. Overlapping reads already join one promise; frontend retries or cache authority are not the cause or fix.

The RPC's inlined CTE repeats `count(*)` for exists/conflict and repeats its `ORDER BY item_code LIMIT 1` master lookup for group/identifiers. Production EXPLAIN (without ANALYZE) shows the two limited lookups scanning the raw primary key with canonical normalization as a Filter, not an index condition. The new expression index is valid but has no expression statistics; estimates use 283 matches per code. A limited ordered scan looks cheap to the planner and repeatedly normalizes Global rows. Pharmacy rows are also rescanned and normalized per code. Authenticated/Authenticator statement_timeout is 8 seconds.

## Correction

Migration `20261109211140_receiving_identifier_projection_set_lookup.sql` replaces only `get_pharmflow_workspace_identifiers_v1(uuid)`. A materialized code set and one indexed count/min lookup per code replace duplicated scalar/ordered lookups. An exact primary-key equality obtains the selected master's group. Pharmacy rows are scoped and normalized once; identifier aggregation keeps the same Global/pharmacy precedence and array ordering. `min(item_code)` preserves the previous lexicographically first canonical match; all matches still determine exists/conflict.

The JSON signature, guards, SECURITY DEFINER owner/search_path and authenticated-only EXECUTE are unchanged. No timeout, index, application runtime, polling, permission policy, Save All or saved-review writer changes.

## Executed verification

| Staging diagnostic | Before | After |
|---|---|---|
| 56,604 Global items, 78,192 identifiers, 443 pharmacy mappings, 486 workspace codes; expression statistics absent | Same SQLSTATE 57014 at the unchanged 8-second limit | 35.655 ms, 5,120 shared buffer accesses, no temp spill |
| Same scale with expression statistics available | 1,250.120 ms | 32.075 ms |

The cold private fixture reproduces the Production primary-key-filter plan and timeout. The corrected cold plan uses the canonical index and exact primary-key condition; pharmacy rows are read once. Scale data is synthetic and isolated in denied-client Staging schemas, not operational Global or Receiving records. The fixture disables autovacuum only on its own tables to preserve the incident's missing-statistics condition.

Old/new scale JSON results are identical where the old query can finish. Actual public Staging projection fingerprint also remains `dc0a42e6dc625593b1467a4cfa69c52b`. Staging ledger remains 12 receipts / 27 units, fingerprint `059c856789678e928f6f228176bf641d`.

- 53 focused tests PASS: projection correctness/scale/plan/security, shared reads and identity fences, bulk atomicity/replay/conflicts, saved-review quantity/rollback, pharmacy identifiers, source/import authority and receiving recovery.
- 140 relevant regression tests PASS / 0 FAIL / 1 pre-existing SKIP: Duty readiness, sleep/wake permissions, session boundaries and publication security.
- Production-equivalent build and whitespace checks PASS. No accepted operational runtime file changed; historical release manifests remain intact.
- Staging installed migration history: `20261109212134`, name `receiving_identifier_projection_set_lookup`; original source filename and SQL remain pinned in the repository.
- Installed RPC: postgres owner, same uuid signature, deny anon/PUBLIC, allow authenticated. No synthetic Production calls or writes.

Raw plan/timing/equivalence evidence is in this directory. Production EXPLAIN evidence masks the pharmacy UUID. Local SQL tests use simulated authorization; authenticated UI verification is recorded separately when completed.

## Next action and release requirements

Create a dedicated Draft hotfix PR from the verified Production base, using the existing Receiving Staging Preview branch so no unrelated build configuration changes are required. Verify its exact HEAD, green CI and Staging Preview version/backend; test read-only concurrent Manage Orders and Refresh. Preserve the earlier accepted write workflows through the focused regression evidence, without modifying Staging receiving records.

Production release is NOT authorized. A later release requires fresh main/HEAD and workload checks, recorded data fingerprints, application of this single approved function migration with automatic history, ACL/guard/definition verification, data preservation checks, protected merge/Pages deployment, and successful authenticated Missing GTIN smoke testing at Production scale. Do not replay either PR #54 migration, raise statement_timeout, restore a database backup or delete operational data.
