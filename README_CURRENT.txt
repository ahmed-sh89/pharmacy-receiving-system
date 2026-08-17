PharmFlow Phase 2C.10.3.8 — Unified Receiving Sync Root Fix

ROOT CAUSE CONFIRMED IN SOURCE
- workspace:cleared was incorrectly treated as a pharmacy-wide destructive cloud reset.
- Handheld detach/end-session and other local lifecycle flows emitted workspace:cleared.
- That could delete Active Order Manifest + shared Receiving Ledger for the entire pharmacy.
- This explains disappearing uploaded Orders and loss of PC↔PC / PC↔Handheld receiving continuity.

ARCHITECTURAL FIX
1. workspace:cleared is now LOCAL ONLY. It never implicitly deletes server state.
2. Intentional Reset Current Workspace remains the ONLY UI flow that explicitly clears the cloud workspace/manifest/receiving ledger.
3. Receiving Ledger V2 uses a self-contained authenticated pharmacy membership check (same hardened pattern as Manifest V2).
4. Existing local receivingHistory is idempotently repaired/pushed to the shared ledger using transaction IDs.
5. The pharmacy-wide Receiving Ledger is the canonical Received Qty authority for PC and Handheld.
6. Handheld live-session snapshot is overlaid with the canonical shared ledger after every refresh, preventing stale session quantities from overwriting synchronized quantities.
7. Ending/detaching a Handheld session no longer emits workspace:cleared.
8. Build marker: APP_CONFIG.version = 2C.10.3.8.

REQUIRED SQL
Run once: PHASE2C1038_UNIFIED_RECEIVING_LEDGER_V2.sql

TEST
- Do NOT Reset/Delete/Upload after deployment unless instructed.
- Open PC1 and PC2 same pharmacy.
- Scan on PC1 -> PC2 must update.
- Scan on PC2 -> PC1 must update.
- Refresh/sign-out/in must preserve.
- Join Handheld session; scan PC -> Handheld and Handheld -> PC must update.
