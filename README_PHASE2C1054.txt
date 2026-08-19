PHARMFLOW PHASE 2C.10.5.4
HANDHELD RUNTIME RECOVERY

STATUS: READY FOR TEST

ROOT FIX TARGETS
#25 Handheld scan hardware event can result in no response / apparent freeze.
#26 PC Disconnect no longer forces the joined Handheld out of the session.

IMPLEMENTATION
- In Handheld Receiving, every non-empty scan-box payload is processed as scanner input.
  It no longer depends on GTIN length or per-key timing heuristics.
- Added a page-level hardware-keyboard wedge fallback if focus is lost.
- Added stale processing-lock self recovery after 5 seconds.
- Kept the existing try/finally scanner unlock.
- Added independent server termination watcher every 550 ms on joined Handheld.
- Watcher is separate from quantity/snapshot synchronization so a slow snapshot path
  cannot prevent PC End Session from reaching the Handheld.
- Handheld termination stops polling, clears session state and returns to Modes.
- No SQL migration required; existing pharmflow_end_session / pharmflow_is_session_ended RPCs are reused.

IMPORTANT LIMIT
This phase guarantees that a Handheld hardware payload reaches the common parser.
If the device itself sends an already-truncated/incorrect payload (for example only
a DataWedge-extracted subfield), the application cannot reconstruct missing digits.
The focused test will distinguish capture failure from device-output configuration.

RECAPPED COMMIT SUBJECT
Fix handheld runtime recovery

EXTENDED DESCRIPTION
Phase 2C.10.5.4
- Force Handheld scan-box payloads through scanner processing
- Add hardware-keyboard wedge fallback when focus is lost
- Recover stale scan processing locks
- Add independent server session-termination watcher
- Restore automatic Handheld disconnect after PC End Session
- Preserve existing receiving/session data architecture
- No SQL migration required
