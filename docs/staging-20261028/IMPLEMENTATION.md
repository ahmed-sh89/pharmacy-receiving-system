# Consolidated Staging delivery — 28 October 2026

Partial delivery, ready for user testing of the implemented scope. Production unchanged. DATA-001 and EXPIRY-SAVE-001 remain OPEN. No Production promotion authorized.

Baseline: Production main `08843e42399b8830af6f0eb0773f04e0269cf0b6`, independently checked against GitHub. The Product Owner states the October 28 security release is USER VERIFIED for tested workflows. Development branch: `feature/consolidated-staging-20261028`. Production Supabase `zznoshzcyxmtwfbznjyr` was queried read-only; all migration/fixture writes targeted Staging `tovkcakucyagvbzvlnks`. Vercel project `pharmflow-test`, ID `prj_SLUdsr7jh2gWtOQYj44jaKxAl1Lw`. Preview deployment identity and URL are in DEPLOYMENT.md after publication.

## Requirement status

| Requirement | Result and evidence |
|---|---|
| DATA-001 | OPEN / not implemented. Live schema uses `item_code` as Global Items PK and historical FK target; it has no independent stable item ID. Current delete RPC physically removes global and pharmacy mappings by code, checks some history domains but misses the Expiry resolution audit FK. Current cache and fallback resolution are global and preserve offline records. A deletion-only soft-delete patch would either hide a shared item globally, fail pharmacy scope, or reintroduce it through caches. No history/FK/cascade or delete-semantic change made. |
| PERF-001 | Implemented narrow CPU/network corrections. Receiving Report computed classification choices inside every row filter, repeatedly scanning workspace rows; now once per synchronous report pass. Ledger/workspace indexes are shared between selected orders. Historical item search filters before sorting, preserving duplicate-code precedence and result order. Restored sessions skip the redundant public setup-status request; context, permissions, token refresh and SEC-007 remain in force. |
| UX-001 | Same-scope revalidation preserves an existing authorized view until a replacement grant or failure arrives. Initial hydration, different identity/pharmacy, offline, malformed response, explicit permission denial and password/session rejection fail closed. Every resume still revalidates; no TTL, persisted grant or bypass. Loading text simplified to `Reconnecting...`. Capsule markup/CSS/shape/colors/dimensions/animation untouched. |
| EXPIRY-SAVE-001 | OPEN. Read-only Production evidence shows two distinct COMMITTED quantity-1 operations on different dates/devices, consistent with two separate saves. It does not establish why the browser showed Saving or prove a retry defect. A real Staging transaction discarded the first acknowledgement, retried the same operation, returned the identical acknowledgement, and retained exactly one operation/capture and quantity 1. Changed payload and cross-pharmacy save were rejected. All synthetic writes rolled back. Existing client recovery tests cover retained drafts, uncertain writes and refresh, with one pre-existing Discard test failure. No quantity or Expiry implementation change made. |
| OWNER-001 | Already implemented in existing Edit Pharmacy UI and `owner_update_pharmacy_identity_v1`. Database relationships use `pharmacies.id` UUID, not administrative code. Staging synthetic rename preserved UUID and dependent permission row; non-owner rejected. HHP084 remains intentionally protected because reference-master privileges also depend on that code. No Production code changed. |
| OWNER-002 | Implemented one Owner-area button; two sheets Items/Identifiers, keyset pagination at 750 rows, per-page Owner and live-session checks, full-content revision/count consistency checks, association checks. Workbook generation runs in a Worker using the existing pinned SheetJS. Identifier/code values explicitly text, formula-like values remain strings. No Storage writes or operational-data export. Actual Staging master: 16 items/21 identifiers. Live rollback test: 1,023 items/1,028 identifiers over multiple pages. Node collector test: 1,507/1,507. |
| UI-001 | One existing CSS rule now owns compact action button borders/radius/font/colors/alignment and hover/focus/disabled states, including a restrained Suspend color. Existing min-height 34px, padding 6px 9px, flex placement/gap and handlers retained. No action grid/cards or navigation changes. Browser visual acceptance is pending; no screenshot/layout pass claimed. |

## Measurements

Equivalent local Node VM data/functions; these measure CPU paths, not STC, Chrome on pharmacy PCs or live Production network latency.

| Path | Baseline | Candidate | Conditions |
|---|---:|---:|---|
| Receiving Report filtered search projection | 906.63ms | 9.66ms | median of 5 runs, 400 source items, 2 orders, real classification helper; identical 184 rows. Choices calls 800 → 1; ledger aggregates 2 → 1. |
| Historical Reports item search | 301.91ms | 79.09ms | median of 7 measured runs after 2 warm-ups; 30,000 transactions, same query and 40 results. |
| Restored-auth public setup step | 40.56ms | 0.25ms | controlled 40ms setup response, fresh token; redundant setup requests 1 → 0. Does not measure complete auth or hydration. |

No production before/after session-restoration, permission-hydration, full initial request waterfall, browser long-task or navigation measurement was available. Thus PERF-001 is a verified targeted improvement, not closure of every reported delay. No speculative indexes, polling or report-calculation/selection changes.

## DATA-001 blocker and smallest coherent next change

Introduce an immutable item UUID alongside the existing code PK for compatibility. Carry that UUID through exact selection/deletion. Add a pharmacy-scoped tombstone keyed by pharmacy UUID and item UUID, with scoped authorization/audit and idempotent deletion. Update every authoritative active search/resolver/fallback and the pharmacy-scoped cache/version contract together; existing Receiving/Expiry historical records must remain readable from their original identity/snapshots. Reject future writes with a deleted item, while allowing acknowledgement of a previously committed operation. Cover unused, Expiry-linked and Receiving Extra-linked fixtures, duplicate-code/identifier ambiguity, refresh, offline cache and cross-pharmacy visibility before changing Delete Item. The current schema cannot represent duplicate Global Master codes; widening it automatically was outside the safe focused change.

## Backend change

Staging only: migration `20261028012722_owner_global_items_export_v1`, adds exactly one read-only function, `owner_export_global_items_page_v1(text,text,integer)`. Explicit execute revocation from PUBLIC/anon; authenticated execute has mandatory Owner + SEC-007 session/password gate checks inside. No tables, policies, existing functions, Edge handlers, Auth configuration, historical rows or Production schema changed. Staging SEC-007 function body MD5 remained `99bda52f1b8577ac07f5c0d81bdbd8f7`. Security advisors unchanged: four pre-existing notices, no new notice.

## Verification and limits

Final focused suite: 46 tests passed, 0 failed, 0 skipped. Production/default build and exact-branch Staging build passed; Staging config, CSP and Worker binding checked. Actual Staging 16-item/21-identifier workbook was generated and read back successfully, all identifiers strings.

- New tests: permission background revalidation/denial/scope, report/search equivalence and benchmark, startup request removal, paginated collector drift/count/association/account cancellation, and actual XLSX round-trip/text types.
- Real Staging SQL tests run with scoped JWT claims and existing synthetic identities. Owner export also executed as database role authenticated. Temporary fixtures and synthetic Auth session were rolled back. SQL authorization tests are not a substitute for a signed-in browser test.
- Focused Receiving consolidation/allocation tests passed after updating their obsolete script-version expectation to the new cache version. Export workbook was generated and read back with both worksheets and text/formula-safety assertions.
- Focused security checks: 34 passed, 2 explicitly skipped. Existing security handlers, SEC-007 gate and runtime asset allowlist remain intact; Production code/config/workflow files remain byte-identical where unaffected.
- Twelve failures from Access fixtures and Expiry Discard, plus one obsolete root-ui version assertion, were reproduced on the untouched `08843e4` baseline. They are not reported as passes and were not silently fixed. Full repository regression suite not certified.
- Local Chromium unavailable; official Playwright browser download returned invalid/truncated archives. Browser visual tests and signed-in browser/multi-PC/physical Zebra acceptance remain pending. Capsule asset equality is established by source diff, not a new device screenshot.

## Minimal acceptance

On the Staging URL, sign in, open Receiving Report, type an item search, change selected order/Group and confirm the same quantities/export filters. Switch focus away/back and refresh; check recovery and that revoked/disabled access does not remain visible. As System Owner, download Global Items and confirm two sheets/16 items/21 identifiers (counts can change with later fixture work), and review compact Access actions. Existing Edit Pharmacy supports a disposable non-HHP084 pharmacy code. Do not use Delete Item to test historical deletion: DATA-001 remains unimplemented. Do not edit the real Azinc record.
