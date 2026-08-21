# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.1.2 — Receiving Quantity + Exception + Recent Fix
Status: READY FOR TEST

## USER VERIFIED / PROTECTED
- 2C.11.0 Unified Pharmacy Workspace: Handheld enters Receiving without pairing.
- Known item scan works on PC and Handheld.
- PC↔Handheld synchronization works.

## 2C.11.1.2 CHANGES
- The large Handheld quantity is now the authoritative shared Received total.
- Manual edit sets the total Received value; Enter closes the numeric keyboard and saves.
- Removed duplicate QTY / ADD QUANTITY wording and duplicate Received metric.
- Persistent PC Last Scan card hidden.
- Known Item Not in Order: Qty defaults to 1, no automatic keyboard, Cancel Scan returns READY.
- Unknown/GTIN mismatch: Qty defaults to 1, no automatic keyboard, Cancel Scan discards autosaved review draft/photo and returns READY.
- Recent Scans: THIS HANDHELD is default with Undo; ALL DEVICES is view-only.
- No Unified Workspace/scanner/sync architecture change.
- No SQL migration.

## TEST
1. Known item scan x2: large Handheld number must equal shared Received total.
2. Tap number, enter 5, Enter: keyboard closes and PC/Handheld Received becomes 5.
3. Known Extra scan: no keyboard until Qty is tapped; Cancel returns READY.
4. Unknown GTIN scan: no keyboard until Qty is tapped; Cancel removes pending review and returns READY.
5. Recent opens THIS HANDHELD by default; ALL DEVICES tab is visible and view-only.
6. PC persistent Last Scan card is hidden; PC scan/sync remains working.
