PHARMFLOW PHASE 2C.10.4.1
GENERATION FENCE + ATOMIC ORDER UPLOAD ROLLBACK + HISTORICAL DELETE RECEIPT

STATUS
READY FOR TEST

USER-VERIFIED NON-REGRESSION PRESERVED
- Phase 2C.10.3.8 PC ↔ PC receiving sync
- Phase 2C.10.3.8 PC ↔ Handheld receiving sync
- synchronized scan visibility

ROOT CAUSE ADDRESSED
If Reset is performed from more than one PC, workspace_generation increments
again. A browser that still holds the previous generation can then import a new
Order locally but have save_pharmflow_active_order_manifest_v3 rejected by the
generation fence. The UI previously reported "local only" and left confusing
partial state.

FIX
1. Before every Order import, fetch the current Supabase workspace generation.
2. If another PC reset the workspace, clear stale local state BEFORE import.
3. Pull the server Active Order Manifest after generation reconciliation.
4. If the authoritative manifest commit is not verified, retry and then perform
   a server pull to distinguish a lost verification response from a true failure.
5. On true failure, rollback the entire local import to the pre-import workspace.
   No partial local-only Order remains and lifecycle registration is not committed.
6. Manifest error toast now includes the actual server reason.
7. Delete All Historical Data now verifies both lifecycle registrations and
   finalized archive rows on Supabase before displaying a green success receipt.
8. Settings confirmation callback awaits the full historical deletion operation.

DATABASE
No new SQL migration required if Phase 2C.10.4.0 SQL was already executed.

DEPLOY
Replace the current GitHub Pages files with this package and hard refresh PCs.

FOCUSED TEST
A. Do NOT Reset again.
B. Sign out/in PC1 and PC2, then hard refresh.
C. Confirm both show No Active Order.
D. Upload one genuinely new Order ONCE on PC1.
E. Expected: first upload succeeds and appears on PC2.
F. Upload second and third new Orders once each.
G. Verify All Orders / each Order quantities.
H. Verify sign-out/in persistence.
I. Verify one PC scan syncs to other PC and Handheld.
J. Separately test Delete All Historical Data; green success appears only after
   server verification.

If upload fails, the red toast must now display the exact Supabase reason and
the Order must NOT remain locally or be falsely registered as Uploaded.
