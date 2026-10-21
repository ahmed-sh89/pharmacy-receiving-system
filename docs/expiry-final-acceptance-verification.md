# Expiry final acceptance fixes — Staging evidence

Baseline: `788e60db49cb140e048711898cb6f677cfe30917`, verified against remote Staging branch and READY Preview before edits. Existing branch/project/Preview retained. Production was not accessed.

## Changes

- `js/expiry-inventory-report.js`: real Excel date serials (first day of captured expiry month, UTC calculation, `mm/yyyy` display); A4 Landscape, 9pt, no wrapping, 15pt data rows, one page wide/unlimited height, narrow margins, frozen/repeated headers and AutoFilter. Full underlying values remain intact. PDF/Print use A4 Landscape, compact rows, full exact identifiers and repeated headings. Exceptional long values wrap rather than being truncated; normal rows stay single-line. Existing paper columns and filtered/resolved report scope retained.
- `js/expiry-desktop-v2.js`: compact exact-trigger row menu to the left where possible, viewport clamping and trigger highlight; canonical Session Group; first-Operator multiselect integrated into the current draft/apply/reset architecture; exact Restore Selected / Clear Selected controls; full active pharmacy Excel remains independent of temporary UI filters.
- `js/expiry-inventory-filters.js`: Operator wire filter; canonical Group display shared by both tables/reports; missing Group `—`, readable Home Health / Mom and Baby labels, unchanged stored six Group values.
- `css/dashboard.css`: localized Desktop table widths/overflow/tooltips, same KPI/search footprint; existing filter-section geometry preserved with blue/purple/green colors; compact landscape print rules. Scanner/Handheld styles and functional code unchanged.

## Staging migration

Applied **20261020045631_expiry_acceptance_reports_filters_v1**. Replaces existing definitions with unchanged signatures/owners/permissions:

1. `pharmflow_expiry_private.inventory_match_v1`: optional exact first-Operator display-name filter.
2. `public.query_pharmflow_expiry_inventory_v1`: pharmacy-scoped Operator facets and filtering before pagination/counts.
3. `public.select_pharmflow_expiry_inventory_v1`: same filter for exact selections and filtered bulk operations.
4. `public.export_pharmflow_expiry_inventory_v1`: same filter for PDF/Print; `{}` remains full active Excel scope.
5. `public.list_pharmflow_expiry_desktop_session_v1`: additive canonical `group_name` from Global Master V2 using the effective item code.

No table, stored attribution, RLS, authorization, mutation or historical-data changes. Operator facets come only from scoped Inventory states and their durable original attribution; include historical original names where still represented in the selected active/resolved scope. No client worker-state substitution. Existing membership/system-owner access model retained. Authenticated-only public EXECUTE and private helper exclusion retained. Security Advisor findings unchanged (timestamps excluded); existing findings were not expanded into unrelated work.

## Verification

- **252 focused automated tests PASS**, production build PASS. Includes Batch case-insensitive grouping/original text, GS1 FLUTAB, capture retention/retry, Handheld focus, Operator defaults/provenance, KPI interaction/animation, Needs Review and Clear All regressions. This is a focused suite, not a claim that every historical project test passes.
- `tests/expiry-final-acceptance-staging.sql`: authenticated TC26 with an existing valid Auth session; disposable fixtures inside a transaction ending in ROLLBACK. PASS: canonical Session Group, combined Operator/Group/month filters, identical query/selection/export counts and quantities, malformed filter rejection, unauthorized cross-pharmacy query rejection, filtered Remove isolation, selected Clear retry, stale Restore rejection, selected Restore and retained historical snapshots; anon lacks EXECUTE.
- Existing `tests/expiry-resolved-clear-staging.sql` PASS after the read migration: Clear All/Restore, request conflicts, stale selection, active quantities/KPIs, cross-pharmacy Clear, actor/time/audit and history preservation; all fixture writes rolled back.
- Original data fingerprints unchanged before/after migration and rollback tests: states `0958c279346aeeea7f82bb19e948281f`, events `bbe2e70cd5d405f3715d409ee8ab484c`, operations `e7739be7b2db6cba9ff7bde0e8b1f935`, resolved `81ecfc4b5bd97a2c3c1d4db5f5ed937f`, original Operators `1d523d035d4544e23532fe88fa8f6975`.
- Actual XLSX artifact reopened using XLSX and openpyxl: expiry is a date (`2027-02-01`, displayed `02/2027`), alternate years/months retained, exact leading-zero/alphanumeric identifiers and long strings retained, 9pt/no-wrap/15pt rows, landscape A4, fit width 1/height 0, `$1:$1`, freeze `A2`, AutoFilter all ten columns. Excel date-hierarchy UI awaits Product Owner Excel testing.
- Actual jsPDF and Chromium browser-print PDFs generated for 180 rows, five A4 Landscape pages each. Pages rendered/inspected; repeated headers, compact ordinary rows, full long identifiers and mixed-case Batch, final row text verified. No identifiers abbreviated. Very long fields require taller rows to retain complete readable content. Browser/printer settings can override print defaults.
- Actual Chromium source/CSS fixtures with network blocked at **1366×768**: both tables 1085px client/scroll width (no horizontal overflow), Inventory toolbar y=242px unchanged, Home Health/Mom and Baby uncut, long employee tooltip retained; 370px filter width and existing height cap; three color sections; selected buttons visible/disabled without selection, footer fits. Row menu 142×80 next to trigger, clamped top/bottom; existing Clear All 520px confirmation and 160×80 Bulk Actions retained. Needs Review overlay remains stable. Handheld 360×640 source fixture no-scroll warning/save surface unchanged. These are real rendered source fixtures, not a claim of authenticated deployed browser or physical TC26 testing.

## Recovery and remaining acceptance

Frontend is isolated in this Staging commit. Return the existing Staging Preview to baseline code if rejected; the additive read migration remains compatible with the old client. If read-contract recovery is needed, `docs/expiry-final-acceptance-recovery.sql` contains the exact preceding live definitions; review current dependencies and apply only with authorization. No recovery deletes business data. Do not restore old read contracts while leaving the new Operator-filter client enabled: it would silently ignore that filter.

Pending: Product Owner Excel native date hierarchy/print preview, actual printer output, physical TC26, and two-PC synchronization/concurrent interaction. Connector SQL calls are serialized; no claim of simultaneous live concurrency. Existing server locks, version checks and idempotency paths are reused, with stale/order/retry tests. No remaining implementation blocker identified. Status **READY FOR PRODUCT OWNER TEST**, not DONE.
