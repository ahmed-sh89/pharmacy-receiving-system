# Staging Receiving security checkpoint — 2026-10-25

Scope: approved legacy transport retirement and Receiving authorization compatibility only. Production main remains `bd20065f0a2c7bb44861df88e1d021225e7c9725`; Production database read only.

Staging source baseline `644f541c1aa2889cf5ae2f1ce02489da8ff17a0d`. Current task changes `js/supabase.js`, focused tests, 15 applied Staging migrations and `release/authorization-20261025`.

PASS: 47 Disabled and 47 cross-pharmacy denials; 11 legacy RPCs blocked for both anon/authenticated; Enabled manifest, history and receipt; Delete/Finalize/Reset compatibility, retry idempotency and injected-failure rollback; historical data preservation; Read Only and RLS. All SQL fixtures rolled back. Forty-seven original Production operational bodies remain unchanged after removing the inserted authorization guards; signatures, return contracts and ACLs match.

PASS: 22 focused Node tests, Staging build, 22 Receiving DDL replay units, isolated Production candidate patch application/build with Production-only metadata. Two pre-existing test assumptions were corrected (missing window mock; expanded report cache version), without application behavior changes. Physical Handheld/deployed browser smoke not tested.

NOT READY for Production: original-Production full guard rehearsal failed on `count_pharmflow_needs_review_v2(uuid,text)` return type: Production integer vs Staging bigint. No DROP or return-contract change performed. Full rehearsal stopped. Rehearse the complete release on a disposable Production-matched database before promotion. Candidate SQL, source patch, preflight, recovery and smoke plan are recorded in the release package; no Production promotion was executed.
