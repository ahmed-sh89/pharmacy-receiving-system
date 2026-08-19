# PHARMFLOW CURRENT CHECKPOINT

Date: 19 August 2026
Current Version/Workstream: Phase 2C.10.5.5 — Runtime Root Cleanup
Platform: GitHub Pages + Supabase
Primary Devices: Windows PC + Handheld

## VERIFIED / DONE
- Account/pharmacy isolation: USER VERIFIED / DONE.
- Active Order Manifest server storage and receiving synchronization baseline previously user-verified.
- Phase 2C.10.4.6 tenant-scoped Historical Delete: USER VERIFIED / DONE.
- Phase 2C.10.4.7 stale workspace generation on login: USER VERIFIED / DONE.
- Requirement #24: PC Receiving Search by Item Code / Item Name against uploaded orders: USER VERIFIED / DONE.
- Needs Review photo can open on PC: USER VERIFIED.

## FAILED / UNRESOLVED BEFORE 2C.10.5.5
The prior combined patch was NOT successful. Items #1–23 remained unresolved, especially Handheld behavior. Observed runtime defects included:
- PC/Handheld could classify an order item as NOT IN ORDER despite valid order membership.
- Handheld CONNECTED did not prove correct selected-order context was loaded.
- GTIN mismatch / unknown resolution paths diverged between PC, Handheld and Needs Review.
- Needs Review PC workspace/search remained inconsistent.
- Handheld scan interaction remained slow/awkward and exception flow required scroll.
- Reset could fail/partially clear state and leave stale metrics/session/Needs Review.
- Historical deletion could complete with no visible success notification.

## 2C.10.5.5 ROOT CHANGES
- Runtime resolver: Handheld cloud snapshot is authoritative session order context.
- PC live session now publishes Selected Orders source rows, not an uncontrolled merged workspace projection.
- Handheld session only becomes READY TO SCAN after a non-empty order snapshot loads.
- PC GTIN resolver and Needs Review search use the same uploaded-order searchable source used by verified requirement #24.
- Removed undefined legacy saveReceivingNeedsReview runtime call; all new review saves use Needs Review V2.
- Known GTIN / Not In Order keeps direct ADD & RECEIVE path; Unknown GTIN keeps autosave/photo/qty review path.
- Handheld exception card suppresses Last Scan to keep actions within one viewport.
- Quantity Enter/Done hides keyboard; explicit action button remains required.
- Reset now calls new atomic_reset_pharmflow_current_workspace_v4 and force-clears local session/counters after server confirmation.
- Reset and Historical Delete have independent guaranteed-visible top operation receipts.
- Global GTIN Master / Returns Archive boundaries preserved.
- Expiry GS1 behavior preserved: extracted lot/expiry stays automatic; GTIN-only requires manual date entry.

## STATUS
Phase 2C.10.5.5: READY FOR TEST.
Not DONE until user verifies the focused sequence below.

## EXACT NEXT TEST
1. Run PHASE2C1055_RUNTIME_ROOT_CLEANUP.sql.
2. Deploy changed files and Hard Refresh PC + Handheld.
3. Create a NEW Handheld session after deployment.
4. With All Orders selected, scan a known GTIN that is definitely in an uploaded Order on PC and Handheld. Both must receive normally.
5. Scan a known Global Master item genuinely not in the selected Orders. PC should offer ADD & RECEIVE without retyping item identity.
6. Scan an unknown/new GTIN. Handheld must autosave to Needs Review; PC Needs Review search must find uploaded-order items by name/code.
7. Reset Current Workspace ONCE. Expected: active order/session/receiving/Needs Review counters = 0, session inactive, green receipt.
8. Test Delete All Historical Data once. Expected: visible green server-verified receipt.
9. Regression: Global GTIN Master remains intact.
