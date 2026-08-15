PharmFlow Phase 2C.10.2.1 — Global Master Visibility + Historical Delete Message Fix

Changes:
- Orders page now contains a permanent Global GTIN Master status card above Active Order Files.
- The card uses the exact same status source as Settings and the top header.
- Shows ACTIVE/CACHED, Global Item count, Last Updated and System Master · Supabase.
- It is deliberately separate from Active Order Files because Global Master is a central database, not a workspace upload.
- Reset Current Workspace and Delete All Historical Data never remove Global GTIN Master.

Historical deletion notification:
- Removed the misleading "Historical deletion cancelled" warning toast from a cancelled confirmation prompt.
- A successful deletion now reports:
  Historical data deleted successfully · Global GTIN Master remains active
- Archive/UI refresh behavior is unchanged.

No SQL change is required for 2C.10.2.1.
Keep all SQL already required through Phase 2C.10.2.
