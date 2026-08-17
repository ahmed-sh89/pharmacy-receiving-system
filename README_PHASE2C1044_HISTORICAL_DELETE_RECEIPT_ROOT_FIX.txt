PHARMFLOW PHASE 2C.10.4.4
HISTORICAL DELETE RECEIPT ROOT FIX

STATUS
READY FOR TEST

BUG CLASSIFICATION
UI / async completion notification

ROOT CAUSE
Delete All Historical Data waited for several non-critical post-delete
maintenance operations before rendering its success toast. Those operations
can refresh UI state or stall, so the deletion itself succeeds but the
operator receipt is never reliably rendered. The toast utility also relied on
a cached DOM host that can become stale after long asynchronous workflows.

ROOT FIX
1. Verify Historical Data deletion directly against Supabase immediately after
   the two delete RPCs.
2. Do not use a verification helper that swallows RPC failures.
3. Clear only local historical stores after server verification succeeds.
4. Refresh the UI, close the loading overlay, then show the green receipt.
5. Run workspace reconcile, Global GTIN refresh and Item Transfer refresh only
   AFTER the visible receipt as background maintenance.
6. showToast now resolves the current live #toastContainer from the DOM instead
   of trusting a potentially stale cached reference.
7. Success receipt remains visible for 10 seconds.

NON-REGRESSION
- No SQL migration.
- Active Orders are not deleted.
- Global GTIN Master is not modified.
- Returns Archive is not modified.
- Current Workspace reset logic is unchanged.
- Order upload logic is unchanged.
- Verified PC-to-PC and PC-to-Handheld synchronization remains unchanged.

FOCUSED TEST
1. Deploy package and hard refresh.
2. Run Delete All Historical Data.
3. Complete the confirmation phrase.
4. Expected: green success receipt appears after Supabase verification and
   remains visible for approximately 10 seconds.
5. Verify Active Orders remain.
6. Verify Global GTIN Master remains active.
7. Verify Returns Archive remains unaffected.

RECAPPED COMMIT SUBJECT
Fix historical delete receipt

EXTENDED DESCRIPTION
Phase 2C.10.4.4
- Render Historical Data success receipt immediately after authoritative
  Supabase verification
- Move non-critical post-delete maintenance behind the visible receipt
- Resolve the live toast container after long async operations
- Stop verification helpers from silently hiding Supabase read failures
- Keep the success receipt visible for 10 seconds
- Preserve Active Orders, Returns Archive and Global GTIN Master
- Preserve verified PC-to-PC and PC-to-Handheld synchronization
- No SQL migration required
