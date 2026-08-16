PharmFlow Phase 2C.10.2.6 — Critical Account / Pharmacy Isolation

P0 DATA-ISOLATION FIX
- Current Workspace local cache is now scoped by BOTH pharmacy_id and user_id.
- PharmFlow no longer reads the old browser-wide PRS_V3_CURRENT_WORKSPACE key.
- An Owner signing into Pharmacy HHP084 cannot inherit the previous pharmacy user's order.
- Pending cloud transaction queues are also account/pharmacy scoped.
- Sign Out clears only the in-memory runtime; it does NOT delete the previous pharmacy's cloud data.
- Signing into another account in the same browser triggers a full runtime context switch before cloud hydration.
- Archive runtime is also cleared on context change and then reloaded for the correct pharmacy.
- Cloud hydration state, workspace generation, pending saves and reconciliation promises are reset on account change.

ANTI-UI-LOOP / HEADER STABILITY
- Cloud authority reconciliation is serialized: only one reconcile may run at a time.
- Cloud workspace is applied only when its semantic content changed.
- The old 250 ms auth-context watcher is reduced to a 1200 ms safety watcher.
- Main cloud poll is serialized at 2200 ms instead of launching overlapping async operations.
- Header cloud/status areas have stable widths to prevent constant left/right movement.

IMPORTANT
- This build is based on 2C.10.2.5 and therefore also contains the previously prepared:
  * Atomic cross-PC workspace reset
  * 2C.10.2.4 complete archive delete cascade
  * pre-Finalize Email Differences
  * Device ID hidden from user-facing Handheld & Sessions UI

SQL
- If PHASE2C1025_DEPLOY_FROM_2C1023.sql has NOT been run yet, run it once.
- No additional SQL is required specifically for 2C.10.2.6.

NEXT AFTER THIS P0 TEST PASSES
- Multiple Order selector / per-order receiving scope
- Multi-order email with a separate professional table for each Order
- All Discrepancies default = Select All
- Final HTML/rich email design improvements
