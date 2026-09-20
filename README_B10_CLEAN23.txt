PharmFlow Project B — B10 Clean23 10-Minute Idle Sleep

Root-only mobile upload files:
- index.html
- cloud-workspace.js
- ui.js

Behavior:
- After 10 minutes with no real user activity, the session is paused.
- All app network requests are blocked as a failsafe until full Refresh.
- Scan/keyboard/touch/click/change/submit interactions are locked while paused.
- Only the centered Refresh button is active.
- Refresh performs a full page reload and resumes normal synchronization.
- Existing Clean22 root-cause polling/write fixes remain unchanged.
