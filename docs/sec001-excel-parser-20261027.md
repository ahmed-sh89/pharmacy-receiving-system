# SEC-001 — Excel parser remediation, Staging only

Date: 27 October 2026, Asia/Riyadh. Status: **READY FOR TEST after Preview verification; awaiting Product Owner acceptance. Not USER VERIFIED / DONE.**

## Baseline and authorization

- Production main / served Pages baseline: `b618af9e0e55f30a616fd7e09eec9392ca6764c1`.
- Starting Staging branch/HEAD: `fix/receiving-consolidation-review-staging-20261026`, `50ef357c36c31269e7f209db27595215ab61c816`.
- Isolated remediation branch: `fix/sec001-excel-parser-staging-20261027`.
- Supabase remains `tovkcakucyagvbzvlnks`; no DB/Auth/Storage/RPC/RLS changes or migrations.
- Do not test on default `pharmflow-test.vercel.app` or git-main alias; they target Production. The exact new Preview URL/commit and served hash must be checked in delivery evidence.

## Root cause and implementation

Both HTML entries loaded xlsx@0.18.5. The primary order/mapping importer and the separate Global Master parser directly parsed user files on the UI thread. Selected exports also share the XLSX utils/SSF/CFB/write APIs.

The official, unmodified **SheetJS CE 0.20.3 full browser build** replaces the old dependency. The downloaded standalone artifact matches the same file from the official versioned tarball. SHA256 `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`. Apache-2.0 license and attribution retained; pin/source/integrity metadata in `js/vendor/sheetjs-0.20.3/`. Both CVE-2023-30533 and CVE-2024-22363 are outside the vendor's affected version ranges. No claim about all future vulnerabilities is made.

Both current and nested compatibility HTML select the same local asset with SHA384 integrity. Both import implementations call the shared `PharmFlowExcel.readFile`; the actual XLSX.read call is confined to `js/excel-parser-worker.js`. Exports continue to use the full patched main-thread API. Existing source normalization, Group rules, lifecycle/manifest, aggregation and auth code are not rewritten. No fallback to an old parser is present. The isolated branch build guard accepts only this Preview branch.

## Processing limits

| Limit | Value | Enforcement |
|---|---|---|
| Compressed/input file | 32 MiB | Before worker/File arrayBuffer read |
| ZIP declared expanded total | 128 MiB | Central-directory preflight before XLSX.read |
| ZIP entries | 4,096 | Same preflight; invalid/encrypted/multidisk/ZIP64 forms rejected |
| Worksheets | 64 | Parsed workbook validated before returning it to importer |
| Rows per sheet | 250,000 | Worksheet range checked; whole file rejected |
| Total rows | 500,000 | All sheet range extents counted |
| Columns per sheet | 256 | Far-right/unused dimensions must be cleaned rather than silently dropped |
| Materialized cells | 4,000,000 | All worksheets checked |
| Parsing worker deadline | 30 seconds | Worker terminated and actionable error returned |

These are generous ceilings relative to the two supplied workbooks (~9.4 KB, one sheet, dimension B4:H17, two item lines each) and known Global Master scale (~56k items/~78k identifiers). A synthetic 100k-row/300k-cell shape passes validation; that is not a real 100k-row import performance certification. Unknown larger legitimate workbooks need explicit limit review. No sheetRows truncation is used; every rejection is explicit, and no partial parsed workbook is returned. ZIP declared size checks are not a hard memory sandbox against maliciously falsified archive sizes; patched parsing plus isolation/deadline reduce, rather than eliminate, resource risk. Older browsers without Worker fail with a clear compatibility message.

## Focused verification

- 12 new Node tests passed, including both **original** supplier files loaded privately outside the repository, exact old/new matrix equivalence, source-line/quantity/duplicate invariants, dates, displayed text/numeric-format leading zeros, mapping, binary XLS, invalid input, limits/timeout, and Expiry XLSX package/date/style round-trip.
- 44 existing focused Receiving/Handheld tests passed: consolidation/review, duplicate-line allocation, order attribution, work scope, scanner re-arm, split queue, startup hydration, safety gates.
- Actual isolated Chromium test passed: SHA384 vendor load/version, real Web Worker, real file-selection importer and existing `renderFileList` Active Orders renderer; two original files add two order-file entries; duplicate and invalid-file errors remain meaningful; received quantities stay zero. Persistence/registry calls were mocked, and all external network was blocked. **This does not close the reported signed-in Manage Orders blocker.**
- Existing isolated Chromium Receiving/Search/Dashboard/immutable saved-report test passed. Physical TC26 and cross-PC/backend writes were not retested.
- Staging build and syntax/diff checks pass. Vite's existing classic-script copy warnings are expected; all selected classic runtime assets are copied to dist. No full-suite green claim: the inherited checkpoint identifies unrelated legacy source/cache assertions and retired-contract fixtures.

| Original file | Source item lines | Unique operational items | Ordered total | Date | Baseline matrix comparison |
|---|---:|---:|---:|---|---|
| TO-000529235.xlsx | 2 | 2 | 12 | 2026-10-26 | Exact match |
| TO-000528294.xlsx | 2 (27 + 35) | 1 | 62 | 2026-10-26 | Exact match |

The parser preserves leading-zero text and numeric display formats; GTIN zeros survive mapping/export. Existing `normalizeItemCode` intentionally canonicalizes all-numeric Item Codes by removing leading zeros to match Master/order identities. That pre-existing business rule is preserved, not presented as new zero retention through every later application layer. Alphanumeric codes remain unchanged.

Original supplier files and vulnerable baseline library are not committed. Reproduce the real-file tests with private environment paths:

```bash
PHARMFLOW_SUPPLIER_DIR=/private/original-files PHARMFLOW_BASELINE_XLSX=/private/baseline-xlsx.js node --test tests/sec001-excel-security.test.cjs
PHARMFLOW_SUPPLIER_DIR=/private/original-files PLAYWRIGHT_MODULE=/installed/playwright TC26_CHROMIUM_EXECUTABLE=/installed/chromium node tests/sec001-excel-browser.cjs
```

Without supplier paths the two real-file tests explicitly SKIP. The browser test requires them and fails if unavailable; it cannot manufacture a real-file PASS.

## Product Owner acceptance / Production boundary

Use only the exact verified new Staging Preview. Sign in to Staging, open Receiving → Manage Orders → Add Order Files, and select the two originals if not already active. Confirm both appear, TO-000528294 has one consolidated item ordered62, and TO-000529235 has two items ordered6 each. An already-active order must show the existing duplicate message rather than be uploaded twice. Export the displayed view to Excel and confirm order identity/quantities; refresh and confirm intended Staging persistence. Report PASS or the visible error. Do not reset/delete existing orders just to test.

Security remediation does not imply the separate Manage Orders backend/UI issue is fixed. If the exact signed-in workflow still blocks, preserve evidence and treat it as the separate focused blocker, not justification for a Receiving redesign here.

No merge to main, alias routing, Production deployment, Supabase write or migration is authorized. Rollback for this task is to use the previous Staging deployment/branch; Production rollback is unnecessary because Production was untouched. A future promotion must cherry-pick parser/runtime changes while retaining Production Supabase/CSP/build configuration, then perform the separate approved release process.
