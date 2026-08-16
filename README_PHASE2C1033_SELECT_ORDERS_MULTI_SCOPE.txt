PharmFlow Phase 2C.10.3.3 — Select Orders Multi-Scope + Receiving Ledger Root Fix

SELECT ORDERS
- Replaces the old Current Order concept for multi-order work.
- Checkbox selector supports any subset: 1, 2, 3 ... active Orders.
- Default remains All Orders.
- Button label: All Orders / exact Order Number / N Orders Selected.
- Select All / Clear / OK controls.

LOGIC
- Dashboard KPIs aggregate ONLY the selected Orders.
- Receiving table displays ONLY the selected Orders and keeps Order Number per row.
- Receiving filters/search work inside the selected set.
- Reports/export/email use ONLY the selected Orders and preserve separate Order groups.
- Scan: if an item exists in only one selected Order, it is attributed automatically.
- If an item exists in multiple selected Orders, the system blocks ambiguous attribution and
  asks the operator to select one target Order before receiving.
- Finalize remains safe: exactly one Order must be selected.
- Item Transfer source logic is unchanged and remains based on original Ordered Quantity.

SYNC
- Includes the complete Phase 2C.10.3.2 Receiving Ledger Sync root fix.
- No additional SQL beyond the already executed
  PHASE2C1031_SHARED_RECEIVING_TRANSACTIONS.sql.
