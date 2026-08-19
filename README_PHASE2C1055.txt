PHARMFLOW PHASE 2C.10.5.5 — RUNTIME ROOT CLEANUP

STATUS: READY FOR TEST

WHY THIS BUILD IS DIFFERENT
The previous combined patch was deployed correctly, but only requirement #24 changed in production. A runtime audit of the exact tested GitHub ZIP found divergent live code paths rather than a deployment/cache-only problem.

KEY RUNTIME FINDINGS
1. Handheld session receives server snapshot rows but has no local uploaded orderFiles, while Receiving membership checks were still designed around PC orderFiles.
2. The PC quick GTIN resolver still searched merged orderData rather than the uploaded-order search resolver that was proven working by requirement #24.
3. The PC Save for Review button called saveReceivingNeedsReview(), but that function does not exist in the current runtime source.
4. Reset was still dependent on the old v3 RPC name, making it difficult to prove the storage-safe function was the one actually executing.

FIXES
- Selected Orders source rows are the PC live-session payload.
- Joined Handheld snapshot is authoritative proof of membership in the connected receiving context.
- Session is READY TO SCAN only after order snapshot hydration.
- PC GTIN resolver + Needs Review use uploaded-order search source.
- All review saves use Needs Review V2.
- Handheld exceptions use one compact action viewport.
- Enter/Done hides numeric keyboard, explicit Save/Add remains required.
- Reset uses new v4 RPC and hard-purges local operational/session state after server confirmation.
- Reset and Historical Delete show independent top green/red receipts.
- No changes to Global GTIN Master data or Returns Archive.

DEPLOY
1. Run PHASE2C1055_RUNTIME_ROOT_CLEANUP.sql in Supabase.
2. Upload all changed files preserving paths.
3. Hard Refresh PC + Handheld.
4. IMPORTANT: end any old Handheld session and CREATE A NEW SESSION after deployment, because the session item payload logic changed.

RECAPPED COMMIT SUBJECT
Fix receiving runtime flow

EXTENDED DESCRIPTION
Phase 2C.10.5.5
- Unify PC and Handheld order context
- Publish Selected Orders to Handheld sessions
- Fix PC GTIN resolver and Needs Review search source
- Remove broken legacy Needs Review save path
- Add deterministic Reset V4 and visible delete receipts
- Preserve Global GTIN, reports and tenant boundaries
