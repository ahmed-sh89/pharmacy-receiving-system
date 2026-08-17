PHARMFLOW PHASE 2C.10.4.2 — RPC VOLATILITY HOTFIX

STATUS: READY FOR TEST

ROOT CAUSE CONFIRMED
The generation-read RPC get_pharmflow_workspace_generation was declared STABLE but contains INSERT ... ON CONFLICT DO NOTHING. PostgreSQL therefore raised: INSERT is not allowed in a non-volatile function.

CHANGE
Only that RPC is replaced with the same signature, membership/security checks and behavior, but correctly declared VOLATILE. A fail-fast SQL verification confirms the database catalog reports volatility = v.

NO DATA DELETION
No operational, historical, Returns Archive or Global GTIN data is deleted. No reset is performed.

DEPLOY ORDER
1. Run PHASE2C1042_RPC_VOLATILITY_HOTFIX.sql once in Supabase SQL Editor.
2. Expected: Success. No rows returned.
3. No GitHub code change is required for this hotfix if Phase 2C.10.4.1 is already deployed.
4. Hard refresh PC1 and PC2 after SQL succeeds.
5. Do NOT Reset again.
6. Upload one genuinely new Order ONCE on PC1.
7. Confirm it appears on PC2.
8. Only after first-order success, continue with second and third Orders and All Orders tests.

NON-REGRESSION
Preserve verified PC↔PC and PC↔Handheld receiving/scan synchronization from Phase 2C.10.3.8.
