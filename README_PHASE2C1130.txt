PHARMFLOW 2C.11.3.0 — HANDHELD EXPIRY WORKFLOW

Upload/replace ALL files in this ZIP at matching paths.
No SQL migration.

Changed production files:
- index.html
- js/expiry.js
- css/dashboard.css
- js/handheld-runtime.js
- js/ui.js
- js/receiving.js
- js/cloud-workspace.js

The Receiving files are carried forward from the USER VERIFIED 2C.11.1.9 baseline;
the Expiry-specific functional changes are in js/expiry.js + Expiry UI/CSS.

TEST FIRST:
1. Full GS1/2D medicine.
2. GTIN-only medicine.
3. Save/Clear Screen.
4. Idle/wake Expiry scan.
5. One quick Receiving regression scan.

RECAPPED COMMIT SUBJECT
Build handheld expiry flow

EXTENDED DESCRIPTION
- Auto-read medicine GS1 Batch/Expiry/Serial
- Require Qty only when expiry is encoded
- Use Month/Year dropdowns for GTIN-only
- Avoid automatic numeric keyboard after scan
- Add safe Expiry Clear Screen and saved-confirmation auto-clear
- Preserve actual serial value
- Reuse existing expiry capture schema/RPC
- Preserve verified Receiving baseline
- No SQL migration
