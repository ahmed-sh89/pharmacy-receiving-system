# PharmFlow DEV — Project Baseline & Engineering Rules

These instructions apply throughout this repository and to future Codex work here.

## 1. Project track and boundaries

- This repository is **Project B (DEV/TEST)**. Project A is the live production system and is outside this repository's scope.
- Never assume a Project B change is approved for Project A. Production promotion is a separate controlled release step after verification and explicit authorization.
- Do not modify anything outside this repository.
- DEV currently uses a dedicated pharmacy tenant (DEV001) in a shared Supabase project, not a separate backend. Preserve the authentication boundary and mutation guards in `js/auth.js` and `js/dev-isolation.js`; preserve Global GTIN read access and DEV mutation restrictions. A DEV checkout does not make shared backend changes safe.

## 2. Architecture baseline and runtime truth

The baseline below comes from repository inspection and the prior **Audit PharmFlow architecture** task (ID `01a07dcf-64ad-7863-bcf1-3ed21eaafef1`). That audit was static and read-only, not live device, deployed database, or network verification. Recheck the relevant paths as the code evolves.

- This is a browser application using classic scripts, shared globals, mutable state, and Vite tooling (`package.json`, `vite.config.js`). Root `index.html` selects the runtime.
- The root entry loads `js/config.js`, `js/utils.js`, `js/state.js`, `js/router.js`, **root `ui.js`**, `js/excel.js`, `js/master-gtin.js`, `js/scanner.js`, `js/receiving.js`, `js/session.js`, `js/reports.js`, `js/supabase.js`, `js/orders.js`, `js/auth.js`, `js/dev-isolation.js`, `js/needs-review.js`, `js/expiry.js`, **root `cloud-workspace.js`**, `js/data-layer.js`, `js/pharmflow-next.js`, `js/app.js`, then `js/handheld-runtime.js`.
- Root `app.js` and `auth.js`, `js/ui.js` and `js/cloud-workspace.js`, and the nested `pharmacy-receiving-system-main/` application are not selected by the root entry page. They are not interchangeable copies; other deployment or compatibility usage must be established before editing or removing them.
- `js/state.js` owns `AppState` and local workspace/transaction persistence. Root `cloud-workspace.js` owns shared manifest/generation reconciliation, the durable transaction upload queue, ledger delta synchronization, and idle sleep. Compatibility workspace snapshots also participate in current behavior.
- `js/scanner.js` and `js/receiving.js` implement barcode parsing and receiving transactions. `js/handheld-runtime.js` owns handheld hardware input and focus/readiness; root `ui.js` also contains handheld workflow and review mutations.
- `js/excel.js` and `js/orders.js` own import and order lifecycle; `js/reports.js` and `js/session.js` participate in projections, finalization, archives, and compatibility files. `js/needs-review.js`, root `ui.js`, and `js/expiry.js` participate in exception handling. `js/master-gtin.js` owns master-cache and alias lookup behavior.
- `js/data-layer.js` is a small facade, not a comprehensive repository boundary. Actual RPC calls also occur in business and UI modules. Loaded legacy session code is not automatically dead.
- Checkpoint/readme claims can differ from the loaded implementation. SQL files show source definitions, not proof of what is deployed. `PHARMFLOW_TEST_MATRIX.md` is a manual checklist, not evidence that tests passed.

Do not infer runtime behavior from filenames alone. Trace HTML/script loading order, imports, runtime overrides, event listeners, global functions, repositories/services, and actual call paths. Distinguish **code exists** from **code executes in the current runtime**.

## 3. Root-cause-first policy

For bugs involving state, persistence, synchronization, Supabase, authentication/session, Active Order, Receiving transactions, PC ↔ Handheld behavior, caching, or network/idle behavior, do not patch the visible symptom first.

Trace the complete responsible flow:

`initialization → local state/cache → server/Supabase authority → synchronization → persistence → rendering/UI`

Identify the responsible layer before implementing a fix. Follow the actual transaction/event/RPC path, including pending writes, failure handling, hydration, and later overrides where relevant.

## 4. Non-regression

Preserve verified PharmFlow behavior unless the requested change explicitly modifies it. Treat these as sensitive areas and do not casually change them as side effects of unrelated work:

- Receiving and the Active Order Manifest.
- Scan → quantity → persistence flow, including order attribution and corrections.
- PC ↔ Handheld synchronization and Handheld receiving.
- Supabase authority/data integrity and authentication/workspace isolation.
- Needs Review / unknown GTIN flow.
- Idle/network sleep and egress optimization.
- Order finalization/history and Global GTIN Master behavior.

Use regression checks appropriate to the affected boundary. Distinguish verified behavior from expected behavior and unresolved audit observations.

## 5. Supabase authority and egress

- Supabase is authoritative where the current architecture defines it as authoritative: identity/membership, shared Active Order structure, and the shared receiving ledger are key boundaries. Local snapshots, optimistic quantities, caches, and compatibility snapshots must be traced in relation to that authority.
- Before adding polling, realtime subscriptions, full-table/full-manifest reads, refresh loops, retry loops, or synchronization calls, check whether an existing mechanism already performs the job.
- Inspect both the main cloud scheduler and independent callers such as the handheld watcher, focus/visibility handlers, UI counters, and queue retries. The audit found polling-based synchronization; do not assume a realtime subscription exists.
- Prefer delta/incremental synchronization where compatible with the established architecture. Preserve transaction idempotency, cursor correctness, generation boundaries, pending writes, and account scope.
- Do not introduce duplicate network paths. Assess request frequency and payload size as well as functional correctness.

## 6. Legacy and duplicate code

The repository contains mixed generations and compatibility code. Do not delete code merely because it appears old, duplicated, unused, or legacy.

First prove whether it is loaded at runtime, called indirectly, used as a fallback, required for compatibility, overridden later, or genuinely dead. Check other entry points and deployment usage where applicable.

When modifying an affected path, clean obsolete or duplicate logic only after proving it is safe and within the requested scope. Prefer consolidation over stacking patches; do not turn a focused fix into unrelated cleanup.

## 7. Handheld

- The Handheld is part of the same pharmacy workspace. Do not redesign it around a user-facing Create/Join session model unless explicitly requested.
- Preserve the current hardware-input boundary: handheld input-value capture routes to shared receiving logic and suppresses competing legacy listeners. Do not reroute it through a session-gated PC path without tracing the consequences.
- Protect hardware scanning, focus behavior, quantity updates, Last Scan, PC ↔ Handheld consistency, and unknown GTIN → Needs Review synchronization.
- Preserve the distinction between shared received quantities and device-local Last Scan/batch state. Verify hardware-specific behavior on a device when required; desktop/static checks do not establish it.

## 8. Change scope

Implement the smallest coherent root-cause change. Do not refactor unrelated modules during a feature or fix. If the request requires a broader architectural change, explain why before implementing it.

## 9. Before editing

For non-trivial changes, identify the responsible files/modules, explain the root cause or implementation path, identify regression risks, and state the intended scope before modifying code when practical.

Inspect relevant checkpoint/decision/test documentation, but resolve discrepancies against actual runtime ownership rather than assuming the newest label is effective.

## 10. After editing and verification

Report files changed, behavior changed, root cause addressed (or not applicable), tests/checks performed, remaining risks, and recommended manual verification.

- Do not claim runtime verification unless it was actually performed.
- `package.json` currently provides `dev`, `build`, and `preview`; it defines no automated test script. Build success alone does not verify synchronization or data integrity.
- For affected operational paths, select relevant manual scenarios: PC/Handheld scans and quantity changes, refresh/reconnect and pending writes, multi-order attribution, unknown GTIN review, finalization/history, account isolation, idle/resume, and network request behavior. Use DEV test data within the authorized scope.
- Starting the application can contact the shared Supabase backend and write browser state. Distinguish static inspection, build checks, browser checks, device checks, and deployed SQL verification in the report.

## 11. Git safety

Do not push automatically merely because code changed. The normal workflow is:

`inspect → modify Project B → test/check → review diff → user approval → commit → push`

- Before committing, show a concise change summary and obtain user approval. Editing authorization alone is not commit/push authorization.
- Never push to a production repository or branch without explicit authorization.
- Use clear commit messages: subject under 50 characters when practical, followed by useful implementation details when needed.
- Inspect status before and after work, review the diff, and preserve unrelated user changes.

## 12. Security

Never expose or commit passwords, access tokens, service-role keys, private credentials, or authentication secrets. Do not weaken authentication or workspace isolation to make a bug disappear. Client DEV guards supplement server authorization; they do not replace it.

## 13. PharmFlow principle

Reliability and data integrity are more important than cleverness. Avoid quick patches that create hidden synchronization, persistence, egress, or authentication problems later.

## 14. Audit findings are not automatic fixes

Previous architecture-audit observations are investigation leads, not authorization to modify them. Do not automatically fix every concern. Confirm a suspected static risk against the relevant runtime behavior before changing it.

The prior audit highlighted script-version divergence, overlapping synchronization/retry paths, cursor/manifest arrival ordering, multi-step finalization/review cleanup, and idle flush ordering. These are leads for an explicitly scoped investigation, not established device reproductions or a standing cleanup task.
