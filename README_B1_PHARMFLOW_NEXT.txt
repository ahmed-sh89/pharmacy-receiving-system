PharmFlow Next — Phase B1
New Application Shell + Thin Data Layer Foundation
TARGET: pharmflow-dev (B) ONLY

- Light Blue / White / Dark Navy design system.
- Existing PharmFlow logo retained; presentation recolors it Dark Navy.
- Primary navigation: Dashboard / Receiving / Item Movement / Near Expiry / Settings.
- New task-oriented Dashboard.
- Existing Receiving / Expiry / Settings engines remain intact.
- Item Movement foundation page added with NO data writes.
- Thin backend-portable PharmFlowData layer added.
- DEVISO3 remains intact.
- No SQL migration.

TEST
1. DEV001 opens new shell/dashboard.
2. Receiving existing screen still loads.
3. Near Expiry existing screen still loads.
4. Settings keeps DEV001 + Global GTIN read-only behavior.
5. Item Movement foundation opens without writes.
6. Test 01 remains blocked by DEVISO3.

RECAPPED COMMIT
Subject: Build PharmFlow Next shell
Description: Add the task-oriented design system, simplified navigation,
Item Movement foundation and thin portable data layer while preserving DEVISO3
and all existing operational engines.
