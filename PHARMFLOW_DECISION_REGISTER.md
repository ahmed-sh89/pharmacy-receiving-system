# PHARMFLOW DECISION REGISTER

## D-2026-08-21-01 — Unified Pharmacy Workspace
APPROVED. Supersedes user-facing PC-created Handheld session pairing. Handheld authenticates to the pharmacy and reads the same Supabase Active Workspace/Orders as PCs.

## D-2026-08-21-02 — Handheld-first
APPROVED. Zebra/Handheld is primary. Generic Android/iPhone UX is architecturally allowed but deferred if it adds delay or complexity.

## D-2026-08-21-03 — Simplify visible UI
APPROVED. Remove/hide obsolete/redundant visible controls. Hide Returns Archive from navigation without deleting its data. Use Order History as the user-facing Archive label in a later UI cleanup phase.

## D-2026-08-21-04 — Item Movement authority
APPROVED. Item Movement quantity is original Ordered Qty/document quantity, not actual Receiving count. Movement-only bulk imports are not Active Orders. On-screen preview precedes export.

## D-2026-08-21-05 — Expiry capture/report
APPROVED. Full GS1/2D auto-extracts encoded medicine data; worker enters Qty only. GTIN-only uses Qty + Month dropdown + Year dropdown. Report supports month(s), category and worker filters.

## D-2026-08-21-06 — Clean architecture rule
APPROVED. Prefer simpler production-sound architecture over repeated patches. One owner per runtime responsibility; proactively replace fragile complexity when a simpler safe architecture exists.
