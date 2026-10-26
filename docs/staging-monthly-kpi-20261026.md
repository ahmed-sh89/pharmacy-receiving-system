# Phase B — Monthly Expiry Inventory KPI Preview

Status: READY FOR PRODUCT OWNER VISUAL VERIFICATION after Preview publication. NOT DEPLOYED TO PRODUCTION. Production baseline remains Phase A `ca7d575066af3f82c849511718aa113f58c377cd`; no further main update is authorized for this workstream.

Branch: `feature/expiry-monthly-kpi-staging-20261026`. Target: Vercel `pharmflow-test`, Preview environment only. Runtime URL/key and HTML connect CSP use only Staging `tovkcakucyagvbzvlnks`. The branch build guard rejects Vercel Production/main builds. No database, RPC, role, account, permission or operational-data changes.

## Behavior

Seven exclusive calendar buckets use the existing server summary's Asia/Riyadh month reference: current month and all earlier dates, followed by six individual months. Existing month-index interpretation is preserved. The regular 30-second read and foreground recovery update the rolling window from that server reference; year boundaries are ordinary month-index arithmetic.

Initial Inventory shows All Items, including later dates beyond the visible cards. Each click toggles one bucket; multiple buckets use the existing OR month filter. Removing the final selection restores All Items. Search, Group/Operator/month filters, sorting, page size, pagination and selection continue through the original filter serializer. Old dates plus future selections expand only the authorized month facets, not the complete history.

KPI Records/Units remain independent whole-active-inventory aggregates, matching the prior summary contract. Existing summary supplies current/past and next month; five bounded query RPCs (`p_limit:1`) supply exact future-month count/units metadata. No full-inventory download, new polling loop or new backend contract.

The existing approved export distinction is retained: PDF/Print follow the table filters; Excel exports full active pharmacy Inventory. KPI selection does not silently change the approved full-active Excel export.

Seven compact Desktop cards share month colors with Inventory date badges. Colors: red, amber, blue, violet, indigo, warm orange and slate. Dates beyond six months stay neutral and remain available. No row-wide color, extra KPI or new animation library. Responsive wrapping at narrow widths; reduced-motion handling retained. Receiving, Desktop Scan & Activity and Handheld presentation remain unchanged.

## Evidence

- 59 focused automated tests PASS, including six new monthly tests, Phase A recovery, inventory search/reconciliation, order scope and Handheld focus/scanning checks.
- Chromium: seven cards on one row at 1280/1366/1440/1920 CSS pixels, no card clipping; 80% equivalent zoom; matching distinct palette; hover/selected styles; narrow 1000/650px layouts; exact Desktop Scan and Handheld baseline pixels PASS.
- Preview build PASS. Intentional Production/main build denial PASS. Built version/config/CSP identify Staging only.
- Staging read-only checks: required query/summary/export/permission contracts exist, canonical Group and Operator filter contracts present; anonymous query/summary EXECUTE denied. Staging contains 50 active records across three pharmacies, zero resolved current-state records. No test records were added.
- Screenshots are isolated synthetic data (73 records) rendered using actual source markup/CSS, not authenticated Staging data. `desktop-80-equivalent.png` uses 1800 CSS pixels at 0.8 DPR to simulate a 1440-pixel 80% browser zoom surface; this is not a claim of manually changing Windows Chrome zoom.
- Physical Product Owner acceptance, authenticated Preview interaction and live operational writes/synchronization are not newly verified. No Production operational data was used.

Screenshots: `docs/evidence/expiry-monthly-kpi/desktop-100.png`, `desktop-80-equivalent.png`, `selected-hover.png`. Preview URL and exact published SHA belong to the final delivery report, verified against Vercel deployment metadata and served version/config.

## Files and rollback

Runtime/presentation: `js/expiry-inventory-filters.js`, `js/expiry-desktop-v2.js`, `css/dashboard.css`. Isolation/build: `js/supabase.js`, `index.html`, `vite.config.js`. Tests: `tests/expiry-monthly-kpi.test.cjs`, `tests/expiry-monthly-kpi.browser.cjs`. Records: this file, checkpoint and three screenshots.

Rejecting the Preview requires no Production rollback. No merge to main or deployment to GitHub Pages was performed for these KPIs. Any future promotion requires a new explicit Product Owner approval and replacement of the branch's Staging-only build/runtime configuration through a reviewed release.
