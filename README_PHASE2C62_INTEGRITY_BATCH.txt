PharmFlow Phase 2C.6.2 — Integrity & Workflow Batch
===================================================

This package is consolidated on top of Phase 2C.6 Final Consolidated V2.

Fixes included:
1) Missing GTIN card now opens CURRENT workspace missing items only.
2) Reset Current Workspace clears stale Recent Scan Activity state.
3) KPI click handling uses a single capture handler to prevent duplicate modals.
4) Active Order Files now supports removing ONE active order while keeping the others.
5) Missing GTIN after reset is derived only from the current workspace.
6) Dashboard Remaining is now "Remaining Units" and updates after every receiving change.
   Internal remaining item-count statistics are preserved for reports.
7) Existing Quick Resolve / Add Extra workflow remains enabled for unknown scans.
8) High Priority flag added to KPI item lists; Priority-only filter and star toggle included.
9) Manual extras (Ordered 0 / Received > 0) are counted as both Manual and Over Received.

No new SQL is introduced by 2C.6.2.
Prerequisites already used by earlier consolidated Phase 2C.6:
- PHASE2C61_SAFE_GTIN_LEARNING.sql
- discard_pharmflow_active_order RPC from Phase 2C.5.4.5

Recommended commit:
Phase 2C.6.2 - fix dashboard integrity multi-order controls and priority workflow
