# Final focused Staging refinements — 28 October 2026

**READY FOR USER TEST — PRODUCTION UNCHANGED.** Based on prepared release `232f7fe1238bdf01b173b97a315f49da1540da24`, preserving the five USER VERIFIED improvements from `87be759e28c7bcc912c6cf8097d40955b10bcf6b`. Source branch `feature/final-staging-refinements-20261028`; the Production-preparation branch excludes Preview binding and the Staging migration-history file. Exact source commits/verified Preview are recorded in DEPLOYMENT.md and the delivery response.

## Export root cause and correction

V1 rehashed the entire two-table Master on all 183 requests. V2 uses a single private transactional revision row, with AFTER STATEMENT triggers on both Master tables for INSERT/UPDATE/DELETE/TRUNCATE. Any committed mutation advances the revision atomically; an aborted transaction rolls the revision back too. This avoids missing changes that do not update timestamps or change counts. Each STABLE page RPC reads revision, data and (on the first page only) counts from its request snapshot. Subsequent pages must supply the initial version; any mismatch aborts the whole file rather than mixing versions. Ordinary Master write statements gain one small revision-row update and serialize that metadata update; export reads do not update anything. Empty/no-op write statements may conservatively invalidate an export.

No export snapshot/session table, permanent workbook, Supabase Storage file or new dependency. One private singleton table (RLS enabled, no client schema/table access), one private trigger function, two statement triggers, one Owner-only public V2 RPC. Existing Master table values, relationships, permissions and V1 RPC remain unchanged. The retained V1 RPC allows old Staging pages to continue functioning; new code calls only V2. The future Production proposal installs V2, not V1.

The browser now validates and streams each 750-row page into a Worker, retaining only item/count associations on the main thread. The Worker writes UTF-8 OOXML chunks and ZIP rather than keeping hundreds of thousands of SheetJS cell objects. It uses native deflate compression when available, with a tested valid stored-ZIP fallback. The XLSX retains Items and Identifiers, the same column headers/associations and explicit text cells for codes/identifiers/names (including leading zeros and formula-looking values). CRC, ZIP and both SheetJS/openpyxl readers validate the output. No changes to existing import/report SheetJS runtime.

The server still requires auth.uid(), server-owned System Owner membership and the exact SEC-007 live-session/password gate on EVERY page. PUBLIC/anon/service_role execute is revoked; authenticated execute alone cannot bypass the internal Owner check. No browser service credential or direct Master-table route. Client rejects account changes, version drift, counts, associations and invalid/repeated cursors; Item Code ordering follows the database collation rather than JavaScript ordinal order.

## Measurements and integrity

Actual Production reference size from the preparation: **56,588 items / 78,164 identifiers**. Current Staging master is 17/22 after Product Owner work; those records are preserved. Production was not modified or used as a fixture.

| Measurement | Before | After |
|---|---:|---:|
| Complete paged workload | 183 requests | 183 requests |
| Full-Master fingerprints per export | 183 | 0 |
| Full counts per export | 366 count aggregates | 2 count aggregates, first response only |
| Isolated local writer time, same generated data | 5,497ms | 1,678ms |
| Isolated local writer process peak RSS | 737MiB | 199MiB |

Production preparation measured one V1 fingerprint pair at 2,321.66ms, implying ~7.1min repeated hashing (estimate, not a measured full export). The new full-size test executes real V2 SQL against an isolated PostgreSQL engine with Master schemas/indexes and 56,588/78,164 synthetic rows. One final local run: 183 pages, **1,426.06ms total database page work**, **952.75ms ZIP finishing**, **3,245.02ms complete SQL → validated XLSX generation**. Including independent SheetJS readback: 11,667.74ms. On the same isolated dataset, one old fingerprint pair took 539.58ms; repeating it 183 times would be ~98.74s before page/output work. This is an extrapolated local baseline, not an executed baseline full export.

Full-size XLSX: 4,764,297 bytes for the UUID/metadata fixture. Two sheets, 56,588 items and 78,164 identifiers; exact per-item identifier associations and text preserved. Independent Python ZIP CRC and openpyxl checks traversed every row. The separate isolated writer comparison uses a simpler fixed synthetic identifier fixture: its new XLSX is 3,011,351 bytes. Do not compare sizes across those fixtures.

The SQL-plus-VM test process also contains PostgreSQL/WASM, the baseline hash and a second workbook reader: its peak RSS was 1,097MiB, which is not the Worker heap measurement. The 737→199MiB comparison uses separate generation-only Node processes and identical input. **Neither is a Windows Chrome memory or end-to-end network measurement. Production-sized browser readiness is NOT certified.** Signed-in Owner download on target Windows PCs/Excel 2016/2019 and real network remains a focused acceptance item. The repeated-fingerprint server blocker is resolved; final Production promotion remains gated by acceptance of this new exporter/UI.

## UI refinements

- Removed the dedicated Export row and its margin above KPIs. `Export Data` is a compact button beside the existing Create Pharmacy & Admin control in the existing toolbar. KPI, table, search and sort markup and table sizing rules are unchanged. No action/card/grid redesign. Source/DOM tests verify placement and removal of the extra row; signed-in visual acceptance remains pending.
- Both normal startup panels show only `Loading...`. Capsule DOM, css/identity.css, colors, dimensions, animation and typography rules are byte-identical to Production. The empty normal subtitle is hidden; the genuine receiving-authority failure still unhides and displays its original detailed error and Retry control. Session/permission errors are unchanged. Accepted startup and navigation optimizations remain; no further refresh bottleneck was demonstrated or patched.
- `formatAuthRoleLabel` maps System Owner's visible owner/system_owner values to `Administrator`; both account identity render owners use it. Ordinary Pharmacy Admin still displays ADMIN; its action labels and internal roles/permission logic remain unchanged. Popover CSS/layout is unchanged.

## Verification and backend

35 focused tests PASS: V2 real SQL and mutation/rollback consistency, Owner/anonymous/revoked-session denial, hidden revision table, full-size SQL/export/reader workload, streamed collector/count/text/cursor behavior, uncompressed ZIP fallback, UI placement/role/loader/error contracts, prepared apply/rollback and exact preserved security/module boundaries, permission revalidation and report equivalence. Production/default build and exact-branch Staging build PASS; Staging runtime/CSP binding checked. Hosted CI results belong to the exact source commit; see delivery record.

Applied ONLY on Staging: `20261028022820_owner_export_revision_stream_v2`. SEC-007 MD5 remains `99bda52f1b8577ac07f5c0d81bdbd8f7`. Real Staging SQL executed the Owner RPC as authenticated, rejected non-owner and revoked Owner, detected an intervening synthetic mutation, verified anon denial/private-schema access denial. All fixture writes rolled back. Staging counts remain 17/22 and revision returns to 1. No Production migration, data/Auth/Edge changes or main merge/deployment.

## Scope and acceptance

DATA-001 deletion, Azinc/Expiry, Pharmacy Code and SEC-009 remain excluded/OPEN as previously recorded. Reports, session, permission module, security handlers, Vercel main block and Pages deployment workflow remain exact. The feature branch contains only an exact-branch Staging Vite binding; that binding is excluded from the refreshed Production preparation.

On the new Staging Preview, check Loading on Refresh, then as System Owner confirm Administrator, restored KPI spacing and Export Data beside Create. Download and open the two-sheet workbook. Production-sized Windows/browser acceptance remains pending; no Production promotion without a subsequent explicit approval.
