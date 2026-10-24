# Phase 1 final UX / permissions refinement
Date: 2026-10-25 (Asia/Riyadh). Staging only: tovkcakucyagvbzvlnks.
Baseline: staging/auth-access-parity-20261024 @ 59141261f9cb0b54c4fb17e1f765ea8f7795e49b.
Status: IMPLEMENTED / READY FOR PRODUCT OWNER TEST. Production untouched. No Phase 2.

## Changes
- Receiving/Expiry editor exposes Enabled (FULL) / Disabled only. Existing READ_ONLY remains selected as a disabled legacy option; no automatic upgrade. Item/Barcode levels and server authorization are unchanged.
- Compact aligned pharmacy grid, persistent Created Date from owner_list_pharmacies -> pharmacies.created_at (verified live), sticky header, hover/selection, Copy Email. Newest default / Oldest / name A-Z / name Z-A combine with KPI/search. Missing dates display an em dash, never fabricated. Existing focus, Back, search/filter/scroll and draft guards retained.
- Creation uses a compact focused panel and three required, initially unselected permission fields. Session draft contains request/operation fields only. Server-owned immutable initial choices survive retries.
- Migration 20261024215956_staging_phase1_final_permissions_ux: future policy rows default to DISABLED/DISABLED/READ_ONLY; no existing policy or historical date changed. New provisioning RPC keeps pharmacy suspended between requests, then assigns Admin, persists/audits policy and activates in one transaction. Failure rolls the entire finish back. New approval RPC assigns policy and membership atomically. Legacy provision/approval APIs are internal only. No incomplete legacy journals existed at migration time (verified count 0).
- Edge pharmflow-password-admin version 4 uses the new provisioning RPC. Existing emails never undergo automatic password reset. New/reset credentials are 20 characters with 96 random bits plus required character classes. Forced password replacement and refreshed-session flow remain unchanged. Copy Password available in handoff dialog; no credential journal/log/storage.
- Identity-only get_my_pharmacy_access_status_v1 returns the caller's suspension condition; suspended Admin sees Pharmacy Suspended rather than a new-registration form. Reactivation uses current status on next context load.
- Registration validation grows vertically with readable error layout. Auth public settings: email/signup enabled, mailer_autoconfirm=false. Logs confirm two /signup 429 email-rate-limit failures. Limits and verification unchanged. SMTP provider credentials/configuration not exposed by the connected tools; email-delivery acceptance remains blocked, not bypassed.

## Evidence
PASS: 22 focused Node tests (Auth/password/permissions plus eight new sort/create/approval/suspension/password-generator/Edge-contract tests).
PASS: eight existing selected Access behavior tests (KPI/search/selection/inline draft/focus/Back/state restoration/tab guard). Fixture updated to load the new sorting helper.
PASS: live Staging SQL transaction tests, all rolled back: required initial choices; deny before finish even after alternate Admin assignment; finish/retry; changed-choice rejection; forced permission-audit failure rolls back activation/membership/completion; approval and retry; suspension/reactivation; self-grant denial; legacy execute revocation.
PASS: existing live SQL suite rerun with rollback: independent levels, direct RPC denial, tenant isolation, mixed scopes, Pharmacy Only atomic review capture/failure, idempotency, Group, forced-password gate, HHP084 UUID Global capability.
PASS: build. Security advisor review: new public SECURITY DEFINER notices are expected for the explicitly authenticated owner-only RPCs and identity lookup (auth.uid-scoped); no new anonymous execution or RLS exposure.
NOT TESTED this refinement: live Auth HTTP create/reset/first-login/password-change, delivered registration email, authenticated visual browser acceptance and physical Handheld. Existing Product Owner PASS results are preserved history, not new claims.
Local browser binary unavailable; browser-download attempt failed. No operational mock result is represented as acceptance.
Known inherited Staging blockers remain: delete_pharmflow_order_complete, finalize_pharmflow_order, atomic_reset_pharmflow_current_workspace_v4. Full Receiving acceptance is not claimed.

## Next action
Product Owner reviews final Preview: grid/sort/focus, creation with initial permissions, legacy Read Only selection, suspension message. No Production promotion or Phase 2 authorized by this checkpoint.
