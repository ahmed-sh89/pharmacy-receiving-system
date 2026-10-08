# Expiry data integrity checkpoint

Date: 2026-10-08. Development branch: `feature/expiry-stage1-visual-gate`.
Starting SHA: `20be3a9632b5f2b5c345380cb84eb200b56efb72`.
Status: local safeguards verified; **BLOCKED / NOT READY FOR USER TEST**.

## Verified locally

- Untouched unsaved Handheld captures survive idle timers and Clear. Additional
  scans cannot replace them; workers must scan again after finishing the capture.
- Scoped IndexedDB drafts retain exact identifiers, original raw scans, quantity,
  date, worker, GS1 evidence, editable batch fields and two independent Blob roles.
  Transaction completion, not request completion, acknowledges local persistence.
- Same-tab refresh/runtime recovery is tested with an IndexedDB emulator. Local
  drafts are scoped by authenticated user, pharmacy and session tab identifier.
- Unknown saves fail closed instead of invoking the destructive legacy review RPC.
- Known saves require state/event acknowledgement; ambiguous results retain the
  capture and block resend. Successful write and display refresh failures are separate.
- Save/lookup concurrency, delayed reset, custom-select binding collision and
  worker dataset-value defects are corrected in their existing owners.
- Focused tests: 54 passed, 0 failed. Build and syntax checks passed.
- Legacy identity/source-shape suite: 11 passed, 22 failed; the same 22 failures
  existed at the starting baseline. Affected raw-scan/worker/review assertions updated.

## Server verification — read-only

Actual deployed contracts on the configured project were inspected via catalogs.
Both legacy `save_pharmacy_needs_review` overloads strip non-digit identifiers.
`create_pharmflow_needs_review_v3` only accepts Receiving; V2 review columns omit
expiry/batch/worker and retain one photo path. Known additive save lacks a client
operation identity. No server writes, migrations, policies or permissions changed.

## Remaining blockers and limits

- Unknown captures cannot reach complete durable cloud Needs Review yet. They
  remain local safety copies; local success is never presented as a server save.
- Photo retention API/storage is tested, but camera acquisition UI and cloud
  two-photo upload/finalization are not wired. Manual Handheld batch input UI
  also remains out of this data-only change set.
- Backend idempotency/reconciliation is required to unlock ambiguous saves safely.
  No automatic replay or retry of uncertain additive writes is provided.
- IndexedDB drafts are a safety copy, not an outbox or authoritative server state.
  Closing the tab, clearing browser data, device loss and duplicate-tab behavior
  are not established recovery guarantees. Recovering orphaned tab drafts needs
  an operation-aware recovery flow; do not claim zero loss across those events.
- Emulator tests are not browser/device verification. Chromium installation failed,
  so real IndexedDB/device behavior and visual layout were not verified here.
- Separate migration proposal was prepared outside the repository, not applied or
  database-executed. It requires isolated SQL tests, client adoption, review reads,
  media lifecycle, reconciliation and rollout validation before approval.

## Latest backend proposal — 2026-10-08

Corrected review-only migration and focused SQL tests are now in
`proposals/expiry-backend/` and `tests/expiry-backend/`. Existing Expiry capture
entry points gain explicit operation-aware guards; Receiving bodies and
correction/clear behavior remain preserved. New storage guards, complete-field
validation, authorized read/reconciliation and resolved-photo cleanup are prepared.
No migration was applied to shared Supabase; no frontend UI or runtime changed.

Local SQL engine: PostgreSQL 18.3 / PGlite 0.5.8, synthetic dependencies only.
16 SQL tests and 3 static checks passed. Native multi-connection PostgreSQL
integration/concurrency remains NOT RUN; provisioning failed on container UID/GID
restrictions. Existing focused client regressions: 54 passed. Build passed.

Next: run prepared native tests when a disposable Work PostgreSQL instance is
available, integrate the client with new operation/evidence contracts, reconcile
legacy uncertain saves and verify Storage API binary lifecycle before any
controlled application on the existing shared backend. Current a26869b8 client
cannot be paired with this migration alone. See the proposal README for limits.
Status remains BLOCKED / NOT READY FOR USER TEST / NOT DONE.

## Handheld integration — 2026-10-08 (supersedes earlier client blockers)

Starting local commit: b62fa7b475da9eefbfb4908990a89599a6776a77.
Branch: feature/expiry-stage1-visual-gate only. Proposal SQL remains unchanged,
review-only and NOT deployed to shared Supabase.

Implemented:
- Compact Handheld fields and custom dropdowns, optional manual batch, worker
  retained per authenticated user/pharmacy browser session. Replaced conflicting
  Handheld field-height rules with one owner; Desktop styling remains frozen.
- One camera input: product → expiry → both previews → individual retakes.
  Existing canonical photo preparation is reused without changing Receiving.
- Exact raw scan and ordinary identifiers; GS1 GTIN/lot/serial/date retained.
  No barcode numeric coercion. Save uses scan-derived identity rather than a
  master alias display. GS1 evidence must agree with the backend validator.
- Stable operation UUID persisted with the local draft before RPC submission.
  Reserve, immutable two-photo upload, operation-aware finalization and strict
  acknowledgement. Unknown saves additionally read the authorized review contract
  and verify every submitted field/photo reference before local clearing.
- Explicit same-operation retries after ambiguous replies. COMMITTED operations
  are checked by replaying the frozen identical payload (backend idempotency),
  without new quantity increments or review cases. No legacy capture fallback.
- IndexedDB recovery on reload plus explicit previous-tab draft recovery, scoped
  to user/pharmacy. Cross-tab recovery requires Web Locks; unsupported browsers
  fail closed. Frozen payloads and both Blobs survive recovery. Legacy uncertain
  drafts without operation IDs remain blocked pending external reconciliation.
- Upload failures retain both photos and successful role references; retakes use
  fresh object IDs, never upsert. Cleanup is left to the proposed authorized
  resolved-review lifecycle; no shared Storage deletion was performed.

Verification:
- Focused client/camera/draft/Receiving suite: 99 PASS, 0 FAIL.
- SQL + static suite: 20 PASS, 0 FAIL, 1 SKIP. PostgreSQL 18.3 / PGlite 0.5.8,
  synthetic dependencies, includes client adapter → actual proposal SQL → two
  Storage metadata rows → authorized complete review read → idempotent replay.
- Build PASS; git diff --check PASS. Mock camera/DOM and fake IndexedDB tests are
  automated logic evidence, not a real Zebra browser or camera verification.

NOT RUN / remaining gates:
- Native multi-connection PostgreSQL concurrency (existing provisioning blocker).
- Real Supabase Storage HTTP/binary upload, immutable-object guards and authorized
  cleanup. SQL tests insert synthetic metadata only; no Storage service was used.
- Actual Zebra 360×640 rendering, custom dropdown placement, Web Locks support,
  photo preparation/acquisition, keyboard/focus and durable browser storage.
- Shared-backend compatibility/cloud persistence: migration is NOT deployed.
  Missing/incompatible contracts preserve the local draft and block saving.
- Reconcile all pre-cutover uncertain legacy writes before controlled migration.
  Apply only after the migration/security and Storage gates are approved, paired
  with this client. Then verify Handheld end-to-end with Product Owner approval.

Local drafts are safety copies, not a guarantee against device loss, browser-data
clearing or storage eviction. No push, deployment, Production change or shared
Supabase SQL/data/permission change. Status: IMPLEMENTED LOCALLY / CLOUD AND
DEVICE VERIFICATION BLOCKED / NOT DONE / NOT READY FOR USER TEST.
