PHARMFLOW PHASE 2C.10.4.0 — SERVER AUTHORITY / RESET / UPLOAD ROOT FIX
STATUS: READY FOR TEST

PRESERVED USER-VERIFIED NON-REGRESSION
- Phase 2C.10.3.8 PC↔PC receiving synchronization
- Phase 2C.10.3.8 PC↔Handheld synchronization
- synchronized scan visibility

ROOT FIX
1. Reset Current Workspace is now ONE database transaction. Generation increment, unfinished order/source deletion, Active Manifest deletion, Receiving Ledger deletion and legacy workspace clear either all commit or all roll back.
2. Active Manifest writes carry workspace_generation. A stale PC cannot recreate pre-reset orders.
3. Local-to-server Active Manifest auto-repair is disabled. Supabase is authoritative. On sign-in/focus, an empty server manifest clears stale local active orders rather than resurrecting them.
4. Order lifecycle registration is deferred until the complete Active Manifest is server-verified. A transient first-upload failure can no longer pre-register the Order Number and create a false Already Uploaded state.
5. Original source snapshot is committed after manifest verification with retry.
6. Historical delete success is verified before success notification.

DATABASE
Run PHASE2C1040_SERVER_AUTHORITY_ATOMIC_RESET.sql once before deploying the site.

CONTROLLED TEST
- Do NOT use old 2C.10.3.9 test package.
- Run SQL, deploy this package, hard refresh PC1+PC2.
- Reset Current Workspace on PC1 only. PC2 must become empty; sign-out/in both must remain empty.
- Upload Order 1, 2, 3 ONCE each on PC1. All must appear on PC2.
- Sign-out/in both: all three remain.
- Verify each Order selection and All Orders totals.
- Scan PC1→PC2 and PC↔Handheld to prove 2C.10.3.8 non-regression.
