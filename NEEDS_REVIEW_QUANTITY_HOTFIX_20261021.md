# Needs Review quantity confirmation — 21 October 2026

Base: `efdd81b32805c350af6e1631c8df0e5933878eab`. Source-only Production hotfix; no SQL, operational RPC calls, data corrections, or Expiry changes.

## Incident evidence

Production project `zznoshzcyxmtwfbznjyr` was verified using the connected project's metadata. Narrow SELECT/catalog inspection confirmed the live create-v5, set-quantity-v2, and list-v4 contracts.

The only matching Receiving review for identifier `884400159403` was PENDING with `pending_quantity=1`, null `operation_id`, the original two-order scope, and identical creation/update times: 20 October 2026 16:48:26 UTC (19:48:26 Riyadh). Base commit `efdd81b3` was created at 21:52:11 UTC (21 October 00:52:11 Riyadh). The stored record predates that release and does not carry the operation ID used by its new Save handler. Its quantity one comes from stored data, not the reopened grouping projection. The pre-release PC handler created a quantity-one draft without persisting the entered quantity. Records alone cannot establish every historical browser interaction or recover the intended four units; the Product Owner supplied that intended quantity. No historical record was corrected.

The current Save handler already creates with a stable operation ID and applies entered quantity through the existing setter. The live setter updates/returns the pharmacy-scoped pending row's quantity; list-v4 returns that stored quantity unchanged; grouped UI sums pending quantities. Executing these browser functions with an in-memory RPC/DOM harness confirms entered four becomes four after reopening.

## Minimal change

- `js/receiving.js`: require a setter acknowledgement for the exact review ID and entered quantity before reporting success/closing. Missing or mismatched acknowledgement leaves the dialog open for retry with the same operation/draft identity.
- Same file: Remaining used `-${abs(delta)}` for a shortage. Display its positive magnitude instead. COMPLETE zero, OVER positive excess, EXTRA, allocation math, and actual receipt quantities are unchanged.
- `index.html`: cache version for the changed script.
- `tests/needs-review-quantity.test.cjs`: event-driven synthetic DOM runs the real Save handler, real draft/set/list wrappers and reopened grouping. Covers four units, original two-order scope after selection changes, lost create reply, setter failure/retry, concurrent clicks, missing/wrong quantity or review acknowledgement, invalid input, and Remaining/Complete/Over/Extra projection.

27 focused automated tests pass; build, changed-script syntax, and diff checks pass. Vite retains its existing classic-script warnings. No live database mutation, cross-PC/device integration test, or Product Owner PASS is claimed. The existing create-then-set protocol is not an atomic capture transaction; this release does not change its backend concurrency contract or the previously documented SQL-dependent work.

Status: READY FOR TEST after deployment verification, not USER VERIFIED or DONE.

Product Owner: refresh to this release and make a fresh approved Save for Review with quantity four, reopen it and confirm quantity four with one entry and original order scope. Do not use the unchanged older quantity-one row as evidence of a new save. Link & Receive is unnecessary for this check.
