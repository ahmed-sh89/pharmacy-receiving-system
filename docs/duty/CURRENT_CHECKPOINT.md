# Duty Production Readiness · 5 November 2026

**BLOCKED — NOT READY FOR PRODUCTION. Staging only; draft PR #43.**

## Authoritative state

Repository `ahmed-sh89/pharmacy-receiving-system`; branch `feature/duty-staging-20261104`.
Implementation commit: `d89296b8fa44bbb1bfe5de0ca7e9ba0158d9f98a`. Draft PR: https://github.com/ahmed-sh89/pharmacy-receiving-system/pull/43 (not merged).
Recovery source: `1c2879676a1be354805bdb594ec48d29340a6fae`; previous XLSX repair `fb0a8fddd340cba22cfaf73f6280960f06a0a16c`.
Production main verified unchanged at `2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f`.
Staging DB exclusively `tovkcakucyagvbzvlnks`. No main merge, Pages deployment, Production database call or Production Duty activation.

Recovery inspected the branch's 27 commits, all 42 existing PRs (open and closed), all branch pages and the surviving local Duty workspace. No readiness branch, commit, PR or recoverable uncommitted readiness implementation was found. The surviving workspace remains untouched; this work used an isolated copy and verified runtime files against GitHub blob hashes. This does not establish what was once held only in the inaccessible conversation's memory.

## Implemented and locally verified

- Duty is a normal runtime module, registered after Expiry. Administrator → existing Permissions dialog has Duty Enabled/Disabled. Default is Disabled for existing and new pharmacies, including System Administrator module access. The existing Receiving/Expiry authorization helper and v1 permission writer remain unchanged. The new v2 permission writer preserves their fields and uses existing policy revisions and audit.
- Hidden navigation, route authorization, scoped RPC rules, disabled-page CSS and server-side Duty authorization. Revocation clears Duty schedule/clipboard state; a rejected server read triggers permission revalidation. No demo button in Production.
- Server-authoritative Duty settings, employee Basic defaults and effective-date history, dated pharmacy/employee rules, editable display codes with immutable schedule keys, atomic holiday ranges with names/notes, manual categories and pending Working days. New table uses RLS default deny and RPC-only access. No browser schedule persistence or new sync loop: existing visible-Duty 15-second reads/focus refresh are reused.
- SQL and client calculations agree, including shift-start dates, inclusive rule intervals, employee priority, explicit manual zeros and Holiday OT on Friday holidays (the newer approved demo behavior). Completed-month hours cannot be changed indirectly through settings. Earlier effective-date history is preserved by bulk updates. Existing Staging Duty employee, entry and holiday counts were all zero before migration.
- Existing approved screens, schedules, Copy Values E:L, both XLSX formats and inline report preview retained. Report changes only connect the existing projection to the persisted holiday precedence.

## Staging migration

Applied `20261105183357_duty_production_readiness_staging.sql` exactly once to Staging, after local PostgreSQL tests. Supersedes the old **unapplied** `STAGING_MANUAL_HOURS.sql` proposal; do not apply both. Original three Stage A/B migrations remain unchanged.

Before/after: all 12 existing Staging policies remain Duty Disabled. No real employee or pharmacy records used in tests. Live synthetic rollback-only SQL passed default denial, save/read, manual allocations, rule persistence, holiday precedence, CAS, completed-month locks, tenant isolation, staff write rejection, revoked sessions and anonymous/table denial. Fixtures were rolled back. Final counts: employees=0, entries=0, holidays=0, settings=0, enabled Duty policies=0. No disposable browser account was created.

Supabase CLI was unavailable in this runtime. The migration filename uses the actual version allocated by the hosted Staging migration tool; no timestamp or migration history was invented. Advisors retain the existing RPC-only/default-deny and SECURITY DEFINER notices; the new table also deliberately has no client grants or policies. No broad grants were added.

## Verification and open gates

- 39 Duty automated tests PASS (includes embedded PostgreSQL, projection, Copy Values, both workbook formats and independent ZIP/XML validation for 28/29/30/31 days).
- 137 focused regression tests PASS across permissions/reconnect, authentication, Handheld readiness, Receiving/email/KPI and Expiry capture/session state.
- Staging and Production builds PASS locally (build only; no Production connection or deployment). Four runtime Pages artifact/security checks PASS. New Duty readiness CI workflow builds/tests only and has no deploy or database credentials.
- GitHub CI PASS on implementation `d89296b`: Duty readiness checks [42086333198](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42086333198), required PharmFlow security checks [42086333139](https://github.com/ahmed-sh89/pharmacy-receiving-system/actions/runs/42086333139). No protected Receiving/Expiry/auth/Handheld business file changes in the reviewed PR diff.
- Two legacy Settings tests cannot run locally because this recovered checkout lacks historical git objects `ef0077c` and `66ac0b2`. No assertions were removed. A separate Expiry draft-discard test fails unchanged on the prior baseline as well as this candidate (1 versus 0). No Expiry fix attempted.
- Authenticated browser save/refresh, two independent browser sessions and actual multi-PC synchronization remain unverified in this recovery. Local browser executable unavailable; cloud browser cannot reach the local build. The implementation Preview `https://pharmflow-test-qq5ur5108-fhyh2xtskz-3504.vercel.app/` remained INITIALIZING in Vercel and displayed “Deployment is building” in the cloud browser, with no build events returned. No deployment failure or success is claimed. Continue when that exact candidate Preview is available; match version.json to the candidate SHA.
- Native Microsoft Excel 2016/2019 and actual online-template Copy Values acceptance remain USER TEST pending; native Chrome 75–80% zoom is also not verified. Prior historical verification is preserved in `HISTORY_BEFORE_READINESS_20261105.md` and is not claimed as new evidence.

## Exact next action

Verify the pushed Staging SHA and CI, then run authenticated synthetic browser save → reload → second-session read, settings/defaults/calendar propagation, disable/direct-route denial and enable restoration. Verify Microsoft Excel and disposable online-template paste if not already accepted by the Product Owner. Keep a draft release PR targeting main; do not merge or enable Production.

## Safety and rollback

All release gates stay closed. UI rollback uses the prior Duty branch SHA. Keep additive database columns/functions and disable Duty rather than drop tables or restore the old calculator after manual data exists. Disabling retains records; re-enabling restores access. A future Production release needs explicit approval, schema/dependency preflight and the three foundation migrations plus readiness migration in order. No automatic SQL deployment is wired into CI. Preserve Receiving/Expiry business logic and permissions.
