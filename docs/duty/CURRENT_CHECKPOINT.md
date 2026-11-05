# Duty Stage B — 4 November 2026

**READY FOR TEST. Owner acceptance pending. Stop before further stages or Production.**

Branch `feature/duty-staging-20261104`; starting head `c446562cf9c48c7ec84bbfe30ae4d72ae7b7d7dc`. Production main remains `2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f`. Browser-reviewed runtime `7c2facbef68186f385be08e7b9697e4601467028` plus the final cross-month date-range follow-up. Deployed version.json identifies the exact current head.

Stable Staging: https://pharmflow-test-git-feature-duty-staging-1396d6-fhyh2xtskz-3504.vercel.app/
Synthetic interactive preview: same origin `/duty-demo.html` (network blocked; memory-only edits reset on reload).
Database target exclusively `tovkcakucyagvbzvlnks`. No main merge, Pages deployment, Production database calls, protected module source edits or real employee imports.

## Implemented

Week default with period arrows; Week/2 Weeks/Month; default Pharmacists and separate Labor & Beauty; sticky identity/monthly totals; complete AM/PM periods and stacked splits; Friday whole-column identity, distinct holiday styling, controlled manual highlight stripes. Six pharmacists fit tested desktop geometry without vertical scrolling. Wider date modes intentionally scroll.

Direct in-cell input: Enter commits, Escape cancels, Tab commits/moves, arrows navigate outside editing. Shift-click ranges and full-date selection. Contextual notes, basic-hour override, leave ranges (including cross-month ranges, up to 1000 employee/day cells per atomic operation) and highlights. Holidays are separate explicit date actions. One compact corporate confirmation before populated batch overwrites.

Internal Copy/Paste; source-day/employee/range/week reuse; one-action week-to-next-week copying; cross-month destinations; optional previous-month copy. Destination hour categories recalculate. Unaffected cells stay intact. New real/demo months are empty; only the initial synthetic month is seeded. Draft/Active/Completed; completed months reject edits until reopened with a reason.

Integer-minute rules: ordinary basic min(actual,540); normal OT above basic cap. Friday-start duties entirely Friday OT, including Friday holidays. Other marked holidays entirely Holiday OT. No duplicated category minutes. Split breaks excluded; complete overnight duties follow their start date. OFF/Annual/Sick/Other Leave contribute zero worked time. Basic/Normal/Friday/Holiday/Total derive from the same records. Manual basic limit changes are audited. No payroll multipliers or automatic holiday calendar.

These are PLANNED schedules, not confirmed attendance. Actual attendance confirmation and export remain later-stage work. No completed export or attendance claims.

## Database and synchronization

Applied Staging migrations: `20261103235030_duty_stage_a_foundation`, `20261103235335_duty_position_default_name_validation`, `20261104013200_duty_stage_b_scheduling`. Stage B adds two independent Duty tables, four narrow public RPCs and private validators/calculators. No existing operational contracts changed.

RLS default deny, all client table grants revoked, fixed search paths, authenticated RPC checks for live session/password policy and pharmacy membership/admin access. Existing auth helpers reused without modification. Intentional RPC-only RLS and SECURITY DEFINER advisor notices reviewed; no permissive policies added.

Pharmacy transaction lock plus expected row revisions. Editor revisions captured on opening, so intervening refresh cannot turn an old draft into an overwrite. Entire batches fail on any stale cell. Final-state overlap validation includes adjacent dates/months. EMPTY is a versioned tombstone. Audit stores actor, before/after and operation reason. Historical identity snapshots preserve names/positions across later employee changes/deactivation.

Server authoritative; one guarded 15-second visible-Duty read plus focus/resume refresh. Edit/panel/confirmation states prevent background replacement. Account/pharmacy scope changes clear cached schedule and copy state. Writes reload the authoritative month before success. Demo state is isolated in memory.

## Verification and limits

20 automated tests PASS: calendars, synthetic isolation, employee/position behavior, calculations, PostgreSQL transactions, CAS, history, locks, ACL/session denial and build guards. Live rollback-only Staging SQL PASS. Two concurrent actual database sessions with distinct synthetic valid auth session IDs competed at revision 0: one committed revision 1, one DUTY_CONFLICT, one schedule audit entry. Disposable synthetic pharmacy/user/profile/session/Duty records removed afterward; no user pharmacy records changed.

Deployed browser demo PASS: Enter save/monthly total update, Tab/arrow movement, contextual basic-limit override showing 1h Normal OT, ordinary 11.5h copied to Friday becomes Friday OT, overwrite confirmation, 42-cell week copy, leave ranges/zero contribution, groups 6/4, empty December and explicit previous-month copy, invalid overlapping periods rejected, notes/highlights/Friday-holiday precedence, synthetic employee and position creation. No application console errors; extension messages excluded.

Six rows fit: at 100% table bottom 847.72px within 936px viewport; Week scrollWidth equals clientWidth at tested 100/80/75 preview scales. **Native browser zoom could not be changed by cloud shortcuts. 75/80 evidence uses explicit fixture CSS zoom, not proof of Windows Chrome native zoom.** Owner must check native 75–80%.

**Authenticated browser gate remains open:** secure Staging sign-in returned `Invalid login credentials`. No automatic retry or credential workaround. Signed-in browser save/refresh and two-browser synchronization are NOT verified. Database persistence/concurrency PASS is separate evidence, not a substitute. USER VERIFIED/DONE is not claimed.

## Next action

Owner opens stable Staging with a valid Staging account, chooses Duty, reviews Week/2 Weeks/Month at native Chrome 75–80%, creates synthetic staff only, enters split/overnight duty with Enter, refreshes and compares a second PC, tests one copy and leave range. Review supplied Week/2 Weeks/Month/inline/split screenshots. Report acceptance or focused changes. Do not proceed to export, actual-attendance workflow, Production or unrelated fixes.

## 4 November 2026 · Vertical Duty refinement

READY FOR TEST in the synthetic Staging preview at `/duty-demo.html`. The signed-in Staging Duty view shares the vertical scheduler and retains the Stage B save RPC, pharmacy scope, expected revisions and audit path. Full Saturday–Friday weeks include adjacent-month dates. Monthly KPIs use the selected month only. Shift-click and date-row selection support rectangular copy; Undo/Redo submit revision-checked compensating edits and keep the audit history.

Direct category overrides replace the same category's calculated value. Other categories remain automatic unless separately overridden. Blank restores automatic calculation. Legacy Basic limits and Friday/holiday rules remain effective for automatic hours. A manual-only day can have zero time periods.

`STAGING_MANUAL_HOURS.sql` is a proposed Staging-only migration requiring Product Owner approval under repository backend rules. It replaces three function bodies in place, adds no table or columns, does no backfill, keeps existing grants, and advertises support in the authorized schedule read. Existing rows retain their current totals. With the change unapplied, the signed-in UI gates manual entry and existing schedules continue to use Stage B. To roll back after manual entries have been saved, preserve the new reader/validator until those entries have been reviewed because the old calculator cannot interpret overrides.

Staging build and 22 automated Duty tests passed, including isolated PostgreSQL legacy and proposed-manual payloads, audit, revision conflict, validation and isolation. No connected database migration or real employee data import. Next action is Product Owner synthetic review, followed by explicit approval of the Staging SQL and authenticated two-session verification. Production and Stage C remain outside this work.

## 4 November 2026 · Focused scheduling UX

READY FOR TEST on the isolated Duty Staging preview. Compact single-line monthly KPIs, condensed navigation, selection-local actions, single-click selection, double-click editing, mouse-drag rectangles and Shift+Arrow extension. Delete clears only selected Duty cell payloads through the existing audited revision-checked save path. Multi-cell deletion and populated paste require confirmation. Undo/Redo also uses revision checks.

Staging build and 23 automated tests passed, including cancel, clear, undo, redo and rejection of stale history. The existing manual-hours SQL proposal remains unapplied. Production and unrelated modules are outside this change. Next action is Product Owner review with synthetic schedules.

### Duty visual cleanup

The grid now displays shifts, statuses and nonzero hours as static content. Double-click opens one editor for times, leave status and all manual categories. Selection actions stay above the grid. Column dividers, alternating tints and a continuous range border improve scanning. The calculation model, revision-checked writes and migration state are unchanged.

### Duty final refinement

Month is the default, with 2/4/6 staff columns, individual support filters, compact employee cards, a 00/30-minute editor preserving existing unusual values, and a centered employee/position editor. Scoped clipboard survives schedule navigation, with immediate one-to-many and rectangular paste through the existing audited, revision-checked save. Cell Color changes only the existing highlight field. Draft state remains intact.

Synthetic mode adds employee Basic defaults, dated Basic rules with an optional shift-start cutoff and employee scope, and named public holidays with notes. Precedence is an existing non-default cell Basic limit, then a matching employee rule, then a matching pharmacy rule, then the employee default. The most recently saved matching rule wins within a scope. Friday retains the existing precedence on coincident holidays. No automatic prayer deductions. The pending manual-hours SQL was not applied. Persistent rules, Basic defaults and holiday metadata require a separate authorized database contract, including server calculation and audit coverage.

### Duty Staging UX final fixes

Pharmacists and Labor + Beauty paginate separately, with an explicit custom roster and at most six visible columns. Date headers select visible staff across contiguous or toggled days. Mouse edge scrolling extends row and rectangular selections. Synthetic employee display codes are unique and editable while immutable schedule keys preserve all existing associations. Employee changes are session-only and reset on reload. Signed-in Staging continues to use the existing code-keyed database contract.

Synthetic hour rules use inclusive local shift-start timestamps. An employee-specific match outranks a general match, and the most recently saved matching rule wins within its scope. Configure separate 7-hour and 6-hour intervals where needed. Overnight hours remain on the shift-start date. Friday precedence and explicit manual-category replacement remain intact. No database migrations applied.

### Duty root-cause UX refinement

Schedule periods partition the selected month from day one, with full-month KPIs. Calendar Settings and Employees → Working Hours Settings own configuration. Synthetic Working can be marked without hours, OFF/leave clear active allocations, and Clear Cell resets the complete payload. Existing Other Leave storage is displayed as Unpaid Leave. Time pickers share one light-dismiss popover per editor. Auto derives hours from shifts; newly edited Manual allocations explicitly store all four categories, including zeros. Existing partial overrides remain readable and are preserved when editing unrelated fields. No migration or Production change.

### Duty Staging final UI/UX

The optional Date Range replaces fixed chunks and resets on month navigation. KPI totals use the entire selected month. Leave labels are grouped visually while daily records and selection remain independent. Custom staff defaults are stored only in the synthetic tab session. Holiday ranges, the editable demo Pharmacy Code label, and global Basic defaults use synthetic state. Bulk Basic applies to active employees only after confirmation and starts no earlier than today or the day after the last saved schedule, whichever is later. The internal pharmacy ID and persisted contracts are unchanged. No migration or Production change.

### Duty Staging · Six Product Owner findings

Ready for synthetic Product Owner testing. Leave labels repeat in seven-day blocks while daily cells remain editable. Duty has one centered corner heading, clear cell boundaries and selection outlines, and a compact two-column IN/OUT timetable. The empty editor opens with times and Auto selected. Existing hours-only and Manual entries reopen as saved.

Global Basic still applies to new employees. Confirmed bulk changes now show effective dates and protect earlier timed shifts per employee, without deferring a change because of another employee's schedule or a later OFF/leave record. The editor previews the same effective allocation used by cells and monthly KPIs. Legacy cell limits, timestamp rule precedence, and saved manual allocations remain intact. No SQL migration or Production change.

### Duty Staging · Product Owner correction

The previous preview reproduced 9 Basic on the November 7, 1 PM–10 PM shift after an 8-hour confirmation because the last timed shift implicitly pushed the employee default into December. Working Hours Settings now separates saving the new-employee default from a confirmed existing-employee update with an explicit effective date and named scope. On and after that date Auto hours use the new employee default unless an explicit higher-priority rule applies. Earlier dates and Manual allocations keep their previous values. The update remains synthetic and session-only.

Each leave day now shows its own label. The timetable uses one centered time range per shift. Staff, Custom Staff and Status share a keyboard-operable popover. The selected month has a solid green label and minute choices use a compact neutral group. Ready for Product Owner testing. No migration or Production change.

### Duty Staging · Clipboard, Calendar Settings and time editor

Auto clipboard entries carry scheduling inputs and use destination rules through the existing calculator. Manual copies retain their effective source allocation and flag a destination mismatch. Synthetic Holiday OT takes precedence on a Friday holiday; the signed-in RPC calculation contract remains unchanged. Calendar Settings preloads contiguous selected dates and prompts for explicit dates when selection has gaps. The editor uses shared Hour, Minute and AM/PM dropdowns, preserving saved minute values. No SQL or Production changes. READY FOR TEST pending Product Owner verification.

### 5 November 2026 · Duty Reports

Duty Reports reads the same scoped saved schedule, rules, effective Basic limits, holiday precedence and Manual hours as Schedule. Both workbook formats and the preview share a projection. The standalone Standard Timesheet uses one worksheet per employee and keeps the A–O column order from `A(2).xlsx`; Schedule Layout uses up to six employee columns per sheet with monthly totals and special-day colors.

Reference review found 12 employee blocks, 31 daily slots per block, mixed date types and no preserved formulas in A–O. A–B are metadata; the standalone export supplies pharmacy code, numeric month/year, text employee ID and name. C–D are generated date and weekday. E–H are IN/OUT 1/2. I–K are Normal, Friday and Holiday O.T. L is status/notes. M–O (In-Out, Group Start, Group Number) are reserved and left blank; P onward is excluded. Export dates are generated only for the selected month.

Copy Values is a single action for one employee and the full selected month. It writes one plain TSV rectangle with exactly eight columns E:L and one row per date, preserving blank shifts and explicit Manual zero overtime. A–D, M onward, headers and monthly totals are excluded. The compact report card retains both downloads and uses a short Paste safely disclosure. Start in column E on the employee’s first daily row. The Product Owner approved E:L as the mapping. Live formula behavior still requires verification in a disposable copy of the actual online timesheet. Pasting over a formula can replace it. No direct spreadsheet integration, SQL migration, Production or main-branch change. READY FOR TEST pending Product Owner acceptance.
