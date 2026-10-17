# Regression Test Matrix — Global Master Group Gate B

Status labels: **PASS** means the listed automated source/logic/build checks passed; it does not mean Production or Product Owner acceptance. **NOT RUN** means live behavior is still unverified. No item is USER VERIFIED.

| # | Scenario | Status | Evidence / remaining test |
|---:|---|---|---|
| 1 | All six valid Groups, casing/whitespace normalization, Home Health alias | PASS (automated utility test) | Six-item exact set tested; live RPC not run. |
| 2 | Blank/invalid Group rejected for new Global Item | PASS (source contract) | New UI guard and SQL validator reviewed; execute against isolated Supabase before Production. |
| 3 | Existing Global Item + new GTIN, no Group prompt | PASS (source contract) | `learn_v2` branches to existing-item mapping without Group. Live flow not run. |
| 4 | New order item + new GTIN requires Group before Global creation | PASS (source contract) | Resolver prompts only after exact Global lookup misses; live flow not run. |
| 5 | Settings new Global Item creation | PASS (automated source test) | Six-value select is required and value is sent to the RPC. |
| 6 | Settings existing-item identifier link | PASS (existing regression + source contract) | Existing Settings identifier flow has no new Group field. Live flow not run. |
| 7 | Receiving quantity increments and order allocation | NOT RUN | Quantity/transaction code was left intact; handheld and PC acceptance still required. |
| 8 | Duplicate/conflicting identifiers and concurrency | NOT RUN | Existing advisory lock/idempotency/conflict code preserved; isolated RPC concurrency test required. |
| 9 | Reference-pharmacy and non-reference-pharmacy behavior | PASS (source review) | New Group required only in reference Global creation; pharmacy-scoped branch retained. Live RLS-isolated test not run. |
| 10 | Global Master search and filtering | PASS (utility test) | Effective main Group/fallback and exact six filter values tested. |
| 11 | Receiving Group filter only six approved values | PASS (automated utility test) | Hair Care/Skin Care/Makeup & Accessories normalize to no Group. |
| 12 | Legacy data and category preservation | PASS (migration source checks); NOT RUN (database) | SQL verifies category/sub_category before/after; no migration executed. |
| 13 | Authentication, RLS, and pharmacy isolation | PASS (source review); NOT RUN (runtime) | RPC permission boundaries retained; requires isolated authenticated tests. |
| 14 | Multi-PC synchronization and persistence | NOT RUN | No synchronization implementation changed; runtime test pending. |
| 15 | Zebra/Handheld scanning and focus behavior | NOT RUN | Resolver group UI keyboard selectors reviewed; physical handheld acceptance pending. |
| 16 | Orders, Reports, Archive, Returns Archive, Item Transfer, exports | NOT RUN | Reports Group projection changed to validated canonical lookup; broader export/archive smoke test pending. |
| 17 | Compatibility with active Expiry model | PASS (requirements documented); NOT RUN (integration) | Expiry code/branch untouched; future interface contract is in Gate B checkpoint. |

## Local automated checks

Run `npm test` and `npm run build` from the isolated branch. Record final results below after execution. The test suite contains source-contract checks and does not substitute for browser, database, handheld, or Product Owner testing.

- Focused Group/Settings/Receiving/report tests: **PASS, 15/15**.
- JavaScript syntax checks for `ui.js`, `js/receiving.js`, `js/receiving-release.js`, `js/identifier-service.js`, and `js/reports.js`: **PASS**.
- `npm run build`: **PASS** (Vite 8.2.1; classic script tags remain external as in the existing app).
- `npm test`: **79/97 pass; 18 fail**. The same 18 tests fail on a clean worktree at verified baseline `26da5078163f69ca76a9169dd8d97365d7ba6c54`; no new full-suite failures were introduced. Existing failures concern stale UI/cache expectations and unrelated account/reset tests.
- Production SQL execution: NOT RUN (explicitly gated)
- Production deploy: NOT RUN (explicitly gated)
- Product Owner acceptance: NOT RUN

## Final safety gate — 17 October 2026

- Latest approved workbook: **61/61 exact item-code/name/group matches** against the forward SQL after mapping display label `Home Health` to approved stored canonical value `HomeHealth`. Counts: Beauty 12, FMCG 14, HomeHealth 9, Medicine 22, Supplement 4. Blank rows: `PFTEST002`, `PFTEST003`, and the intentionally deleted `9999982`; no Group was inferred for blank rows.
- Read-only exception check: `PFTEST002` and `PFTEST003` remain present with `group_name`, `category`, and `sub_category` all null.
- Isolated SQL/RPC/authentication test: **BLOCKED / NOT RUN**. Supplied Staging project `tovkcakucyagvbzvlnks` returned permission denied for project details and read-only SQL. No local PostgreSQL, Docker, or Supabase CLI executable was available. No Staging data was modified. SQL execution/syntax, real auth/RLS, valid/invalid authenticated creation, existing-item linking, concurrency/idempotency/conflict, and transaction behavior remain unverified.
- Final focused run: **PASS 16/16** across Group integrity, Receiving duplicate-line allocation, and Settings barcode management.
- Build, JavaScript syntax checks, and `git diff --check`: **PASS**.
- Full suite: **80/98 PASS; 18 FAIL**, matching the 18 failures reproduced on the clean baseline; the added baseline-preflight test passes and no additional full-suite failures were identified.
- Production SQL, Production deployment, and Product Owner acceptance: **NOT RUN**.

See `PHASE2C1173_GLOBAL_MASTER_GROUP_INTEGRITY_RECOVERY.md` for the distinct data-only recovery and RPC/client recovery rules and exact production execution order.
