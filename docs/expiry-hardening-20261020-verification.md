# Expiry hardening verification

## 2026-10-20 — Staging final Expiry hardening

Scope: approved eight-stage implementation on fix/staging-preview-splash-css-path. Baseline ea11911fc27d52c3c6efc6ec4e809130070b2360; Production/main and Production Supabase were not accessed. The existing branch Preview remains the release target.

Implemented: persistent red unknown-item warning; absolute token-refresh deadline, pre-scan recovery and late-refresh logout guard; proven GS1 field locks in History and server correction; existing pharmacy Operator management with authenticated administrator checks; unified 520px Desktop correction dialogs; stable in-place Needs Review with bounded search/photo layout; A4 Portrait PDF/Excel/named-page Print; durable first-Operator projection and keyboard-accessible floating Actions menu.

Operator attribution uses original operation provenance, including delayed review resolution and corrected/re-keyed groups. Timestamp/event-ID ties have a deterministic order. Inactive Operator references and original names remain in audit. New captures require an active selected Operator on Desktop and Handheld. Older corrected records without provable field provenance remain conservatively editable; new verified GS1 locks persist across quantity edits. No original scan payloads are rewritten.

Applied Staging migrations (exact SQL in supabase/migrations):
- 20261019224613_expiry_gs1_source_locks
- 20261019224744_expiry_operator_management
- 20261019225005_expiry_first_operator_attribution
- 20261019225913_expiry_locked_batch_original_text
- 20261019230034_expiry_historical_operator_reference
- 20261019230300_expiry_original_scan_operator_origin
- 20261019230341_expiry_corrected_group_operator_origin
- 20261019230852_expiry_correction_field_provenance

Verification: 274 focused automated tests PASS; production build PASS. Staging authenticated-role SQL simulation in tests/expiry-hardening-staging.sql PASS with all test writes rolled back: authorization, duplicate names, inactive Operators, GS1 tamper denial and persistent locks, ordinary edit/re-key, case-insensitive Batch quantities, first attribution after deletion/rename, delayed Needs Review resolution, and idempotent retries. Anon has no management EXECUTE; private helpers/tables remain inaccessible to anon/authenticated and RLS enabled. Existing states/events/operations fingerprints stayed exactly unchanged (73 / 248 / 187 rows).

Actual local Chromium source-fixture inspection: four Desktop dialog types, stable review overlay through resolution, private-photo presentation with synthetic evidence, 1366x768 Inventory and 360x640 Handheld. Search y=242px and workspace height=541px unchanged; Handheld warning remains red in ready state, Serial hidden and Save visible. This is not authenticated deployed-browser or physical TC26 acceptance. Long Operator names use an ellipsis with the complete value in title; no data is truncated.

Actual report artifacts: 180 rows, PDF A4 Portrait 595.28x841.89pt, 3 pages [75,75,30]; Chromium Print A4 Portrait, 3 pages; Excel reopened with all 180 rows, full values, filters, frozen/repeated heading and fit-width Portrait settings. Named Expiry print page leaves the pre-existing default page rule unchanged. Browser/printer settings can override defaults.

Known baseline test failures: Settings barcode-management subset 8 PASS / 1 FAIL; the failing new-item handler-regex test was reproduced against ea11911 source (it cannot find the handler). The older operational-UX report test expects a superseded column list. These are not marked green or silently rewritten. Full historical suite was not run; prior baseline failures are not claimed resolved.

Pending physical acceptance: 30–60 minute TC26 idle/recovery and first scan; revoked real login and logout; scan/save/scan focus chain; Operator synchronization between actual devices; real attached-photo resolution and printed-paper readability. Real parallel multi-device commit stress is not claimed: SQL idempotent retries and existing advisory/row lock paths were verified, not a concurrent load exercise.

Recovery: baseline ea11911 and docs/expiry-hardening-20261020-recovery.sql.txt. Recovery SQL is reference-only, not executed; metadata, Operators and audit are retained. Reverting frontend alone does not undo server-required Operator selection. Pause Expiry writes and review the documented recovery transaction before a separately approved rollback. No Production promotion is authorized.

Status: READY FOR PRODUCT OWNER ACCEPTANCE — NOT DONE, conditional on final Preview READY/SHA verification recorded in the delivery response.

