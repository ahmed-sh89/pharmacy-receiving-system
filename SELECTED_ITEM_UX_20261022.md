# Quick Add selected-item UI — 22 October 2026

Accepted parent: 8d3561d941938bacbc828a8469082890a63b0878. Previous Quick Add/Group/metrics acceptance remains PASS. New selected-item UX status: READY FOR USER VISUAL TEST after Preview deployment verification.

Runtime scope: js/receiving.js (search-wrapper visibility, selected-region accessibility, native Change Item action, focus, safe state reset and retry guard) and index.html (receiving asset cache key). Existing Group CSS, Active Order, scan identifier, entered quantity, SQL, backend contracts, Supabase config, uploaded source data and Needs Review behavior are unchanged.

Selection hides the whole search area and focuses Group. Change Item restores the existing query/results, clears item/code/name/source/Group/message, focuses search, and preserves barcode/quantity. A pending or frozen Quick Add operation cannot change selection. Native result/Change Item buttons retain keyboard activation; hidden wrapper removes results from keyboard/accessibility navigation until Change Item.

Verification: 16 focused client UI tests PASS (existing 13 plus selected-area/focus, safe Change Item and pending-operation lock checks); production build PASS. No backend/full regression rerun. Production remains main 4b3fe2e03d438ba5d462d5eabae0a6446884e125, unchanged.

Existing Production candidate frontend patch/files/tests/checksums updated with this follow-up. Candidate SQL 01/02/05/07 and Production configuration bytes unchanged. Recovery 00/04/06 excluded; 03 deferred. Fresh read-only Production compatibility gate and separate promotion approval are still required. No Production promotion or test-data cleanup.

Visual acceptance: search several matching Order items, select one, confirm only its details appear; choose Group, press Change Item, confirm results return and Group resets while quantity/barcode remain.
