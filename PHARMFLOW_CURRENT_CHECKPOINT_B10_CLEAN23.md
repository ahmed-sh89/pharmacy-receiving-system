# PharmFlow Project B — B10 Clean23
Status: IMPLEMENTED — REQUIRES USER VERIFICATION

Adds a 10-minute hard idle-sleep failsafe on top of the verified/reduced Clean22 synchronization architecture.
No SQL/schema changes. Project A untouched.

Verification required:
1. Normal Receiving before idle remains functional.
2. Leave B untouched for 10 minutes.
3. Paused overlay appears centered.
4. Scan/input/click outside Refresh does nothing.
5. Supabase PharmFlow requests stop while paused.
6. Refresh resumes the workspace and synchronization.
7. PC↔Handheld synchronization remains to be verified when both devices are available.
