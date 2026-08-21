PHARMFLOW 2C.11.0 — UNIFIED PHARMACY WORKSPACE CORE

SOURCE
Built from pharmacy-receiving-system-main(8).zip (deployed 2C.10.7.1 baseline).
2C.10.7.2 is NOT included.

UPLOAD/REPLACE ALL FILES IN THIS ZIP AT MATCHING PATHS.
No SQL migration is required.

Changed production files:
- index.html
- js/ui.js
- js/handheld-runtime.js
- js/receiving.js
- css/dashboard.css

First acceptance test only:
PC Active Order -> Handheld same pharmacy login -> Receiving (NO join code) -> ONLINE/WORKSPACE SYNCED -> known GTIN x3 -> PC sees +3.

RECAPPED COMMIT SUBJECT
Unify handheld workspace

EXTENDED DESCRIPTION
Phase 2C.11.0
- Make Handheld a direct client of pharmacy Supabase workspace
- Remove Create/Join Session requirement from Handheld Receiving
- Hydrate Active Orders from existing Active Order Manifest
- Keep shared receiving ledger as transaction authority
- Show truthful workspace readiness on Handheld
- Preserve PC search #24 and existing domain isolation
- Keep legacy session code dormant for rollback until verification
- No SQL migration
