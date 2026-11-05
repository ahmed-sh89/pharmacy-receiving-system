# Duty development changelog

## 4 November 2026 — Stage B candidate

Refined weekly layout, employee groups, AM/PM split/overnight cells and compact controls. Added inline editing, integer-minute totals/categories, OFF/leave ranges, notes, highlight stripes, user-marked holidays, Copy/Paste/week/range/previous-month reuse, completed-month locks and historical snapshots. Applied Duty-only `20261104013200_duty_stage_b_scheduling` on Staging.

20 automated tests/live SQL PASS; real concurrent DB sessions demonstrated one success/one stale rejection. Disposable fixtures removed. Browser demo scheduling/copy/leave/management PASS. Authenticated browser verification blocked by rejected Staging credentials. 75/80 screenshots use CSS preview scale; native Windows zoom pending. READY FOR TEST. No Production, export or confirmed-attendance release.


## 4 November 2026 — Stage A

Added independent Staging Duty foundation, employee and position management, empty-month calendar, grouped rows, complete Friday highlighting, sticky employee identity/totals, synthetic-only visual demo, guarded Preview build and RPC-only audited persistence. Preserved Receiving/Expiry/authentication code and Production.

Focused tests and rollback-only live SQL verified. Preview deployed successfully on the new stable Duty branch alias. Employee/position panels and synthetic calendar browser-tested. Fixed Friday header inheritance through scoped corporate design tokens, preserving all shared CSS. READY FOR TEST; Product Owner acceptance, authenticated browser save and real multi-PC acceptance remain pending. No Stage B work authorized.

## 5 November 2026 · Readiness recovery

Recovered from GitHub head `1c28796` without changing the surviving workspace. Added default-deny Duty authorization to the existing Administrator Permissions architecture, normal runtime wiring, scoped client/server guards and durable Duty configuration/manual-hour/calendar contracts. Applied Staging migration `20261105183357` only. Added PostgreSQL readiness and permission regression coverage. Release remains blocked pending authenticated browser/two-session and Product Owner acceptance; no Production action authorized or performed.
