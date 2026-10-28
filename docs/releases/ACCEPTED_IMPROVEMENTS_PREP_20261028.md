# Consolidated Production release preparation — 28 October 2026

PREPARED FOR PRODUCTION APPROVAL — NOT DEPLOYED. Approval is BLOCKED by the live database/concurrency gates below; no Production action authorized.

Product Owner confirms USER VERIFIED within tested Staging scenarios for all accepted improvements through97c7385b04bb1a42264df32f1c890a3a30bb16f6. Preserve this acceptance; no design acceptance is repeated. Actual main and served Pages version.json08843e42399b8830af6f0eb0773f04e0269cf0b6; served Supabase configzznoshzcyxmtwfbznjyr. Staging READY Preview97c7385, tovkcakucyagvbzvlnks. Prepared branch before integratione91304bb8854ac1797bc91039726b04cb3539db9, descended from Production, not a Staging merge.

## Included / excluded

A Reports search/filter CPU optimization, shared aggregates and report/export equivalence. B session Refresh/navigation and safe same-pharmacy revalidation; accepted optional-CDN startup decoupling and explicit secure failure/retry. C unchanged capsule with ordinary Loading... only. D Owner Export V2 revision-based streaming XLSX Items/Identifiers, text identifiers/exact associations, compact Export Data beside Create and retained KPI/table area. E Administrator presentation mapping and compact Access/Focused Action View retained. F final title/filters + search/actions toolbar, stable actions, Item Name500 and SHORT/NEW fitting. G canonical Receiving Group display/hydration, no Category fallback, Home Health alias, ambiguity/tenant boundaries and truly missing values unchanged.

Excluded DATA001 deletion, Azinc/EXPIRY-SAVE001, Pharmacy Code logic, SEC009 grants, unrelated security/business work, Stage Vite binding and applied Stage migration history. Tests contain synthetic fixtures only, never run against Production. Production config/CSP, Pages paths/workflow, main Vercel block, password/Edge handlers, Expiry and identifier service remain byte-identical to Production. No new dependency.

## Database proposal and impact

Apply only proposals/accepted-improvements-release/owner-export-apply.sql; rollback owner-export-rollback.sql. Never replay all Staging migrations. V2 adds private RLS revision singleton, restricted bump function, two statement triggers and Owner/live-session-gated paging RPC. No operational/history/master row updates or classification migration. Counts once, no per-page full fingerprints; every page rejects revision drift. No Storage/Auth/Edge changes. Guard verifies SEC007 body/ACL/owner/search_path, absence of V2/private schema, required column types, PKs and item-code index. Rollback checks function hashes/triggers, no CASCADE, preserves Master rows; revert frontend first. Private revision data is the only removed data.

Each Master write statement updates the singleton revision in the same transaction. Concurrent writers serialize until commit. Long imports can hold that row lock; differing lock acquisition orders may create deadlocks requiring normal transaction retry. Read-only stable export snapshots do not lock the revision row; a committed change causes the next request to fail safely. Trigger impact under concurrent production import/synchronization has NOT been measured here; PGlite tests do not model independent concurrent sessions. Treat this as an OPEN release gate, not a claim of safe production throughput.

Live Production schema/constraints/RLS/policies/indexes/functions/SEC007 revalidation attempted twice via Supabase connector: Unknown tool(supabase.execute_sql). No SQL executed. Prior evidence is historical, NOT proof of current compatibility. STOP before approval/application until connector restored and read-only preflight passes. No schema drift was established or ruled out.

## Focused verification and limits

51/51 focused tests PASS and Production build PASS. Guarded apply/rollback2/2PASS after final schema guards. Owner, non-owner, anonymous and revoked-session denial; permission scope; startup/error/Refresh; report equivalence; toolbar handler preservation; Group; Owner UI; security/config boundaries; pagination/XLSX integrity covered in isolated tests. Authentication fixture emulates Owner helper but copies real SEC007 source; current deployed helper/RLS cannot be certified without live access.

Full-size workload56588 Items/78164 identifiers,183 requests,2 count queries,0 fingerprints: database1315.88ms, workbook finish1000.24ms, generation3144.48ms, including readback12526.32ms; writer processRSS730MiB, peak1134MiB includes PGlite/fixture/SheetJS readback. Existing isolated writer199MiB remains earlier evidence, not a Windows measurement. This is Node/PGlite without network; actual full-size Windows browser/Excel performance remains UNVERIFIED. Product Owner Staging acceptance is retained, not expanded beyond scenarios tested.

## Exact sequence after gates and subsequent explicit approval

1 Restore live read-only Supabase diagnostics; capture schema/constraints/RLS/policies/Owner helper/SEC007 fingerprints/indexes/triggers and compare required dependencies. Recheck main and reviewed release commit; STOP on drift. Test concurrent import/write + revision lock behavior in an isolated PostgreSQL copy; require successful rollback/retry handling. Record full-size target Windows Excel/browser limit or resolve it before readiness claim.
2 Product Owner approves exact final release SHA plus apply/rollback SHA256, Production migration, main merge and automatic GitHub Pages publication. This preparation does not authorize them.
3 Apply only reviewed guarded SQL to zznoshzcyxmtwfbznjyr. Record actual migration ID/hash. Verify Owner allowed, pharmacy/anonymous/revoked Owner denied, revision ACL/RLS. Do not change backend Auth/Edge settings.
4 Merge only this green selective release to main. Existing Pages workflow publishes; Vercel main=false stays. No manual Vercel promotion. Check served SHA/config/CSP and Worker.
5 Non-destructive smoke: fresh/saved login+Refresh; Reports selected orders/search/Group/counts; Order Items normal/priority layout (avoid quantity edits/clears); Administrator and Owner Export Data. Owner workbook: two sheets, counts, exact associations, leading zeros/alphanumerics, open in Excel. Ordinary pharmacy lacks export. Observe genuine error/retry and session enforcement without operational mutation.
6 Rollback only with explicit authorization: revert reviewed release code via new main commit/Pages; preserve security release and intervening changes. Verify UI no longer calls V2; then separately approved guarded SQL rollback removes only V2/private revision objects. Do not restore or rewrite operational data.

No final deployment approval is requested while live schema/concurrency gates remain unresolved. All Production database writes/migrations, main merges, Pages/Vercel deployments, Auth/Edge/operational changes remain prohibited.

Reviewed SQL SHA256: apply `ffdcf5fc28720848508c2e82781724cd96dc5e00d2bd5f68af5bb8257bcba868`; rollback `986631439d5d77de284c6221368aedda1974eeb25fdbc899adda153f45f8ba54`.
