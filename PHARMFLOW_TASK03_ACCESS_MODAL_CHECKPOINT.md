# Task 03 — Access Management modal polish
2026-10-25 (Asia/Riyadh). Staging only; no backend or Production changes.
Baseline: staging/auth-access-parity-20261024 @ 36507739668c63f84253b5f20a09fbce6254931d.
Status: READY FOR PRODUCT OWNER UI TEST.

## Implementation
- Shared centered native dialog, compact 460px / creation 680px maximum width, subtle backdrop, title/X, compact controls and sticky header/footer. No library or animation.
- Existing Create form is moved into its dialog and returned on close: same fields, request data, required initial choices, operation journal and retry handler. No duplicate form.
- Permissions retains the same read/save RPC and revision conflict handling. Dirty state survives save failure. All dismissal paths respect the same discard guard and busy-state gate.
- Edit gathers Name/Code together; the existing validation, confirmation and identity RPC are unchanged. Admin Assignment retains its input validation and separate confirmation.
- Reset/Suspend/Reactivate use titled compact confirmations. Temporary password result retains visibility and Copy Password; result may close while the surrounding reset handler is busy, avoiding a deadlock.
- X, Cancel, native Escape and backdrop request guarded dismissal. Dismissal never submits. Native top-layer modality plus Tab wrapping manage focus; nested discard confirmation restores its parent's dismissal hook. Grid search, KPI, sort, expanded row and scroll are restored.
- Unrelated Rename Operator keeps its exact previous shared-dialog presentation.
- Copy Email text replaced with an accessible SVG icon beside the email, title/aria label and brief copied feedback. Grid and timestamps remain unchanged.

## Evidence
PASS: 29 focused automated cases: nine modal behavior scenarios; existing permission editor/revision/error and permission projections; Auth/password gate non-regression; existing KPI/search/selection; sort and creation validation/retry/modal close.
PASS: Preview build. No SQL, migrations, Edge/Auth-account changes or backend audits were executed for this task.
UI tests use synthetic DOM/transport fixtures; no account or operational data created. These are UI/contract checks, not new live backend acceptance.
NOT TESTED: authenticated browser visual acceptance, actual Windows Chrome zoom at 75–80%, physical Handheld. Prior environment lacks a usable local browser binary. Do not claim these visual checks passed.
No known automated UI failures. Existing Receiving dependency blockers remain outside this UI-only task; full operational acceptance not claimed.

## Next action
Product Owner checks modal sizing and dismissal at normal 75–80% Chrome zoom on the final Staging Preview. No Production promotion or next phase authorized.
