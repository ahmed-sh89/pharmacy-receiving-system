# Duty workflow focused verification

Synthetic data only; Production unchanged.

| Gate | Evidence | Status |
|---|---|---|
| Quiet sync | Three actual controller interval callbacks; stable data/tabs; remote-authoritative response; failure/recovery/scope change | PASS automated |
| Duration/rules | Nine-hour, overnight, split; Basic override, ordinary/Friday/holiday rules | PASS automated |
| Exact selection | November excluding Fridays; Ctrl on/off, Cancel, overwrite, Undo/Redo, notes/color | PASS automated |
| Position presets | Actual/custom keys, legacy All Positions, Quick Shift filtering, all-position server check | PASS automated |
| Persistence/isolation | SQL projection, invalid session/staff/foreign pharmacy, CAS and full conflict rollback | PASS isolated PostgreSQL |
| New migration | Existing seven hashes; new transaction commit/history and injected rollback | PASS isolated PostgreSQL |
| Staging schema | Hosted history, RLS, anon deny, no direct authenticated settings access | PASS read-only post-apply |
| Authenticated browser two-session | New workflow not yet exercised with two real sessions | NOT VERIFIED |
| Synthetic browser | Position sections/colors, position preset save, Ctrl exact selection, overwrite, Apply/Undo/Redo; CSS-scale 75/80 diagnostics | PASS with stated limits |
| Native Windows zoom | Actual 75/80/100 unavailable in automation | USER VERIFICATION REQUIRED |

Owner checks: (1) Wait three refresh intervals and switch tabs; update from a second Staging PC and test reconnect. (2) Inspect Employees/Positions/status filters and within-group reorder at 75/80/100. (3) Create/edit All/one/multiple-position presets; verify durations and legacy availability. (4) Ctrl-select November excluding Fridays, check mixed-position filtering and destination hours, Cancel/replace/Undo/Redo, refresh both sessions.
