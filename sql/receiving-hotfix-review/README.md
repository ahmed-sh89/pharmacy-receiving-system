# Receiving backend and Quick Add — implementation review

Status: READY FOR IMPLEMENTATION REVIEW. NOT DATABASE-INTEGRATION-VERIFIED. NO SQL EXECUTION, COMMIT, PUSH OR DEPLOYMENT.

Base / last Product Owner-verified Production SHA: `9477ee398dcc7ea220802ed373c5befc36855967`.
Local branch: `fix/receiving-backend-contract-review`; HEAD remains the base SHA, with uncommitted changes.
The original `PharmFlow_Receiving_Backend_Review_20261021.zip` is retained unchanged. Its deferred SQL remains available under `deferred/`; it is excluded from the active manifest and must not be applied for this release.

## A. Migration decisions and exact requirements

| Migration | Decision | Reason / exact delta |
|---|---|---|
| 1 — Identity/provenance | REVISE, then required | Retain scope-aware existing-item learning and versioned learned receipts; add one atomic Quick Add composition RPC using Settings creation. No new item-creation implementation or operation table. |
| 2 — Atomic review quantity | REQUIRED for the retained atomic Needs Review improvement | Independently valuable; not a technical dependency of Quick Add. Retains the prepared quantity-at-creation contract and protects later Handheld draft quantity edits once resolution starts. |
| 3 — Deferred Extras | DEFER | Immediate Receiving and Quick Add do not need it. The approved deferred Extra safety block and current request-v5 / historical finalizer behavior remain. No new deferred allocation contract, column or constraint extension is active. |

Apply only the two active drafts, in order, after separate approval and actual database verification:

1. `01_identity_and_provenance.sql`
   - Internal `pharmflow_receiving_item_code_v1(text)`.
   - `learn_pharmflow_existing_identifier_v3(uuid,uuid,text,text,text)`.
   - `append_pharmflow_learned_transaction_v4(uuid,text,text,text,text,text,integer,text,text,timestamptz,jsonb,uuid,bigint,text)`.
   - NEW `quick_add_pharmflow_order_item_v1(uuid,uuid,text,text[],text,text,text,text,integer,boolean,jsonb)`.
2. `02_atomic_capture.sql`
   - Nullable `pharmflow_needs_review_v2.receiving_capture_request jsonb`, without default/backfill.
   - `create_pharmflow_needs_review_v6(text,uuid,text,text,text,text,text,text,text,text,text,text,text,text[],integer)`.
   - `set_pharmflow_needs_review_qty_v3(uuid,uuid,integer)`.

No new tables, indexes, RLS policies, Storage objects or configuration changes. No existing RPC signature/ACL/finalizer is replaced in the active drafts. No existing data is deleted, remapped, reclassified or backfilled. New public entry points grant EXECUTE only to authenticated and enforce server-side membership/admin/global authorization; internal canonical helper is not exposed. Each script is transactional. Timeouts bound lock acquisition; a failed script must be reviewed before retry, not blindly replayed.

These are complete ordered SQL review drafts, not registered Supabase migrations. The CLI is unavailable here; register approved versions/checksums through the authorized migration process after review. Do not apply old repository SQL or anything under `deferred/`.

## B. Approved workflow implementation

### Existing Global Master item

Authoritative Master search remains unchanged. New learning requires an existing Master row. Global-authorized learning adds a Global identifier without an unnecessary Pharmacy copy. Pharmacy-only admins can learn within their pharmacy; matching existing Global mappings are reused. Intentional matching Pharmacy overrides remain authoritative, even when a different lower-priority Global mapping exists. A conflicting target is rejected without silent reassignment.

Global and new Pharmacy learned receipts use v4 with source/ID/revision/key/code provenance. Historical queued PHARMACY_LEARNED receipts still route to v3. New learned receipts never downgrade to a generic RPC on validation/network/missing-contract errors. Mapping changes or newly introduced Pharmacy overrides block new conflicting receipts. A committed v4 receipt can replay safely after a later mapping change.

Immediate Link & Receive now pins its quantity, target/plan and transaction IDs across an interrupted partial allocation. Retry skips exact matching local receipts and applies only missing allocations. It rejects changed item/quantity/target input. Existing mapping history and historical receipt IDs are untouched.

### Find in Order — Quick Add

The immediate unknown-item dialog now has `Find Existing Item` and `Find in Order — Quick Add`. The old free-entry `Create New Item` form is removed from this dialog only. Settings creation APIs/UI and Handheld exception screens remain.

Quick Add searches the originally selected Orders by code/name, displays the source Order, and fills readonly Item Code/Item Name from the selected row. Group is required when a Master must be created. Master is rechecked on submit by the client and again authoritatively inside the server transaction. Existing Master identity/name/Group are reused; they are never overwritten from an Order.

The new composition RPC validates the authenticated pharmacy admin, captured scope, active order headers, durable source-row code/name and remaining quantity before any creation. The selected source Order is the explicit receiving target; it never redirects to another currently selected Order. Canonical Item Code matching preserves numeric formatting compatibility without normalizing/barcode-stripping identifiers.

If the Master is absent, the RPC separately checks `pharmflow_is_reference_master_admin_v1` and mandatory Group, then calls the SAME `create_pharmflow_global_item_v2` used by Settings. It does not insert Global items itself. That existing Settings contract necessarily creates a Global identifier and requires the corresponding Global write authority. It is never called using only Pharmacy mapping permission. Reuse of an existing Master can still legitimately resolve to a Pharmacy override through the scope-aware learner. No broader capability is inferred from a user's mapping permission.

For a pharmacy-only user whose selected row is missing from Master, the RPC returns a typed no-writes permission outcome; the UI leaves Save for Review available. Viewers/non-admins are blocked before the mutation request and remain blocked server-side. An identifier that has become a recognized Pharmacy mapping while the Master is absent is not silently copied globally; the user is directed to rescan it through existing recognition.

Creation, mapping audit and the one selected-order receipt occur inside ONE RPC transaction. Any failure rolls all of them back. Stable operation IDs produce `QUICK_ADD_V1:<operationId>` receipt IDs. A lost successful reply replays the exact committed receipt before checking current order availability. Different replay input is rejected. The client freezes the complete request during uncertainty and merges the authoritative receipt as cloud-synced; it never increments/queues a second local receipt. No new operation table or migration 3 is required.

### Extra Items and Needs Review

If absent from both Order and Master, the user follows `Settings → Find Barcode → Add New Item`, with existing authorization/Group rules, then rescans. Existing known-item Extra Receiving remains; the Desktop target picker now starts with `Select Target Order` so selection is deliberate. Quantity and the established immediate Extra receipt path remain. No review is automatically converted to an Extra.

Deferred Extra result blocking remains exactly as on the approved Production baseline. The current deferred in-order request-v5 allocation contract and existing finalizers remain; only its learning/provenance call uses the new scope-aware contract. Draft capture uses atomic v6 with a frozen operation request; current list/group projection and original-scope protection remain. Unknown Handheld scan-loss prevention still creates the initial scan draft before later physical-quantity edits. Those later edits use v3 and cannot race an already requested resolution; no Handheld session/scan-input redesign is included.

## C. Source changes

Runtime: `js/receiving.js`, `js/identifier-service.js`, `js/needs-review.js`, `cloud-workspace.js`, `ui.js`, `index.html`.

Tests: new `tests/receiving-quick-add.test.cjs`; retained/revised `tests/receiving-backend-contracts.test.cjs`, `tests/needs-review-quantity.test.cjs`, `tests/receiving-master-resolution.test.cjs`, `tests/global-master-group-integrity.test.cjs`, `tests/needs-review-auto-allocation.test.cjs`, `tests/receiving_sql_syntax.py`.

SQL/review material: the two active scripts above; deferred script 3; `manifest.json`; this README; `evidence/production_rpc_baseline.json` from the preceding focused read-only Production inspection. It contains definitions/ACLs, not business rows or credentials. This task did not rerun a broad database audit or execute SQL. The exact archive `review-manifest.json` enumerates every changed path and hash.

## D. Verification

57 focused automated tests PASS. Real dialog handlers execute against a synthetic event-driven DOM and in-memory RPC fixtures. Coverage: existing Master learning scope, new/existing Master Quick Add, Group, role denial and Save alternative, original source Order/quantity, partial/lost-reply retries, simultaneous submit, malformed acknowledgement, no local receipt duplication, GS1 field transport, leading-zero/alphanumeric identifiers, historical Pharmacy receipt routing, immediate Extra safety guards, atomic review capture/reopen, duplicate order lines, Group and Settings mapping precedence.

`npm run build`, changed-JS syntax checks and `git diff --check` PASS. Existing Vite classic-script warnings remain. Both active files pass SQL AND PL/pgSQL parsing via `python tests/receiving_sql_syntax.py` without database connections or execution.

NOT RUN: actual SQL creation/type binding, role/RLS integration, real rollback of a partially failed Quick Add, two-connection concurrency/deadlock tests, actual browser/device/multi-PC tests. Syntax/mocks do not prove Production database safety. No repeated Product Owner tests are requested during this review.

## E. Release safety and approval

Before execution: independent SQL/type/security review and actual database/concurrency validation are required. Recheck live baseline hashes and new-name availability. Test specifically concurrent Settings/Quick Add creation of the same canonical code, conflicting identifiers, missing Global creation authority, lost reply after commit, retry after order finalization, historical/new receipt routing, and per-pharmacy access. These remain genuine gates.

Quick Add and learning take short administration locks which can temporarily delay mapping/Settings work or order finalization. New calls bound waits and fail safely; real lock duration and normalized-Master lookup performance need database validation. The shared Settings creation contract currently couples new Master creation to a Global mapping; separate future creation-versus-mapping permissions require an explicit contract decision, not a browser bypass.

Future approved order: verify integration and backup evidence, coordinate old queue drain/client refresh, register/apply ONLY 01 then 02, verify functions/grants, then separately approve and publish the client. Do not deploy the client while new RPCs are absent. Old cached clients continue their old behavior until refreshed; no old API is revoked.

Frontend rollback to `9477ee3` must retain the additive SQL while new queued v4 receipts or v6 captures depend on it. Do not delete mappings/receipts, restore an entire database, or remove the new column to roll back. Quick Add retries use durable receipt proof, not historical data correction.

Production and the accepted Expiry branch/Preview are not modified. The earlier full deferred-Extra implementation remains preserved for a separately authorized future task and must not be promoted accidentally.

Next Product Owner action: review/approve the revised migration 1 and independently retained migration 2 for controlled database verification; keep migration 3 deferred. SQL execution, commits/pushes and deployment remain separately gated.
