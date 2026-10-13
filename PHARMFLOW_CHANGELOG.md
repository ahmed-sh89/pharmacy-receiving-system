# PharmFlow Changelog

## 2026-10-11 — Expiry final acceptance preparation
- Bounded private evidence-photo fetches and image decode. Failed, missing, or corrupt photos now exit loading and expose a retry control; the bucket and authenticated access path remain private.
- Same-pharmacy auth-context refresh no longer disables a previously verified Needs Review tab during transient network failures. RPC authorization remains server-enforced.
- Keyboard tab movement and closing Needs Review avoid focus-driven scroll changes.
- Confirmed current Excel export uses the same server-side search results and local filters as the Inventory table. No approved Expiry PDF/report format was found in the source records; no substitute format was added.
- Deployed candidate code commit `10af4f27c48d323d51dd6f4b819fca3416c855fd` to Staging Preview `dpl_8fXEzLivCJi9MrniMykmRaMLUpe8` (READY, Preview). HHP084 authenticated Staging membership was positively matched to synthetic pharmacy `11111111-1111-4111-8111-111111111111`.
- Updated Preview reached ONLINE / READY / SYNCED; Needs Review stayed enabled after 30 seconds idle. Existing private test image loaded and opened, but the stored fixture is a solid red placeholder rather than a representative camera photo. No HHP review case or Storage object changed; scheduler remains paused.
- Focused Expiry tests pass. Full suite remains 31 passed / 10 known baseline failures.

## 2026-10-11 — Staging connectivity recovery and Expiry local resolution
- Recovered Staging startup/read compatibility for auth setup, pharmacy registration/assignment, application context, Active Order Manifest, workspace generation, and Receiving delta reads.
- Applied additive Staging migrations for pharmacy-local Expiry review resolution and missing authenticated, tenant-scoped workspace/manifest/Receiving ledger writes. No data backfill or operational test transaction was performed; the photo cleanup scheduler remains paused.
- Preserved Global Master elevated write authorization. Expiry review resolution now creates only a pharmacy-local identifier mapping and commits the review, current inventory state, event, and audit atomically.
- Fixed the modified Needs Review template syntax and cache-busted the affected Expiry scripts.
- Authenticated existing Preview smoke showed ONLINE / SYNCED on SYNTHETIC-B. Final corrected candidate Preview is pending branch deployment.
- Full test suite: 31 passed, 10 known baseline failures unchanged. Focused Expiry and startup fixture tests pass; build and syntax checks pass.
- Destructive manifest clear/reset RPCs remain absent due missing source dependencies and are outside this non-destructive connectivity step.

## B10 Clean22
- Removed generic files:updated ownership of full cloud-workspace writes.
- Preserved structural manifest dirty sync and explicit lifecycle workspace persistence.
- Added cache-bust for cloud-workspace.js.


## 2026-10-13 — Expiry Round 2 — local candidate, not deployed

Saved two top-level tabs, current-session batch projection, summary/status and canonical scoped UI refinements. Group dialogs preview only; missing atomic grouped RPC blocks writes. No live data/schema changes. Browser authentication blocks rendered verification and release. See docs/expiry-round2-verification.md.


## 2026-10-14 — Approved Enterprise Expiry refinement

Canonical compact toolbar/enterprise navigation, unified scanning workspace, readable scan/search identification and six-column session table. Removed unused grouped preview dialog; grouped actions disabled. Prepared proposed atomic SQL and local tests, NOT applied to Supabase. Inventory/Receiving/Handheld protected.
