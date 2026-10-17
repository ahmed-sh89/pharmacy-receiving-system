# Expiry Handheld final candidate — 12 October 2026 (Riyadh)

Parent: 51c63db78eb3c44eeaf2dab89e37039c42b1421d. Staging only, branch feature/expiry-stage1-visual-gate.
Supabase tovkcakucyagvbzvlnks / pharmflow-staging; Vercel pharmflow-test.
Testing URL: https://pharmflow-test-git-feature-expiry-stage1-115007-fhyh2xtskz-3504.vercel.app/

## Implemented / automated verified
- Capture retains one required evidence photo in the durable draft, with a compact Take/Retake action and no inline preview. Saved photos load in Needs Review case details using the existing private Storage reader.
- One History entry, exactly Active Session and Needs Review tabs. Active captures are read from the server without the old fifteen-ID local limit. Needs Review history includes all authorized statuses; original evidence is retained.
- Server sessions bind pharmacy, creator and device. Back, route exit and sign-out await closure; refresh retains the same scoped identity. A newly opened identity closes earlier open sessions for that account/device. Closed sessions cannot reopen. Historical captures cannot be attached to a new session.
- Quantity replacement and deletion affect only the selected operation contribution. Original capture payloads remain immutable. Corrections have unique request IDs, revision checks, audit records, and serialized session/item locks. An independent inventory recount makes an older contribution read only. Inventory may never become negative.
- Pending unknown operations have an audited effective-quantity overlay. Authorized review resolution consumes that quantity; original photo/scan/capture facts remain immutable. Pending deletion uses the existing review deletion and photo cleanup path. Resolved or deleted cases are read only.
- Correction requests are stored before sending and reconciled with the same request identity after interrupted responses. Save drafts are retained until authoritative acknowledgement and local durable cleanup. No optimistic Saved state.
- Immediate SAVING feedback and duplicate-tap lock; known Handheld save no longer needs a separate reservation RPC. Both kinds no longer await a second receipt fetch or unrelated projection refresh before returning to scan readiness. Unknown submission retains reservation, upload verification and authorized evidence read.
- Back touch target/icon enlarged; diagnostic control hidden. AI11/GS1, identifier service, Receiving and Settings business behavior unchanged. Desktop layout unchanged; shared review readers/resolution honor edited review quantities.

## Database and rollback
Applied migration 20261011212352_expiry_active_session_history_and_corrections_v1.
Three private RLS-enabled tables, five authenticated RPCs; no direct anonymous/authenticated table access. Existing review reader and resolver use the audited quantity overlay, retaining their ACLs. Original function hashes are guarded before deployment.
Schema migration locks existing capture/evidence tables briefly and checks before/after fingerprints inside the same transaction. Post-apply fingerprints identical: operations 50, events 40, inventory states 19, reviews 6, Storage objects 9. Historical HHP084 operations unchanged. AI11 helper hash unchanged. cron.job remains empty.
Rollback: revert the client to the parent, revoke the new RPCs using expiry_active_session_rollback.sql, and preserve all audit/session tables. Do not revert quantity readers after a correction exists; no destructive rollback is permitted.

## Verification and limits
Focused: 369 PASS / 0 FAIL / 1 SKIP. Full: 528 PASS / 43 FAIL / 1 SKIP, exactly the same 43 failure names as the 506/43/1 parent baseline. Updated superseded tests now verify two-tab History, server session ownership, and no inline photo, rather than the previous fifteen-row/inline-preview requirements.
Build, changed-file syntax and whitespace checks pass. Native independent-connection concurrency remains skipped; SQL locks, stale revisions, idempotency, pharmacy/account denial, pending-review correction/resolution and single-operation reversal are verified in disposable PGlite.
Browser viewport rerun is BLOCKED: the supplied Chromium binary exits before page startup. No new physical layout acceptance is claimed. Prior physical viewport passes are inherited, not verification of this candidate.
Previous physical save delay was reported as 1–3 seconds. Controlled adapter test with 30ms per RPC measured approximately 63ms to 32ms for the known-item adapter (two RPCs to one), excluding session-open, local persistence, actual network and rendering. Unknown upload time is not removed. Actual TC26 before/after latency is unmeasured. Numeric-only lastSaveTiming stores validation, handler-to-feedback, RPC, photo upload, persistence, acknowledgement-transition and total durations in memory; it contains no barcode values.
Authenticated browser ONLINE/save acceptance is not independently verified in this run. Management reads, deployed permissions and unauthenticated denial were checked; no live impersonation or synthetic data insertion was used.

## Remaining TC26 acceptance
1. Scan/save Dompy and Flutab; verify immediate SAVING, acknowledgement, exact fields and next-scan readiness.
2. Save an unknown identifier with one photo; verify SAVE remains reachable without outer scrolling and the photo appears in History → Needs Review details.
3. Save item A then B; edit A from 1 to 2, then delete A. Confirm B and earlier sessions are unchanged.
4. Refresh/reconnect while active, then Back and reopen: previous operations cannot regain edit permissions. Check History internal scrolling and numeric-keyboard access.
5. Spot-check DS46 Flutab/Dompy and Receiving. Do not enable the photo scheduler.
All new requirements remain READY FOR PHYSICAL TEST, not USER VERIFIED or DONE. Expiry is not Production-ready; Desktop acceptance follows Handheld acceptance. Production/main/database/deployments were not accessed for writes.
