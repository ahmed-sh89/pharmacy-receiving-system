# PHARMFLOW CURRENT CHECKPOINT

Date: 21 August 2026
Version: Phase 2C.11.1.8 — Handheld Idle/Wake Root Fix
Status: READY FOR TEST

## USER VERIFIED / PROTECTED
- Unified Pharmacy Workspace direct Handheld Receiving.
- Known item scan on PC and Handheld.
- PC↔Handheld normal synchronization baseline.
- PC Last Scan remains unchanged.
- CLEAR SCREEN is visual-only.

## NEW BUG
After approximately 5 minutes with no scanning, the Handheld Receiving page remained visibly ONLINE / WORKSPACE SYNCED but stopped accepting hardware scans. User had to reload the page and re-enter Receiving.

## CLASSIFICATION
Handheld browser/input focus lifecycle.
The workspace was still synchronized; this was not an Active Order or GTIN resolution failure.

## ROOT CAUSE
The Handheld runtime refreshed visual READY state periodically but only restored hardware scanner focus on mode entry / explicit visibility changes / transaction completion.
Android Chrome can silently drop the focused input target after idle time while the document remains visible.
DataWedge then has no active scanner input target, so the physical scan appears to do nothing.

## ROOT FIX
- Added local scanner-focus watchdog every 900 ms.
- Watchdog does NOT poll Supabase and does not alter receiving data.
- It restores focus only when:
  - page is visible,
  - Receiving or Expiry mode is active,
  - worker is not editing Quantity/photo/select/other operational fields,
  - correct scanner input does not already own focus.
- Added wake recovery on visibilitychange, window focus, pageshow and online.
- Added double repair after browser wake (30 ms + 220 ms) to survive Android resume timing.
- Workspace and receiving updates repair scanner focus after rendering.
- CLEAR SCREEN explicitly restores scanner target.
- No DataWedge configuration change.
- No SQL migration.

## EXACT TEST
1. Deploy 2C.11.1.8 directly.
2. Enter Handheld Receiving and confirm a known scan works.
3. Leave the device on this page untouched for at least 6–7 minutes.
4. Without touching/reloading the screen, press the hardware scanner.
5. Scan must be processed immediately.
6. Repeat after screen/browser loses focus then returns.
7. Quantity numeric keyboard must remain stable while worker intentionally edits quantity; watchdog must NOT steal focus.
8. Expiry scan should also recover after idle because the same scanner runtime is shared.
