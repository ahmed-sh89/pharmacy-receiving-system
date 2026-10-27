# 2026-10-26 — Receiving consolidation and review provenance (Staging)

Status: STAGING READY FOR PRODUCT OWNER VERIFICATION. Not USER VERIFIED/DONE. Production main and served Pages SHA verified `b618af9e0e55f30a616fd7e09eec9392ca6764c1`; no Production writes/deployment. Isolated branch: `fix/receiving-consolidation-review-staging-20261026`. Staging Supabase ONLY `tovkcakucyagvbzvlnks`. Runtime SHA is stamped in Preview `version.json`; final SHA/URL are included in delivery. Prior Production and TC26 visual acceptances remain historical and are not newly recertified.

Root causes: `getPerOrderReceivingRows` rendered immutable source lines as operational rows and distributed the shared receipt total back onto them. Consequently allocation `.find()` could see only the first duplicate line's capacity. Resolve preview used captured scope, but execution wrongly required *every* captured Order to be selected. Unique applicable original Orders were blocked by unrelated captured Orders/current PC selection. Normal barcode scans also bypassed the existing multi-Order allocator; live report default merged workspace Item Codes across Orders; flat exports lacked per-row Order identity.

Changed: shared per-Order Item Code projection sums ordered source quantities and reads received quantity once from the existing ledger; all callers inherit consolidated operational rows. Original sourceRows/source-item storage and transaction audit remain untouched. Scans use the existing deterministic allocator, reusing one ledger aggregate. Queue persists split receipt IDs before receipt creation and waits for all acknowledgements. Review scope checks per-row provenance, active item membership and pharmacy, automatically accepts one proven original Order, retains relevant selection checks for multiple candidates, and fails safely on missing/conflicting scope. Existing server v5 intents validate allocations before receipts; pinned retry plans, exact local receipt matching and RESOLVED short-circuit prevent duplicate writes. Live report, Excel/PDF and saved full-report view carry per-row Order identity. No database migrations, grants, RLS or Expiry/Batch/Handheld input changes.

Verification: 44 focused Node tests PASS; isolated Chromium Receiving/Search, Dashboard and immutable saved-report test PASS; Staging Preview build/syntax/diff PASS. Actual Staging authenticated-SQL-role rollback test PASS: capture three Orders, 60/10 allocation from PC1/PC2 identifiers, durable intent/finalization, duplicate receipt and repeated Resolve, foreign-pharmacy denial, exactly two receipt rows totaling70. All fixtures rolled back; subsequent independent query found zero PFRC test Orders/reviews/receipts; original pending reviews2 and intents0 unchanged. This is not a signed-in browser, parallel-client, committed persistence, or physical TC26 test. No available signed-in browser session; actual TC26 speed, committed refresh persistence and simultaneous multi-PC acceptance remain Product Owner checks. Existing backend RPCs/RLS inspected; no schema changes required.

Historical snapshots stay frozen as captured. New/current operational reports and newly captured archive/history data use the consolidated projection; incomplete older archives are not reconstructed or rewritten from guessed source quantities. Browser fixture checks saved full-report identity and independence from later workspace changes, not legacy archive migration. Anonymous/foreign scope remains server-controlled. A pre-existing intent created with a different plan fails closed and requires authorized investigation rather than silently reallocating quantities.

Exploratory legacy suites are not a full green certification: auto-allocation/performance tests contain pre-existing exact-source/cache assertions; old review quantity/master fixtures target retired v4/v5 capture contracts and can hang against v6. The selected executable suite is recorded with its exact names; duplicate-line expected rows and acknowledgement fixture were updated to the newly approved grouping/all-child confirmation rules. No business rules relaxed to satisfy tests.

Exact next action: Product Owner uses the isolated Preview, verifies Daroxime as62/62/0 Completed (or synthetic27+35), tests same code across separate Orders with70=>60/10, confirms unique-order Resolve while unrelated Orders are unselected, then refresh/two PCs/TC26 scan and filtered Excel/PDF checks. Promote only after later explicit Production approval. Critical non-regression: preserve immutable source lines, audit history, pharmacy isolation, device assignments, scanner focus/no Enter/no soft keyboard, Expiry and Batch behavior.

Details: `docs/receiving-consolidation-20261026/README.md`; focused evidence and rollback SQL in repository tests. Configuration changes in js/supabase.js, index.html and vite.config.js are Staging-only and must NEVER be promoted to Production.

---

## Reproduce the automated checks

```sh
node --test tests/receiving-consolidation-review.test.cjs tests/receiving-duplicate-line-allocation.test.cjs tests/receiving-order-attribution.test.cjs tests/work-orders-scope.test.cjs tests/handheld-scanner-rearm.test.cjs tests/receiving-split-queue.test.cjs tests/receiving-startup-hydration.test.cjs tests/receiving-safety-gates.test.cjs
```

Browser: `PLAYWRIGHT_MODULE=<installed playwright module> TC26_CHROMIUM_EXECUTABLE=<Chromium path> node tests/receiving-consolidation.browser.cjs`.

Backend: run `tests/receiving-staging-rollback.sql` ONLY via the Staging connector/project. It changes no persistent data; schema/grants are untouched. This is authenticated-role database testing, not a browser login or real physical dual-PC transaction.

Rollback: close this isolated Preview or remove the isolated branch. No Production rollback or database rollback migration is necessary. No edits were made to Production. Do not merge Staging endpoint/CSP/build guard into main.
