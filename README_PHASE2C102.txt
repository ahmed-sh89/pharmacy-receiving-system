PharmFlow Phase 2C.10.2 — Reset / Ghost Active Order Hotfix

1. Reset Current Workspace now clears ALL unfinished cloud order registrations for the signed-in pharmacy, including legacy ghost uploaded/receiving rows not present in this browser.
2. Shared cloud workspace is cleared before local reset to prevent cross-PC stale resurrection.
3. Finalized/received history remains protected.
4. Delete All Historical Data remains separate and does not touch current orders or Global GTIN Master.
5. Global GTIN Master status is permanently visible in the top bar and re-syncs after reset/history deletion.
6. Multi-PC authority reconciliation runs immediately after destructive operations.

Run PHASE2C102_RESET_GHOST_ORDER_HOTFIX.sql once in Supabase before testing.
