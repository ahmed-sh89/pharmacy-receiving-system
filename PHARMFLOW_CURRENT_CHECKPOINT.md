# PharmFlow isolated integration checkpoint — 15 October 2026

Scope: candidate preparation ONLY; no push, branch promotion, deploy or database action authorized.
Branch: integration/production-expiry-20261015, derived from exact Expiry93fba99a87c5c5a981cddbcef5555033e46ed5d8; merge complete Production26da5078163f69ca76a9169dd8d97365d7ba6c54. Merge base036ff5c7de988e5db06de1a2ddf779daef814164.

Four conflicts explicitly resolved: three entry/cache/script loading blocks; cloud manifest reset combines both states. Additional proven integration fix moves syncPromise cleanup past initialization for synchronous empty-manifest return. Version refresh now guards pending Expiry work alongside Receiving.

Verification: full755 tests/712PASS/42FAIL/1SKIP; all failure names reproduced on exact baseline(s), zero new failures. Focused619PASS/0FAIL. Production build and diff check PASS. Expiry modules and sensitive non-overlap owners byte-for-byte preserved. Full evidence and baseline failure list: docs/production-expiry-integration-review.md.

Status: candidate prepared for review; full suite is NOT green.42 baseline failures remain documented; physical operational behavior READY FOR USER TEST, not DONE. Next: Product Owner reviews merge and known test limitations before any separate approval for Staging integration. No approval yet to touch original Expiry/main or deployed Preview.

Protect: Production Receiving barcode/KPI/duplicate-line/filter/over-received/idle/version hotfixes; accepted Expiry Save optimizations/durable retries/green flash/search border/diagnostic removal/Handheld/Serial/Batch/history; account isolation and no SQL changes. Clear Session stays retired. Original local dirty worktree preserved separately and must never be reset.

---

# PharmFlow Global Master Group Integrity — Gate B Preparation

**Status:** Code implementation prepared in an isolated local branch. Production SQL and deployment are not approved and were not executed.

## Verified baseline

- Repository: `ahmed-sh89/pharmacy-receiving-system`
- Reverified remote `main`: `26da5078163f69ca76a9169dd8d97365d7ba6c54`
- Latest GitHub Pages workflow: run `38631263079`, success for that SHA (14 October 2026).
- Production Supabase: `zznoshzcyxmtwfbznjyr`
- Latest recorded Production migration: `20261015022216_pharmflow_approved_import_20261015_rpc`.
- Fresh clone is clean at the same SHA before edits. Working branch: `fix/global-master-approved-groups-20261016`.
- No Production SQL, schema, item data, or deployed app was modified. Expiry sources were not edited.

## Fresh Production Group audit

| Measure | Current verified value |
|---|---:|
| Global Master V2 items | 56,575 |
| Valid populated `group_name` | 3,720 |
| Blank `group_name` | 52,855 |
| Blank Group with an approved main Group in `category` | 52,792 |
| └ already canonical legacy category values | 52,766 |
| └ `BEAUTY` / `beauty` values normalized to `Beauty` in `group_name` | 26 |
| Unresolved after approved category fallback | 63 |
| Invalid nonblank `group_name` | 0 |

The total is one less than Gate A's 56,576 baseline. The Product Owner confirmed National Day Gift Card (`9999982`) was intentionally deleted through Settings. It is absent from Global Master and excluded from classification; do not restore, reclassify, or investigate its deletion further unless a new material integrity issue appears.

`PFTEST002` and `PFTEST003` exist with blank Group and no classification values. Preserve both. Current total = 56,575, so after 61 reviewed assignments and 52,792 legacy normalizations, the expected state is 56,573 approved Groups and two preserved unresolved records, subject to a fresh preflight. The former expectation of three unresolved records is stale because `9999982` is currently absent.

## Approved workbook reconciliation

The uploaded workbook copy `PHARMFLOW_GLOBAL_MASTER_UNRESOLVED_GROUP_REVIEW_20261017(3).xlsx` matches the approved 61/3 distribution in the Product Owner note. Values were read from its Approved Group column and matched to Production by exact `item_code` plus `item_name`, not row position. All 61 approved codes exist exactly once, have blank Group, and have no pre-existing conflicting approved classification.

| Product Owner label | Approved rows | Stored canonical value |
|---|---:|---|
| Medicine | 22 | Medicine |
| FMCG | 14 | FMCG |
| Beauty | 12 | Beauty |
| Home Health | 9 | HomeHealth |
| Supplement | 4 | Supplement |
| **Total** | **61** | |

Three workbook rows remain blank: `PFTEST002`, `PFTEST003`, `9999982`. The two PFTEST items remain present legacy exceptions. `9999982` was intentionally deleted and is absent; it will not be restored or classified.

## HomeHealth naming decision

Store one canonical value, `HomeHealth`, to remain compatible with Production data and existing interfaces. Show the Product Owner's approved readable label, `Home Health`, in selectors, filters, Receiving rows, and exports. The SQL normalizer accepts either spelling and writes only the canonical value. This avoids mixed stored values while implementing the preferred display name. The allowed set remains exactly six Groups.

## Root cause and correction

- `create_pharmflow_global_item_v2` currently permits null `group_name`.
- Production `learn_pharmflow_identifier_v1` currently auto-creates a missing reference-pharmacy Global Item by calling `create_pharmflow_global_item_and_learn_v1` with three null classification values.
- The Settings Barcode Control creation form sends no Group.
- `PharmFlowClassificationFilters` uses any `category` value as a Group and derives choices from arbitrary data; subordinate values can leak into the Group filter.

Prepared code adds a controlled selector to new Global creation, uses a versioned Receiving-learning RPC, and changes the old learning RPC into a compatibility delegate. Existing Global items continue through the no-Group link path; the reference-pharmacy creation branch alone requires Group. Pharmacy-scoped mappings keep their existing scope. Needs Review remains Group-free. The database creation RPC validates Group server-side and keeps current authentication, HHP084, operation-ID, locking, identifier uniqueness, idempotency, and audit checks. No broad table NOT NULL constraint is introduced.

## SQL package and impact

- SQL: `PHASE2C1173_GLOBAL_MASTER_GROUP_INTEGRITY.sql`
- It is one transaction containing the approved-Group normalizer, creation enforcement, compatible `learn_v1` wrapper, new `learn_v2`, a locked/audited Group normalization, and 61 explicit workbook assignments.
- The legacy pass changes `group_name` only when existing `group_name` is blank and `category` is exactly a normalized approved main Group. It also normalizes equivalent approved `group_name` casing/whitespace. It never replaces subordinate `category` or `sub_category`.
- The 61 explicit mappings are pinned in the SQL with names and exact item codes. The migration checks the 61-item set, names, existing classification conflicts, current invalid Groups, and post-update preservation. Errors roll back the entire transaction.
- It adds a restricted, RLS-enabled before-image audit table. There are no new direct client grants.
- Expected writes: at most 52,853 `group_name` values (52,766 canonical legacy categories + 26 case-normalized legacy categories + 61 reviewed assignments); no item/identifier/transaction rows are inserted or deleted. The migration aborts if its exact 56,575-item baseline differs from 3,720 canonical Groups, 52,792 recognized legacy categories, 63 unresolved items, or the 26 case variants.

**Impact:** A transaction updating roughly 52.9k rows will hold row locks and generate WAL. Schedule the eventual approved run in a controlled window, take/confirm a recoverable backup, and capture baseline counts. The migration does not change search indexes or receiving quantity data. Since this is a SQL package, its execution remains blocked pending explicit approval of this exact file.

**Recovery:** Any SQL error rolls the single transaction back. After commit, keep audit evidence. First roll back the client release if needed; do not remove the Group validator or loosen server enforcement. Before any data recovery, compare current rows to the audit table and restore only rows whose current Group still equals the migration's `new_group_name`; do not overwrite subsequent edits. A recovery SQL file must be reviewed against live rows at that time.

## Expiry integration contract

Expiry remains untouched and is not part of this Production release. Its future integration must read and validate canonical `group_name` first, accept a validated legacy `category` fallback only when it normalizes to one of the six main Groups, and never treat Hair Care/Skin Care/Makeup & Accessories as Groups. Require Group only for actual new Global Item creation; existing-item identifier linking and Needs Review submission remain Group-free.

## Runtime and release gates

No SQL package was executed, no Production data changed, and no Production deploy was made. Isolated SQL/RPC/authentication tests were blocked because supplied Staging project `tovkcakucyagvbzvlnks` returned permission denied for project details and read-only SQL. No Staging data was modified. The preferred release sequence is the reviewed SQL migration followed promptly by the app deploy, because the client uses `learn_pharmflow_identifier_v2`; during a migration/deploy gap, old clients fail closed for new Global Item creation but keep existing-item linking. See `PHASE2C1173_GLOBAL_MASTER_GROUP_INTEGRITY_RECOVERY.md` for the distinct data and RPC recovery rules.

See `PHARMFLOW_GLOBAL_GROUP_GATE_B_TEST_MATRIX.md`, `PHARMFLOW_GLOBAL_GROUP_GATE_B_DECISIONS.md`, and `PHARMFLOW_GLOBAL_GROUP_GATE_B_CHANGELOG.md` for detailed status.