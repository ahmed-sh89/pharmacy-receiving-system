# HHP084 / 1019577 — separate correction proposal

PROPOSED ONLY — NOT EXECUTED — NEW PRODUCT OWNER APPROVAL REQUIRED.

| Order | Ordered | Before received | Proposed correction delta | After received | After shortage / excess |
|---|---:|---:|---:|---:|---|
| TO-000535106 | 100 | 131 | -31 | 100 | 0 |
| TO-000532448 | 34 | 0 | +31 | 31 | shortage 3 |
| Total | 134 | 131 | 0 | 131 | shortage 3 |

Preserve all eight existing transactions, both Order UUIDs and original uploaded source rows. Proposed execution is a pair of linked, audited compensating ledger transactions scoped to pharmacy 13cfb12b-d380-4462-8609-948be70c55ee and item 1019577, never UPDATE/DELETE of existing receipts or a manifest replacement. Preserve the original +127 transaction TX-2b330446-2e2c-4768-9737-fb7aecbfcb39 and reference the incident/correction reason.

Before any future execution, re-read quantities, active Order identities and workspace generation (observed 45), verify no pending client writes, and apply an idempotent paired correction atomically using the supported authenticated ledger contract or a separately reviewed guarded transaction. Stop if the before-state differs from 131/0. The execution mechanism must also preserve the browser/cloud compatibility snapshots and durable upload idempotency; do not issue unreviewed direct SQL inserts.

This document authorizes no correction and was not applied by the code release. Product Owner approval requested specifically for the above -31/+31 operation after hotfix deployment. If approved in a later step, verify resulting ledger sums 100/31 and total 131 without modifying source/provenance.
