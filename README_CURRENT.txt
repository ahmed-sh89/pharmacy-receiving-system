PharmFlow Phase 2C.10.2.8 — Five-point corrective release

FIX 1 — Cloud status flashing
- Transient SYNCING and OFFLINE states are now debounced.
- SYNCED is displayed immediately.
- A sub-second network transition no longer flashes OFFLINE -> SYNCING -> SYNCED.

FIX 2 — PC2 shows No Active Order
- Root cause corrected in the import/sync path:
  the completed imported workspace is now saved BEFORE files:updated/cloud push.
- files:updated also performs an immediate guarded cloud save plus one verification retry.
- PC2 cloud reconciliation can therefore hydrate Active Order Files instead of an older empty workspace.

FIX 3 — Current Order selector
- Current Order selector is now the real dashboard order scope.
- Dashboard KPI cards recalculate from the selected Order's ORIGINAL source rows.
- Received quantities use per-order transaction allocation.
- Remaining / Completed / Over / Manual / Scans refresh when switching orders.
- Receiving table and progress are refreshed on selection change.

FIX 4 — Email design
- Removed duplicated outer Arabic message from preview.
- Main Arabic heading enlarged to 30px, bold and centered.
- Greeting/body/closing enlarged and centered with logical emphasis.
- Each Order header is centered.
- Table headers and cells are centered and clearer.
- Entire email content is visually centered.

FIX 5 — Discrepancy filter
- Added OK beside Select all and Clear.
- OK closes the filter dropdown without changing the selected filters.

Validation performed:
- JavaScript syntax checked with node --check.
- HTML local src/href references checked.
- Required implementation markers checked in source.

No new SQL migration is required for Phase 2C.10.2.8.
