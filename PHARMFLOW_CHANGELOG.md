# PHARMFLOW CHANGELOG — 2C.11.1.7

- Renamed Handheld `CANCEL SCAN` to `CLEAR SCREEN`.
- Changed Clear Screen semantics to visual-only; it no longer creates a local batch boundary.
- Added small PC `CLEAR SCREEN` control to the existing Last Scan card.
- Clear Screen does not modify Received, history, corrections, Supabase, or current batch accounting.
- Preserved all prior Unified Workspace, burst sync, Add Quantity, Batch Qty and exception-flow fixes.
- No SQL migration.
