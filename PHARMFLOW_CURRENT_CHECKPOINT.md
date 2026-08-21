# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.1.1 — Handheld Quantity + Recent UX Fix
Status: READY FOR TEST

## USER VERIFIED / PROTECTED
- 2C.11.0 Unified Pharmacy Workspace: Handheld enters Receiving without pairing.
- Known item scan works on PC and Handheld.
- PC↔Handheld synchronization works.
These are protected non-regression requirements.

## USER FEEDBACK ON 2C.11.1
- Last Scan item identity and Ordered/Received/Remaining display correctly.
- Primary Handheld Quantity counter displayed 0 after successful scans; user preferred the earlier working counter.
- Manual Quantity entry must close numeric keyboard on Enter/Done.
- Large Item Number box under the name should not compete visually with Quantity.
- Recent/Total Scan history entry was not visible.

## 2C.11.1.1 CHANGE
- Primary editable QTY is promoted directly under item identity.
- Item Number remains small metadata.
- +/- buttons are reduced in size so only one quantity control looks primary.
- Ordered/Received/Remaining are compact secondary metrics.
- Quantity display falls back to latest successful scan quantity if local batch history momentarily lags.
- Enter/Done explicitly blurs numeric field before applying quantity, closing Android numeric keyboard.
- RECENT button is explicitly restored despite a legacy CSS rule that hid Total Scans.
- Recent shows current-Handheld scan history and keeps audit-safe Undo behavior.
- No scanner/workspace/sync architecture changed.
- No SQL migration.

## EXACT TEST
1. Scan known item once. QTY must show 1 (not 0).
2. Scan same item again. QTY/current batch must advance appropriately.
3. Tap QTY, enter 5, press Enter. Keyboard closes and quantity is applied.
4. RECENT must be visible; open it and verify recent scans.
5. Confirm PC sync still works.
