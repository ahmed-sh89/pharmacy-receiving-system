PharmFlow B4 — Operational Dashboard Workflow

TARGET: pharmflow-dev ONLY

Upload:
- index.html
- css/pharmflow-next.css
- js/pharmflow-next.js

Purpose:
Restore the existing proven live receiving workspace to Dashboard while
keeping Orders for import/validation and Receiving for reconciliation,
finalization and exports.

No SQL. No Supabase migration. No receiving business logic rewrite.

Recommended Commit
Subject: Restore operational receiving dashboard

Description:
Restore the existing scan-driven receiving dashboard in the approved blue
B interface. Keep Orders as the upload/validation workspace and Receiving
as discrepancy reconciliation/finalization/export. Preserve existing
receiving, GTIN, synchronization and reporting logic.
