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

Next: review the separate Expiry-only contract proposal; verify it in an isolated
database before applying anything. Then connect the camera/evidence workflow and
operation-aware retry, verify durable cloud records and pharmacy isolation, and
only afterward prepare a Product Owner test candidate. No Production promotion.
