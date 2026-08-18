PHARMFLOW PHASE 2C.10.4.6
TENANT-SCOPED HISTORICAL DELETE ROOT FIX

STATUS
READY FOR TEST

CONFIRMED PRODUCTION DEFECT
For pharmacy 13cfb12b-d380-4462-8609-948be70c55ee, the active Order
TO-000453381 remained correctly uploaded, but historical Order TO-000450489
(status received) survived Delete All Historical Data. This proves the issue
was server deletion, not only notification rendering.

ROOT FIX
- One new Supabase RPC deletes Historical Data for ONE pharmacy in ONE
  PostgreSQL transaction.
- Deletes historical immutable source rows for received/finalized/closed orders.
- Deletes receiving-ledger rows belonging only to those Historical Orders.
- Deletes finalized archive rows for that pharmacy.
- Deletes only received/finalized/closed lifecycle rows.
- Preserves uploaded/current Active Orders.
- Server verifies Historical Orders = 0 and Finalized Archives = 0 before commit.
- Any verification failure raises an exception and rolls the whole transaction back.
- Returns a deletion receipt with deleted counts and Active Orders preserved.
- Adds a read-only verification RPC for tenant-scoped QA.

NOT TOUCHED
- Active Order Manifest
- Current Workspace generation
- Global GTIN Master
- Returns Archive
- Users/authentication
- Other pharmacies
- Verified PC-to-PC and PC-to-Handheld synchronization architecture

DEPLOY ORDER
1. Run PHASE2C1046_TENANT_HISTORICAL_DELETE_ROOT_FIX.sql in Supabase.
2. Expected: Success. No rows returned.
3. Deploy the modified application files.
4. Hard refresh.
5. Do NOT Reset Current Workspace.
6. Run Delete All Historical Data once for the intended pharmacy.
7. Expected receipt must show Historical Orders removed / Archives removed /
   Active Orders preserved.
8. Verify the current active Order remains available to the worker.

FOCUSED VERIFICATION
After delete, the server transaction itself guarantees:
- remaining_historical_orders = 0
- remaining_finalized_archives = 0
- active_orders_preserved >= current active count

RECAPPED COMMIT SUBJECT
Fix tenant historical deletion

EXTENDED DESCRIPTION
Phase 2C.10.4.6
- Make Historical Data deletion atomic and pharmacy-scoped
- Remove received/finalized/closed lifecycle rows and their source snapshots
- Remove historical receiving transactions and finalized archive rows
- Preserve current uploaded Active Orders
- Add server-side post-delete verification and receipt counts
- Add read-only tenant historical-state verification RPC
- Preserve Global GTIN, Returns Archive and synchronization architecture
