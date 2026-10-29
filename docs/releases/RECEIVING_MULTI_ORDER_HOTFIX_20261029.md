# Receiving multi-order allocation hotfix — 29 October 2026

Status: READY FOR RELEASE; authenticated Product Owner verification pending.
Approved scope: focused Production hotfix, PR/required checks/Pages; no operational data writes.
Baseline main: f6e341782b6844929c5ced87511ad29ec4440487.
Production Supabase: zznoshzcyxmtwfbznjyr.

## Root cause and change

Classification: aggregation/presentation plus receiving transaction order attribution.
The authoritative manifest already contains one Meligamet item with orderedQty 134 and memberships TO-000535106 then TO-000532448. Search independently summed per-Order report rows. updateLastScanFromReceiving instead selected the last transaction's single Order (100). addItemReceivedQuantity and receiveItemBySearch bypassed the existing multi-Order allocation planner and sent the entire addition through receiveOrderItem's single deterministic target. allowOverReceiving enabled that target's excess before other Orders filled. Dashboard KPIs also counted per-Order rows.

One read-only operational projection now sums selected active Orders by Item Code within the already pharmacy-scoped workspace. Search, scan-card creation/refresh and Dashboard item counters use it. Manual/search additions reuse the established allocation planner and transaction writer; positive generic adjustments use the same plan. Existing membership order is preserved; overflow is assigned only after all applicable capacities are exhausted and only when allowed. Aggregate decrements remove from the reverse eligible order sequence; explicit report/activity corrections and Undo preserve the original Order. Local batch behavior and cloud transport remain unchanged.

Receiving Report/table/live report/Excel/PDF retain the existing per-Order projection, consolidating duplicate source lines only within the same Order and Item Code. Source rows, order IDs, provenance and existing transactions are not rewritten. The active index cache-busts only the changed UI and Receiving scripts.

## Persisted incident — read-only evidence

Checked 2026-10-29 16:41:29 UTC (19:41:29 Riyadh). HHP084 pharmacy UUID 13cfb12b-d380-4462-8609-948be70c55ee; manifest revision 55; workspace generation 45.

| Order | Order UUID | Source line ID / line | Ordered | Ledger received |
|---|---|---|---:|---:|
| TO-000535106 | 0fc19500-ca90-4dfc-8f16-f344960ed9aa | 62168 / 2 | 100 | 131 |
| TO-000532448 | 537f6d80-4648-43ba-9336-5c679594e016 | 62213 / 37 | 34 | 0 |

Eight ledger entries net 131 on the first Order; zero entries for this item on the second. The last +127 MANUAL_ADD transaction is TX-2b330446-2e2c-4768-9737-fb7aecbfcb39. Source Sheet1 row 9 / row 44 respectively. Manifest receivedQty 0 is a structure snapshot, not the authoritative ledger total.

The hotfix does not migrate or rebalance 131/0. A separate correction proposal exists beside this record and requires new Product Owner approval.

## Verification

86 focused offline tests PASS: eight new incident/card/allocation/Undo/data-preservation/scope cases; existing Receiving consolidation/report separation and export equivalence; deterministic allocation/overage; split queue retries; two-client ledger hydration; Handheld assignment/scanner rearming; startup authority; existing required security release checks. Build and syntax/diff checks PASS. These are synthetic VM/DOM/SQL-fixture checks, not real Windows/Zebra or simultaneous live Production scans.

Additional legacy tests/needs-review-quantity.test.cjs is not green: its mock accepts create_pharmflow_needs_review_v5 while unchanged runtime uses v6. Timeout and contract failure reproduced on pristine baseline main (first two scenarios). This is not part of the passing count; no unrelated Needs Review patch was made.

## Release, risk and rollback

Review only this hotfix diff; required PharmFlow security checks must pass. Confirm main remains baseline and vercel.json keeps git.deploymentEnabled.main=false; merge through PR without bypassing required checks. Pages stamps the merge SHA and publishes the allowlisted runtime. Verify served version, exact changed assets and Production binding. No database migration, Edge deployment, security setting change or Expiry branch merge.

Remaining limits: the existing browser-ledger allocation/queue mechanism is reused; this patch does not introduce a server-atomic cross-device allocation reservation. Concurrent independent device additions and real Zebra behavior are not newly certified. Local multi-Order writes retain the existing per-transaction persistence model.

After deploy: Product Owner refreshes the official app and checks Ordered 134 across search/card with existing Received 131; report remains 131/0 until separate approval. Avoid exploratory Production writes. New-quantity 100/31 behavior is already covered with isolated synthetic records. Status becomes USER VERIFIED only after owner acceptance; do not label it DONE from a build.

Rollback, if needed: revert this PR through the reviewed workflow and redeploy Pages; no database rollback or ledger redistribution. Do not revert October security releases. Back-port only this scoped commit to the active development baseline before its next promotion; no unrelated Staging branch is merged here.
