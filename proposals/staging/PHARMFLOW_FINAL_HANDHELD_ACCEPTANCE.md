# Expiry Handheld final correction acceptance — Staging only

Starting verified source/deployment: 95f0b311e666f640cf902a544645cfb72963415b.
Branch: feature/expiry-stage1-visual-gate. Repository: ahmed-sh89/pharmacy-receiving-system.
Supabase: tovkcakucyagvbzvlnks / pharmflow-staging / ACTIVE_HEALTHY.
Vercel: pharmflow-test / prj_SLUdsr7jh2gWtOQYj44jaKxAl1Lw / Preview only.
Stable URL: https://pharmflow-test-git-feature-expiry-stage1-115007-fhyh2xtskz-3504.vercel.app/

IMPLEMENTED
- Sign In through Sign Out defines the operational session. Back, workspace navigation, refresh and the unchanged 10-minute Idle Sleep retain it. No heartbeat, polling or operational timeout added.
- Server-generated operational ID binds account/pharmacy to the actual signed JWT session_id and auth.sessions row. Expired/revoked credentials cannot write. Unsigned v1 session APIs are no longer client-callable.
- Unknown identifier Note and Photo independently optional. Note is a persisted identification aid, never official identity or a mapping.
- One History, latest 10 distinct saved operations in the current signed session, newest first. Database storage remains unlimited. One expanded row; labeled facts/status/note/private thumbnail, separate photo overlay. Draft photo supports retake/remove before upload/submission.
- Quantity/Batch/Month/Year replacement and exact operation deletion use atomic audited request IDs/revisions. Known contribution moves subtract only the original contribution, then add to destination. Pending unknown facts flow into authoritative resolution. Resolved reviews are read-only. Original evidence/raw scan/item/serial remain immutable.
- Immediate SAVING; no next scan or draft clearing before durable ACK. Warm no-photo capture needs one capture RPC; confirmed_capture ACK avoids redundant review read. Photo capture retains reservation and upload validation. No local durability stages removed.
- Existing Capture layout, Ready to Scan, green feedback, quantity controls and Back/History positions preserved. Viewer sits above History; internal scrolling uses shared visible viewport.

DATABASE APPLIED AND VERIFIED
Migration: 20261012002022_expiry_final_handheld_signed_session_optional_evidence.
One guarded transaction: exact old definition hashes, constrained search paths, restricted grants, 11 historical-table fingerprints, no data deletion/remapping. Additive auth_session_id/facts metadata and optional-photo constraint only.
Before/after exact rows AND fingerprints: operations 54; events 45; current state 20; Needs Review 7; Storage objects 10. Existing HHP084 history preserved by whole-table integrity checks. AI11 helper unchanged: 02c421e4814fd04ed1c76e89e5709189. cron.job count 0 before/after; photo cleanup scheduler not modified.
Five new signed-session RPCs authenticated only; two private helpers postgres only; five unsigned v1 APIs postgres only. RLS unchanged. Public schema not writable by anon/authenticated. Unauthenticated session request rejected. Advisors: same categories/counts; five intentional authenticated RPC replacements, no new anonymous access.
Legacy unsigned sessions cannot safely be attached to an actual auth session and are preserved as historical data, not adopted. Fresh Sign Out / Sign In once for physical acceptance.
Contingency: PHARMFLOW_FINAL_HANDHELD_ROLLBACK.sql pauses writes without deleting rows or reopening unsigned APIs; prior UI can be restored as a read-only Preview contingency, then verified forward repair. Do not apply it unless required.

AUTOMATED VERIFIED
Focused actual PostgreSQL (PGlite) + UI: 53 PASS / 0 FAIL / 1 SKIP.
Full: 533 PASS / 43 FAIL / 1 SKIP versus previous 528 / 43 / 1; exactly the same failing names, no new regression failures. Build, JavaScript syntax and git diff checks pass.
Tests cover optional evidence combinations, repeated save idempotency, exact payload ACK, corrections/retry/revision, contribution moves/deletes, unknown resolution effective facts, latest 10, cross-pharmacy/account/session denial, expiry/revocation/Sign Out/new login, UI busy gate and Back retention. Existing strict GS1/AI11 and exact identifier tests preserved.
One skipped test requires independent native PostgreSQL connections; PGlite serial transaction behavior is verified, true simultaneous-connection lock contention remains unverified.
Synthetic adapter timing only: injected 20ms/RPC + 40ms/upload gives roughly 21–23ms for no-photo saves and 89ms with photo. Not real network or TC26 performance evidence.

READY FOR PHYSICAL TEST — NOT DONE
Authenticated live save/latency measurement blocked by Sign In page: no active authenticated browser session available. No credential bypass or impersonation used. Native Chromium viewport runner crashes before launch; physical TC26 layout/keyboard/photo acceptance remains required.
Test fresh login: known and unknown (none/note/photo/both); Back/refresh retains History; edit earlier operation quantity/batch/date then delete it without changing another operation; latest 10/no tabs/accordion/photo overlay; Sign Out/new login blocks old session mutation; 10-minute sleep/refresh. Physical Dompy scan remains required.
USER VERIFIED applies only to earlier 95f0b3 evidence: recognized scans/saves, unknown/photo capture and active-session Edit/Delete. New session/visual/evidence rules are not USER VERIFIED yet.

BOUNDARIES / PRODUCTION
Production main/database/config/data untouched. Receiving/Settings and shared identifier service unchanged. AI11 remains Production Date with strict fixed six-digit validated semantics; AI17 remains Expiry. Existing V2 service/mapping priority/exact identifiers retained, no Staging master copied to Production. Eventual Production backend parity/migrations, permissions/Storage, physical acceptance and full release gates require separate approval. Expiry is not Production-ready. Permanent photo cleanup is not asserted while scheduler is paused; lifecycle acceptance remains a future gate.
