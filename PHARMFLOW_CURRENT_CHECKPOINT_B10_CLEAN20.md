# PharmFlow Project B — B10 Clean20 Checkpoint

Status: IMPLEMENTED — USER VERIFICATION REQUIRED

## Scope
Idle polling consolidation for Project B only.

## Changes
- Fast receiving cloud reads are now driven only by real receiving transactions.
- Generic pointer/touch/key/focus activity no longer keeps the client in 3-second receiving polling.
- After 30 seconds without a receiving transaction, receiving delta reads use the 15-second idle cadence.
- Active Order manifest metadata uses a 60-second background cadence; structural order changes remain immediate writes.
- Needs Review count polling reduced from every 6 seconds to every 30 seconds and focus/visibility requests are deduplicated.
- Root-level canonical `ui.js` and `cloud-workspace.js` are loaded explicitly to match mobile GitHub upload behavior.

## Non-regression
No changes to Auth, receiving quantities, transaction writes, SQL/schema, Handheld batch semantics, or Project A.

## Next verification
Filter Supabase logs by the Project B `auth_user`, leave one Project B tab idle for 10 minutes, and compare request cadence/counts.
