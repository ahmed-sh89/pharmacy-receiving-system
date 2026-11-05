# Duty Stage B verification — 4 November 2026

Status READY FOR TEST. Runtime `7c2facbef68186f385be08e7b9697e4601467028`.

| Requirement | Evidence/result |
|---|---|
| 9h/short/fractional OT/split | Integer-minute model and PostgreSQL engine assertions PASS |
| Overnight/Thursday–Friday/start date | Model, DB engine and live Staging RPC checks PASS |
| Friday/holiday precedence | Exclusive minute categories, live SQL and browser demo PASS |
| Fractional accumulation | 30 one-minute duties total exactly 30 minutes PASS |
| Basic limit override | Model/validated payload/audit contract PASS |
| Destination copy categories | Browser ordinary 11.5h pasted to Friday → 11.5h Friday OT PASS |
| Copy complete week | Browser confirmation for 42 cells; copied leave visible next week PASS |
| Prior-month copy/empty future month | December starts at 0; explicit November copy fills it PASS |
| OFF/leave ranges/notes/highlight | Browser leave Nov 2–4 subtracts 27h; note dot/mint stripe/holiday precedence PASS |
| Conflict/atomic batch | PGlite rolls back batch with stale member; two concurrent live DB sessions yield one winner/one DUTY_CONFLICT PASS |
| Refresh/history/month lock | Authoritative SQL snapshots, historical names, deactivation and completed-month rejection PASS |
| Pharmacy/session isolation | Live cross-tenant/anon/staff/expired-session and direct-table denials PASS |
| Keyboard | Browser Enter save, Escape cancel, Tab moves to next date and ArrowRight moves one date PASS |
| Employee/position regression | Browser synthetic employee/role creation plus retained uniqueness/deactivation tests PASS |
| Protected modules | Exact file diff, emitted operational script equality and build guards PASS; no full operational smoke claim |
| Authenticated browser save/sync | NOT VERIFIED — secure sign-in rejected supplied credentials |
| Native Windows Chrome 75/80 | OWNER CHECK — cloud screenshot uses fixture CSS zoom only |

20 automated Node tests pass. Live SQL and actual concurrent-session evidence are separate from Product Owner USER VERIFIED. Disposable synthetic concurrency fixtures were removed. No real employees imported.

Tradeoffs: week/day reuse acts on the visible employee group unless a range is selected; custom non-Pharmacist position keys appear under Labor & Beauty. Cross-month copying fetches destination revisions. Manual colors do not classify overtime. These entries are planned duty, not confirmed attendance. Export remains deferred. Original workbooks unchanged.
