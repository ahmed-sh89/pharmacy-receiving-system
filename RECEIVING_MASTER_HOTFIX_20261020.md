# Receiving Master resolution hotfix — 20 October 2026

Status: READY FOR TEST for the source-only portion. The complete root-cause correction is not DONE.

Base: Production main `32b6b85068a5394f73151897c0af9064814d4742`, including the Settings Group display correction. Accepted Expiry branch `fix/staging-preview-splash-css-path` remains at `6e2a833e76e50cb46589a4eca0d03d783f95b270` and must not be updated by this hotfix.

## Source changes

- Immediate and deferred Receiving searches use `search_pharmflow_global_items_v2` through the existing IdentifierService. Search is debounced, bounded to 50 Master results, rejects stale responses, displays canonical Group, prioritizes returned items in captured scope, and matches order context by normalized Item Code. Uploaded-only rows are not selectable Master identities. Search failure does not fall back to order-only identity.
- Existing-item linking rechecks Master existence and passes the authoritative Master object to the unchanged learning contract. Group re-entry and implicit Master creation are removed from this path. Explicit new-item creation retains the existing mandatory Group/server authorization path.
- Immediate out-of-order Master selection requires an explicit Target Order and uses the established manual Extra Item receipt with ordered quantity zero and existing learned-mapping provenance.
- Deferred reviews require their captured order scope to remain selected before learning. Explicit receipt order attribution fails closed instead of falling back to a different selected order. Out-of-scope Master results are shown but cannot be resolved as deferred Extras with the present server contract.
- Immediate Save for Review uses the existing idempotent create v5 contract with a stable per-dialog operation ID, retains the returned draft on retries, and applies the entered quantity using set-quantity v2. Legacy callers retain create v4. Original-order attribution comes from captured scope. Learning/create actions are disabled after Save starts.
- Historical mappings, PHARMACY_LEARNED receipt routing, database objects, authorization, Supabase configuration, and Expiry code are unchanged.

## Verification

18 focused automated tests pass: authoritative identity and normalized order ranking, Group integrity, scope rejection, pharmacy changes, leading-zero/alphanumeric identifier transport, stable draft operation IDs, legacy draft callers, attribution, Extra Items and Receiving safety guards. Includes mocked RPC/function execution; these are not live database integration or device tests.

Stage 2 suite: 15 pass, 11 fail. The same 11 failures reproduce on untouched base `32b6b850...`; no new failures. One obsolete assertion requiring automatic Master creation from an order row was updated to the approved existing-Master rule. Global Group tests were updated for that intentional behavior.

`npm run build`, changed-script syntax checks, and `git diff --check` pass. Vite emits its existing classic-script warnings. Pages publishes the root static application, not Vite dist. Changed runtime assets receive a new cache version.

No operational Production RPCs, test receipts, mappings, fixtures, SQL writes or migrations were executed. Product Owner desktop/Handheld and cross-device verification remains outstanding.

## Server portions stopped pending separate approval

The current `learn_pharmflow_identifier_v2` still creates both Global and Pharmacy mappings in its Global-writing branch. This source release does NOT claim to fix dual-scope learning. Removing the Pharmacy write alone would break the existing learned-receipt contract. Required backward-compatible change:

1. Add a server-authorized existing-Master learning contract (or a versioned equivalent): require an existing canonical Master code; authorize scope server-side; reject conflicting Pharmacy or Global ownership; add only a Global identifier for Global-authorized learning; preserve intentional existing Pharmacy overrides; return explicit scope/source, identifier ID and revision. Keep new-Master creation separate with mandatory Group. Keep v2 callers working until migrated.
2. Add/version the learned-receipt contract to validate Global as well as Pharmacy mapping ID/revision and identifier/code, retain pharmacy membership, order attribution and transaction idempotency, and preserve historical `append_pharmflow_learned_transaction_v3` and PHARMACY_LEARNED compatibility. Update both clients and cloud upload routing together. No historical mapping deletion or transaction rewrite.
3. For deferred Extra Items, version `request_pharmflow_needs_review_resolution_v5` and its finalizer to support an explicit target inside the original pharmacy/captured order scope, ordered quantity zero, receipt-backed resolution, original review history, and deterministic retry/concurrency behavior. Current order-row validation must not simply be removed. Preserve existing in-order contracts.
4. Fully atomic quantity capture requires a versioned create-review contract accepting positive integer quantity together with the operation ID and validating repeated-operation payload equality. Existing create v5 inserts quantity one; the source-only create-then-set fix has a window in which another device could observe/resolve quantity one, and is not crash-atomic. Do not describe this as complete concurrent quantity safety.

These are contract requirements, not executable migration SQL. Exact SQL must be drafted and reviewed against live definitions before approval. No historical/test migration replay, live data copying, Group edits, identifier cleanup, or Expiry promotion is required for this source release.

## Product Owner checks

Refresh Production, then verify immediate and deferred search by Master code/name; in-order ranking and Group; immediate outside-order selection requires Target Order and records an Extra Item; Save quantity greater than one survives reopening; changing Active Order blocks an older review until its captured scope is restored. Use approved operational cases. Do not repeat an uncertain receipt to test retries in Production.

Back-port this source hotfix only into a future Expiry integration candidate after separate approval; do not alter the accepted Expiry branch/Preview. Frontend rollback uses the base SHA and does not undo any later operational transactions.
