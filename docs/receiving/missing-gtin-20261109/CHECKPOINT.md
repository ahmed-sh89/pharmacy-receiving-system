# Missing GTIN / saved-review Quick Add — current Staging checkpoint

Date: 9 November 2026. Status: **USER VERIFIED — PASS; CI baseline correction verified locally, pending commit/push authorization**.
Product Owner visual acceptance on 9 November supersedes the earlier unavailable browser-zoom measurement.

Branch: `feature/missing-gtin-bulk-staging-20261109`.
Production base and last read-only main verification: `7e9cad2177131e80735016fde35014deb3c5a390` (unchanged).
Staging only: `tovkcakucyagvbzvlnks`, Vercel project pharmflow-test.
Stable Preview: https://pharmflow-test-git-feature-missing-gtin-7570d6-fhyh2xtskz-3504.vercel.app/

Both requested features are implemented. Authenticated Cloud Browser tests used tc26-expiry@example.invalid without changing its existing permissions. Original source snapshots and pre-existing receiving receipt fingerprints were preserved. The owner entered passwords directly; no credentials were read, copied or retained.

- Bulk: deduplicated multi-order codes, new/existing Global items, preserved approved attributes, required fields, duplicate/barcode conflict rejection, complete rollback, one Save All, persistence and authoritative health refresh verified.
- Saved review: unknown capture -> quantity 5 -> original Order -> saved Quick Add -> new Global item/link -> one confirmed receipt with exactly 5 units -> review closed -> refresh persistence verified.
- Existing-item Quick Add: two actual browser windows submitted the same quantity-2 review; one receipt totaling 2, one existing Global item, approved Group and original Order retained.
- Actual browser defects fixed: matched/missing Data Health source mismatch; stale review Items/Units; health after Refresh using numeric-only legacy cache. Manage Orders now hydrates authority once on open. The numeric cache remains intentionally unchanged. Concurrent projection reads join one request and reject late identity changes.
- Post-commit projection failures retain confirmed Saved rows and do not resubmit them; actual-handler local fault test PASS.

Applied Staging migrations only:
1. 20261109135921_receiving_bulk_mapping_review_quick_add.sql
2. 20261109140305_receiving_canonical_item_lookup_index.sql

Latest targeted run: 52 PASS, 0 FAIL. Production-equivalent and Preview builds PASS. Related baseline comparison retains two historical failing files; no whole-suite-green claim. See FINAL_REPORT.md and regression-comparison.json for exact validation limits.

Final normal desktop screenshots are in evidence/. Earlier automated 75/80% zoom verification was unavailable; the Product Owner subsequently accepted the visual design. Existing functional acceptance, 52 focused tests, Production SQL Compatibility PASS and historical regression disposition PASS are preserved without repetition.

CI remediation: the historical Duty manifest freezes Production 7f0bcc1 and was incorrectly applied to every later PR. Keep that historical record unchanged. The current Receiving RELEASE_MANIFEST pins verified Production 7e9cad2177131e80735016fde35014deb3c5a390 and accepted source 6fe902bf13335fc2c161dc5868cccf6ee2922070. All historical protected paths remain checked; Duty runtime files and the new migrations are also pinned (90 paths total). Approved changes are exact Git blobs, not excluded paths. Mutation diagnostics reject changes to Duty, deployment and approved Receiving bytes.

Local validation: corrected isolation 3 PASS; Production-equivalent build PASS; complete existing Duty readiness command 123 PASS / 0 FAIL / 1 pre-existing SKIP (previously 120 PASS / 1 FAIL / 1 SKIP). No operational source, SQL or workflow changes in this correction.

GitHub: active ruleset 26077274 verified through read-only API. Requires PR, zero approving reviews, strict up-to-date PharmFlow security checks from integration 15368; blocks deletion and non-fast-forward. Merge/squash/rebase allowed. Existing required check SUCCESS on accepted HEAD. Classic branch-protection details remain inaccessible because the integration lacks repository Administration read permission. No settings changed or bypass used.

Next: obtain commit/push approval required by AGENTS.md section 11, then commit only the isolation test, current release manifest and this checkpoint on PR #54 branch. Verify resulting GitHub checks and reverify main. Owner may supply read-only classic protection settings evidence or an authorized Administration-read connection to close that verification limit. Keep PR Draft; no merge, Production deployment, or database actions authorized.
