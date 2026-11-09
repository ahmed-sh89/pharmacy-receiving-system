# Missing GTIN / saved-review Quick Add — current Staging checkpoint

Date: 9 November 2026. Status: **STAGING FUNCTIONAL PASS — FINAL ZOOM VERIFICATION BLOCKED**.
No READY FOR USER ACCEPTANCE claim while this visual requirement remains unverified.

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

Final normal desktop screenshots are in evidence/. The two round-1 *-100.jpg files predate summary fixes. Browser zoom shortcuts did not change the measured viewport width (1363 CSS px) or panel width (1040 CSS px). Therefore requested 75/80% screenshots are BLOCKED, not PASS. Live browser network fault injection and physical TC26 testing were unavailable; these limitations are explicit in the report.

Next: owner visual review at actual Chrome 75–80%; record acceptance only after explicit owner confirmation. Keep PR Draft and Production completely untouched.
