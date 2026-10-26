# Phase A — Expiry resume recovery

Baseline/rollback: e452f22e372ad94607ab73cc2c05efb47056bce9. Status: READY FOR USER VERIFICATION after conditional Production publication. The Product Owner verified navigation recovery from that release, but Expiry workspace recovery failed; overall sleep recovery is not DONE.

Confirmed source mechanism: the Desktop focus listener started protected reads while permissions were loading/unavailable. A same-key pending read could be reused by the permission-ready recovery path. Desktop did not subscribe to permission readiness or retry transient workspace failures; identical successful data did not repaint the retained error. Isolated negative controls on the baseline fail all three permission-delay/transient-recovery scenarios.

Fix: Desktop waits for the existing permission single-flight, refreshes on permission-ready/online/visible/focus, and retries transient read errors at most three times (1/3/8 seconds). Request identity includes permission generation and auth identity epoch; stale results cannot commit. Successful reads explicitly clear the loader's retained error, even when data is unchanged. Genuine denials remain denied. Recovery refreshes the current view without Clear, reload, form reset or mode change. Activation waits for permissions, and previously selected Inventory remains selected within the same scope. Existing signed session, correction journal keys and mutation contracts remain unchanged.

Runtime files: js/expiry-desktop-v2.js, js/permissions.js (read-only readiness/generation accessors), index.html (cache versions). Tests: tests/expiry-resume-recovery.test.cjs; tests/expiry-desktop-harness.cjs (event capture). Records: this file and PHARMFLOW_CURRENT_CHECKPOINT.md.

Evidence: nine new focused tests PASS. Combined auth, reconciliation, inventory search, draft/session and scanner suites: 99 PASS, two pre-existing failures reproduced on the unchanged baseline. Five additional existing operational/request-suite failures also reproduce unchanged on the baseline. Build and syntax PASS. Handheld History: nine PASS, one prior visual test skipped. These are isolated mocks/fixtures, not Production operational transactions or physical Windows sleep.

No SQL, RPC, RLS, role, pharmacy, account or operational-record changes. Phase B monthly KPIs are excluded from this Production patch. Deployment must use expected-parent main update and verify served SHA/assets; physical Windows Sleep/resume with both Expiry tabs remains the Product Owner acceptance gate.
