# PHARMFLOW CHANGELOG — 2C.11.4.0

- Replaced cloud-history-derived Current Batch Qty with immediate local runtime state.
- Fixed Batch Qty zero/stale/one-scan-behind regression.
- Fixed Handheld Undo after reload/sync by resolving the visible transaction from workspace history.
- Preserved audit-safe correction transactions.
- Added conservative Zebra combined-Lot GS1 recovery for Dompy-like scans.
- Preserved PC Dompy parsing, Conestal parsing, Auto Clear and Unified Workspace sync.
- No SQL migration.
