# Consolidated Group/metrics batch — 22 October 2026

Accepted parent Quick Add: 8dd9a3c2fe2ccc322db4a05ea3afe09e30a05ad5 — USER VERIFIED PASS. This batch does not change accepted quantity, transaction or mapping logic; js/receiving.js changes only the Group label CSS class.

Implemented: canonical Global V2 Item Code Group display fallback independent of numeric identifiers; nonblank uploaded Group/sourceRows retained; shared Receiving table/filter/report display; context/version-scoped in-memory batch cache; minimal select styling; explicit Total V2 Items/Identifier Mappings/Workspace Items Loaded labels; unchanged order-scoped metrics; legacy metadata cannot masquerade as a V2 total.

New read-only SQL source: sql/receiving-hotfix-review/07_receiving_group_display.sql. Initial target identity and catalog verified Staging; apply_migration explicitly targeted tovkcakucyagvbzvlnks and returned success. Independent Staging REST 401/42501 confirms the new endpoint and anonymous denial. Connector subsequently exposes Production only and rejects Staging reads. Exact migration ID/hash and authenticated live Group result remain BLOCKED pending restored Staging read access. Do not blindly reapply. No Production SQL or write was issued.

20 focused client/cache/Group and isolated PostgreSQL role tests PASS. Build and SQL+PLpgSQL parse PASS. Legacy Expiry inventory boundary tests: 10 PASS / 4 FAIL, reproduced exactly on accepted parent; no Expiry source was edited or unrelated failures fixed. No full Quick Add backend test suite repeated. Browser acceptance of this visual batch remains outstanding.

Cleanup: no destructive retry or delete; original exact IDs/evidence retained (verification/group-batch-cleanup-status.md). No fresh authorized Staging cleanup connection. Do not touch Production HHP084.

Production package: release/quick-add-production-20261022/. Contains feature-scoped frontend patch and complete changed runtime files, unchanged Production config, SQL candidates 01/02/05/07, prepared read-only preflight, dependency hashes, metrics queries, checksums and release/recovery gates. No 00/04/06 replay; 03 deferred. Production readiness CONDITIONAL; promotion separately approved only after remaining live preflight and acceptance.
