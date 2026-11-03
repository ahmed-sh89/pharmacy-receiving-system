# Duty Stage A — 4 November 2026

Status: IN DEVELOPMENT. Staging foundation implemented; final deployed visual QA pending. Stop before Stage B; Product Owner visual acceptance required.

Branch: `feature/duty-staging-20261104`. Verified Production source baseline: `2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f`. Production/main, GitHub Pages workflows, existing business logic and operational records are untouched.

Stage A: native Duty entry below Expiry, pharmacy-scoped employee/position add/edit/deactivate panels, immutable employee codes, grouped calendar, empty months, full Friday columns, sticky identity/totals, synthetic demo, keyboard cell movement, scoped styles. Scheduling, actual attendance, calculations, copying and exports are deferred to separately approved stages. Total displays 0 for empty saved schedules; synthetic sample schedules deliberately have no computed totals.

Staging target ONLY: `tovkcakucyagvbzvlnks`. Applied migration `20261103235030_duty_stage_a_foundation`; follow-up `20261103235335_duty_position_default_name_validation` applied. Four new Duty tables, three narrow authenticated RPCs, private authorization helper; no employee data imported. Session checks reuse the verified trusted-session/password policy. Active members may view, pharmacy admins/system owner may manage. New Duty ACL is independent of Receiving/Expiry module permissions. No central dashboard.

Concurrency: pharmacy advisory transaction lock + expected row revision. Stale writes fail with DUTY_CONFLICT. Employee code and position names are unique ignoring case. No delete endpoint. Audit is append-only to clients. Positions are virtual defaults until explicitly edited or used by a manually created employee. Month navigation is read only and never creates/copies schedules. No month write API in Stage A.

Sync: bounded 30-second read only while Duty is visible; focus/resume refresh shares the same single-flight path. Open edit panels are preserved; stale writes require close/reopen. Browser state is a view of server records, not an authoritative persistent store. Demo lives in memory only. HTTP timeout/token recovery uses existing authRpc without changes.

Build isolation: only exact Vercel Preview branch matches the Duty build plugin; Production endpoint is replaced in emitted Supabase config and CSP, environment is staging, version.json identifies branch/target/stage. Production build guard otherwise remains active. Vercel main deployment remains disabled. Stable branch alias to be confirmed after successful Preview. Never reuse existing main/default aliases.

Reference review: originals unchanged. Planning workbook contains multiple historical/role/helper sheets. External workbook columns A–L contain Store/date/day/time periods/OT/notes; R–Z contain ID/store/timetable/date/OT helper data. Date values disagree with weekday/month labels. Do not infer authoritative export date mapping from displayed text; resolve in Stage C. Approved rule is 9 hours ordinary daily basic; Friday-start duties all Friday OT; overnight assigned to duty start date. Holiday precedence/leave policies remain unresolved. No payroll multipliers inferred.

Verification so far: 7 focused Node suites pass, including PGlite behavioral database checks. Live Staging SQL PASS for create/edit/deactivate, CAS conflict, persisted reload across month, no auto-created month, cross-pharmacy denial, direct-table denial, staff write denial, expired-session denial and anonymous denial. Synthetic auth/users/pharmacies/employees/audit fixtures all rolled back. Staging Duty tables remain empty. Browser visual/accessibility QA and deployed asset verification pending. No claim of USER VERIFIED or DONE.

Security advisors: four RLS-without-policy notices reflect deliberate default-deny RPC-only tables with all client grants revoked. Three exposed SECURITY DEFINER RPC notices are intentional reviewed narrow APIs; each checks live trusted session + pharmacy membership/admin status and fixed search_path; PUBLIC/anon EXECUTE revoked. No unrestricted RLS policy added to suppress an advisory. Existing unrelated advisor notices remain outside scope.

Next: complete deployed Preview/alias verification, visual QA, report exact SHA/URL and short owner review steps. Stop after Stage A.
