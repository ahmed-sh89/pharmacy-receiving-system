PHARMFLOW PHASE 2C.10.4.5
HISTORICAL DELETE VISIBLE RECEIPT + DEPLOYMENT CACHE BUST

STATUS: READY FOR TEST

WHY 2C.10.4.4 WAS NOT SUFFICIENT
The delete operation could complete while the transient toast still failed to
be visible in the deployed browser. Repeated UI-only toast changes therefore
did not provide a deterministic operator receipt.

ROOT FIX
- Add a persistent green/red receipt directly inside Settings > Data Management.
- The in-page receipt is independent of toast lifetime and remains visible.
- Keep the toast as a secondary notification.
- Add ?v=2C1045 cache-busting to local JS/CSS assets in index.html so GitHub
  Pages/browser cannot silently keep an older UI/session script after deploy.
- Clear the previous receipt only when a new historical-delete operation starts.

NO SQL MIGRATION.
NO CHANGE TO ACTIVE ORDER / UPLOAD / RECEIVING SYNC LOGIC.

EXPECTED SUCCESS
A green persistent message appears above the Data Management buttons:
Historical data deleted successfully · Server verified · Active Orders unaffected · Global GTIN Master active

RECAPPED COMMIT SUBJECT
Show historical delete receipt

EXTENDED DESCRIPTION
Phase 2C.10.4.5
- Add persistent Settings receipt for Historical Data deletion
- Keep success/failure visible independent of toast timing
- Add deterministic cache-busting for deployed JS/CSS assets
- Preserve Active Orders, Returns Archive and Global GTIN Master
- Preserve verified PC-to-PC and PC-to-Handheld synchronization
- No SQL migration required
