PHARMFLOW 2C.11.3.4 — CONSOLIDATED EXPIRY HISTORY RELEASE

THIS SINGLE ZIP REPLACES:
- 2C.11.3.2
- 2C.11.3.3

Do not upload those two packages separately if using this release.

Upload/replace all files in this ZIP at their matching repository paths.

PC:
- CAPTURED counter.
- Single-record Delete.
- Delete All only in All Devices + All History.

HANDHELD:
- RECENT counter.
- View-only Expiry History.
- No Delete / Delete All.
- Clear Screen remains available.

IMPORTANT:
Delete All depends on the protected pharmacy-scoped Supabase RPC:
delete_all_pharmacy_expiry_captures(p_pharmacy_id)

Recommended commit:
Consolidate expiry history controls
