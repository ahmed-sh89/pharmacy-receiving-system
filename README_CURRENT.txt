PharmFlow Phase 2C.10.3.7 — Cross-PC Receiving Sync Protection

ROOT CAUSE FIXED IN SOURCE
1. Ending a PC-owned live Handheld session called AppEvents.emit("workspace:cleared").
2. cloud-workspace.js correctly treats workspace:cleared as a destructive Current Workspace reset.
3. Therefore simply ending a live Handheld session could clear the independent Active Order Manifest and the pharmacy-wide Receiving Ledger from Supabase.
4. This could leave different PCs with different local snapshots and destroy cross-PC receiving synchronization.

FIX
- Ending/detaching a live Handheld session no longer emits workspace:cleared.
- Reset Current Workspace remains the explicit authoritative path that clears active manifest + receiving ledger.
- Receiving Ledger RPCs now use the same self-contained pharmacy membership check as the verified Active Order Manifest V2 functions.
- No existing operational data is deleted by the migration.

REQUIRED SQL
Run once in Supabase SQL Editor:
PHASE2C1037_RECEIVING_SYNC_ACCESS_HARDENING.sql

DEPLOY
Deploy the ROOT project tree in this ZIP.
Do not deploy the nested legacy duplicate folder.

CONTROLLED VERIFICATION
1. Do not Reset or Delete Historical Data.
2. Open PC1 and PC2 with the same pharmacy/account.
3. Confirm the same active Order(s) appear.
4. On PC1 receive one controlled item (+1).
5. PC2 should show the same Received Qty automatically within a few seconds.
6. On PC2 receive a different controlled item (+1).
7. PC1 should update automatically.
8. Refresh both PCs; quantities must persist.
9. Sign out/in on both PCs; quantities must persist.
10. Only after PC<->PC passes, create a new live Handheld session and test PC<->Handheld.

DO NOT
- Re-upload the same Order to repair synchronization.
- Reset Current Workspace during the verification.
- Delete Historical Data during the verification.
