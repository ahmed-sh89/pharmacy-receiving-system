# Receiving UI / Group checkpoint, test matrix and changelog — 2026-10-28

Baseline feature/final-staging-refinements-20261028 HEAD6fa6937cbdac1a761683919df3ad0c87cda0932d, live READY Preview/version.json same SHA and staging tovkcakucyagvbzvlnks. Includes accepted startup420a105. Production protected.

Toolbar: remove obsolete fixed-width scrolling row rules that conflict with Grid. Keep compact two-row controls; reserve three adjacent priority action slots on Desktop so Print/Clear do not move High Priority or shrink Search. Item Name weight700(default bold) to600 only; family/size/color/row spacing retained. No search/sort/priority/printing business changes.

Group diagnosis: normalizeReceiving inherited legacy Category fallback, and open item-browser snapshots were not refreshed after scoped display projection hydration. Reuse existing get_pharmflow_receiving_groups_v1, refresh the browser projection on opening, redraw after hydration, and notify open report after existing workspace hydration. No Category substitution in Receiving. Existing uploaded canonical Group/historical source boundaries remain intact. Deployed Staging RPC inspected: SEC007 require_access preserved, normalized Item Code ambiguity rejected with HAVING count(*)=1, limit1000. No barcode lookup, new endpoint, polling or writes. Context changes invalidate display scope. No migration.

Exact truly missing Staging master Groups: item_code1036607 and1012686 (group_name NULL); retain dash. No reclassification. Historical archives are not enriched/re-written. No Production data inspection/mutation required.

Focused tests4/4PASS including scope isolation, missing Group, canonical Group, HomeHealth alias, no barcode fallback, toolbar source constraints and report-equivalence/performance. BuildPASS. Broader legacy group test suite8/10PASS: old expectation of Category fallback intentionally conflicts with requested rule; old selector assertion expects retired data-new-group markup. Neither is claimed PASS. Visual zoom75/80/90/100, actual authenticated toolbar/Print/Clear and target-browser font acceptance remain OPEN until browser/user verification. No visual acceptance claimed from CSS.

Production selective preparation is NOT updated/promoted until successful browser verification. Existing release branch remains unchanged. DATA001, Azinc, Expiry, Handheld, security, startup, export and operational quantities untouched.

Rollback: revert only this Staging commit and republish Staging; no database rollback. READY FOR USER TEST — PRODUCTION UNCHANGED (browser acceptance pending).
