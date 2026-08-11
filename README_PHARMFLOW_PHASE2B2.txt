PharmFlow Phase 2B.2
- Removed Dashboard quick-action strip to reclaim vertical scan space.
- Functions remain available from the main navigation/sidebar.
- Added Zebra hamburger navigation drawer while preserving scan-first layout.
- Old legacy Zebra workspace is cleared once after keeping a local recovery backup.
- Restored cloud Zebra sessions are validated online before polling resumes.
- If the server reports the restored session as ended/inactive, Zebra working quantities are cleared locally.
- If validation cannot be completed because of a temporary connection/server error, local data is kept (no destructive cleanup).
- Keyboard/scanner behavior is intentionally left for the dedicated Zebra input phase.
