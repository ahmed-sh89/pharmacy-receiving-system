PHARMFLOW 2C.11.4.0 — REGRESSION RECOVERY

Built from the current GitHub/main ZIP supplied by the Product Owner.
Upload/replace all files at matching paths.
No SQL migration.

Focused recovery:
- Current Batch Qty is local runtime state again, not cloud-history-derived.
- Handheld Undo works from the actual visible workspace transaction.
- Dompy Handheld combined GS1 Lot is conservatively split into Batch/Expiry/Serial.
- PC Dompy parser, Conestal, sync and verified Auto Clear behavior are preserved.

RECAPPED COMMIT SUBJECT
Recover receiving batch and handheld undo

EXTENDED DESCRIPTION
Restore immediate local Batch Qty semantics, repair audit-safe Handheld Undo
after sync/reload, and normalize the Zebra-specific Dompy GS1 tail without
changing Supabase schema or the verified Unified Workspace architecture.
