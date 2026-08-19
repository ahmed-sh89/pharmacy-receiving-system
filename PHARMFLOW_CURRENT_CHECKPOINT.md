# PHARMFLOW_CURRENT_CHECKPOINT

Date: 2026-08-19
Version: Phase 2C.10.5.4
Status: READY FOR TEST

## Source of truth
Built from pharmacy-receiving-system-main(3).zip supplied by Product Owner on 2026-08-19.

## Implemented in this phase
- Unified Receiving item/order membership against original uploaded Order source rows.
- PC Receiving Search and Needs Review Search now use uploaded-order source data.
- Known Global GTIN + genuinely not in selected Order remains Known Extra; no manual re-entry of known identity.
- Needs Review desktop workspace redesigned and photo open behavior preserved.
- Handheld scan box suppresses soft keyboard and visibly indicates hardware scanner readiness.
- Handheld exception card replaces Last Scan space to reduce scrolling.
- Reset media cleanup moved to Supabase Storage API; SQL no longer deletes storage.objects directly.
- Reset clears Receiving Needs Review before authoritative workspace reset.
- Existing No Active Order dashboard zero gate preserved.
- Historical Delete success/error flow preserved for focused retest.
- Existing Expiry GS1 behavior preserved: parsed expiry/batch auto-read; GTIN-only requires manual expiry fields.

## Critical verification required
1. Known GTIN + item in uploaded Order: PC normal receive.
2. Same item on Handheld linked to ALL ORDERS: normal receive, not Known Extra.
3. PC Search finds uploaded item by Item Code and Item Name.
4. GTIN mismatch/unknown review search finds uploaded item and links it.
5. Known Master item genuinely outside selected Orders: Add & Receive as Extra.
6. Needs Review desktop layout and photo viewer.
7. Handheld no soft keyboard during normal scanning; exception actions fit without scroll.
8. Reset Current Workspace succeeds once, zeroes counters, clears Needs Review and ends session.
9. Delete All Historical Data shows visible success/error receipt.
10. Sign-out/in with No Active Order does not restore stale counters/session.
11. Expiry GS1 auto-read regression test and GTIN-only manual date regression test.

## Migration
Run PHASE2C1054_RECEIVING_LIFECYCLE_STORAGE_SAFE.sql once.

## Non-regression
Global GTIN Master must never be deleted by Reset/Historical cleanup. Historical Data, Returns Archive, Current Workspace and Expiry remain separate domains. Official order reports remain based on original uploaded Order data.

## Next action
Deploy migration + modified files, Hard Refresh PC and Handheld, then run focused verification above.
