# PharmFlow Current Checkpoint — 13 October 2026 (Riyadh)

Track: Staging only, feature/expiry-stage1-visual-gate.
Verified start: b72c63de49176ffe5a75fb119f06223ddaaaf77b, GitHub + READY Vercel preview; no tracked uncommitted changes.
Runtime candidate: b86ab28646da2b83c9dc52286e7c0a7ed6478854 (341a0dc Scan component refinement + b86ab286 viewport fit). Documentation-only ending SHA is recorded in the delivery.
Vercel pharmflow-test; Supabase tovkcakucyagvbzvlnks.
Preview: https://pharmflow-test-git-feature-expiry-stage1-115007-fhyh2xtskz-3504.vercel.app/

Current phase: Expiry Scan UI Refinement Round 1. READY FOR USER TEST at verified available viewport; NOT USER VERIFIED or DONE. Exact 1366×768 visual release gate remains NOT TESTED because cloud Browser exposes a fixed 1363×936 viewport and no resize API; native Windows acceptance at requested size is required before declaring the entire visual gate PASS.

Changes: remove five Scan cards; two current-signed-session metrics in 31px Scan header. Full-width semantic Active Item; aligned form/40px Save & Next. Session table Product/Identification, Batch/actual captured Serial, separate Expiry, Quantity, Edit/Delete. One persisted serial per individual receipt, never quantity-derived multi-serial associations. Serial detail dialog. Session-only dialog action labels/identity/validation/pending/destructive treatment. Canonical CSS updated in place. Parent bottom padding subtracted only for Scan viewport; Inventory geometry unchanged.

Protected: no SQL, migrations, auth, RLS, Receiving, Settings, Handheld engine, GS1 parsing, save payload, aggregation, quantity-zero, Resolve/Restore, filters, exports, or polling changes. Session has no operational checkbox column; Inventory selection and printed checkbox retained.

Tests: focused 151 PASS / 0 FAIL / 1 existing native independent concurrency SKIP. Full 602 PASS / 43 pre-existing FAIL / 1 SKIP; failure names identical to starting checkpoint. Build/syntax/diff PASS. 768px-height layout geometry covered by automated test; not a rendered visual test.
Live Staging: fresh session zero; two QA-SCAN-R1 receipts (SN-R1-001 qty1, SN-R1-002 qty2) -> summary item1/qty3; Edit second to3 -> qty4; Delete first -> qty3, audit row retained. Inventory aggregates ACTIVE3. Known green and Needs Review amber inspected; unknown draft cleared without saving a review. Dialogs/actual serial verified. At 1363×936: 31px summary, compact rows, no horizontal or document vertical overflow (scrollWidth1363/scrollHeight936/scrollTop0); table has 482px available in empty Active Item state. Seven screenshots captured across 341a0dc/b86ab286; final populated/recognized/review/dialog captures on b86ab286. Empty screenshot is pre-viewport-fit candidate and shares the unchanged capture presentation.

Outstanding: full-suite 43 baseline failures; native independent concurrency and physical Handheld remain unverified from prior release; synthetic Staging Global Master UNAVAILABLE is not addressed. No multi-serial aggregated session row exists: each capture shows its own persisted serial. No risky migration added.
Approved next Inventory round: hierarchical Expiry Month filter Year → January–December, multi-month across years. Record only; do not implement before Product Owner approves Round 1.
Next: Product Owner Scan acceptance, including native ~1366×768 visual gate, rapid scanning, summary reconciliation, Edit/Delete/serial, and draft retention. No Inventory refinements or Production promotion until approval.
