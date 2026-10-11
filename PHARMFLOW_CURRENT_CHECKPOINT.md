# PharmFlow Current Checkpoint — 12 October 2026 (Riyadh)

Staging branch: feature/expiry-stage1-visual-gate. Parent 51c63db78eb3c44eeaf2dab89e37039c42b1421d.
Candidate: the commit containing this checkpoint; exact ending SHA is recorded in the release response.
Supabase tovkcakucyagvbzvlnks (pharmflow-staging), Vercel pharmflow-test.
Stable URL: https://pharmflow-test-git-feature-expiry-stage1-115007-fhyh2xtskz-3504.vercel.app/

Final Handheld refinement IMPLEMENTED / AUTOMATED VERIFIED; READY FOR PHYSICAL TEST after deployment. Not USER VERIFIED or DONE. Desktop acceptance is next after Handheld acceptance.

Implemented: compact mandatory photo action without inline preview; two-tab server-owned History; quantity replacement and single-operation reversal in the active session; pending-review effective quantity with immutable original evidence; durable correction request identity; server session closure on Back/navigation/sign-out; larger Back control; hidden scanner diagnostics; immediate SAVING and fewer Handheld RPCs/projection waits.

Applied additive migration 20261011212352_expiry_active_session_history_and_corrections_v1: three private RLS tables, five authenticated session RPCs, effective-quantity integration in existing review list/resolver. No historical backfill, deletions, remaps or data rewrite. Before/after fingerprints match for operations 50, events 40, state 19, reviews 6, Storage 9. AI11 helper unchanged; cron.job remains empty.

Verification: focused 369 PASS / 0 FAIL / 1 SKIP; full 528 PASS / 43 FAIL / 1 SKIP with identical 43 baseline failure names. Build/syntax/diff checks pass. Independent native SQL concurrency remains skipped; serialized locks/stale revision and isolation tested in disposable PGlite. Viewport rerun BLOCKED because existing Chromium exits before startup. No authenticated browser save or physical performance measurement claimed.

Physical save delay previously reported 1–3 seconds. Synthetic known adapter, 30ms/RPC, about 63ms before to 32ms after (two RPCs to one); excludes actual network, first session-open, Storage and browser rendering. Unknown still requires evidence upload/validation. Numeric-only in-memory lastSaveTiming separates stages.

Remaining acceptance: TC26 Dompy/Flutab scan and Save & Next; unknown capture/photo without outer scroll; History photos; save A then B, replace A quantity, delete A only; refresh/reconnect, Back/reopen read-only old sessions; numeric keyboard and internal list scrolling; DS46/Receiving spot checks.

Protected: Production/main/Supabase zz... excluded, Receiving/Settings business logic, exact V2 identifiers/pharmacy priority, original evidence, HHP084 historical operations and paused cleanup scheduler. Auth/router changes are limited to awaiting Expiry closure before exit; authentication architecture unchanged. No Production promotion. Rollback instructions and complete evidence: docs/expiry-handheld-final-acceptance.md and proposals/staging/expiry_active_session_rollback.sql.
