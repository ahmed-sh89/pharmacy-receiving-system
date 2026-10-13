# Grouped Session correction — separate Staging approval required

REVIEW ONLY, NOT APPLIED. SQL: proposals/staging/expiry-group-correction-proposed.sql.
Target only tovkcakucyagvbzvlnks. Production excluded.

## Proven limitation and minimum proposal

Live inspection confirmed the existing public.correct_pharmflow_expiry_desktop_session_v1 accepts one operation ID/revision. A client loop can partially succeed and cannot reject changed complete group membership. The proposed new RPC is:

`correct_pharmflow_expiry_desktop_group_v1(p_pharmacy_id uuid, p_session_id uuid, p_state_id uuid, p_request_id uuid, p_expected_members jsonb, p_quantity integer) returns jsonb`

Expected members are the COMPLETE active operation IDs/revisions for one signed-session canonical state; serial does not identify the group. State identity already encodes pharmacy + canonical product + normalized batch + expiry. Quantity zero cancels that group's current-session contributions. No batch/date/product moves in this RPC.

## Tables and data affected

Add private session_group_adjustments_v1, one audit/idempotency record per group request. Update only existing current session_captures_v1 effective quantities/revisions/facts through the existing single-capture correction function. Its existing session_adjustments_v1 and expiry events preserve individual audit linkage. Current pharmacy Inventory receives only the delta. No historical capture rewrite, raw-operation payload/serial rewrite, backfill, destructive merge, Receiving tables, or existing Inventory RPC changes. SQL is outside the migrations directory and is not a deployment migration.

## Authentication, RLS, ownership

The live require_signed_session helper checks pharmacy membership, auth.uid(), valid live auth.sessions, exact owning auth session, pharmacy and created_by; locks the active session row. The proposed endpoint reuses it before reads/retries and requires an open session for a new write. Known PC captures only, same canonical state, pharmacy/session and owner. Reject other sessions/users/pharmacies, unknown/review and Handheld groups. Public SECURITY DEFINER is necessary to reuse the existing private-ledger path, with explicit fully qualified relations/helpers and search_path=pg_catalog. PUBLIC/anon EXECUTE revoked; only authenticated granted. New private audit table has RLS enabled, no client policies and no direct authenticated/anon/PUBLIC grants. No service key/browser bypass. Existing public single-operation API is not changed.

## Atomicity and concurrency

One SQL call is one transaction. Lock order: signed session row (existing helper), request advisory lock, existing canonical advisory lock, current Inventory row, deterministic capture row locks. Re-read COMPLETE member IDs/revisions under locks and reject stale/added/removed members. Same-session new capture/correction uses the same session lock; other sessions' Inventory writes use the existing canonical lock. Reuse external RECOUNT/CLEARED read-only guards. Internal server calls to the existing correction routine remain in the same transaction; any later error rolls back ALL earlier member changes/events/audits. This is not a client request loop. Deadlock/serialization failure must cause whole-call rollback and durable retry of the SAME request, never partial success.

Deterministic allocation preserves source records: descending operation UUID, decrease member quantities until delta exhausted, or add increase to first member. Preserve immutable raw payload and original serial. This changes effective contributions, not historical captures; the group parent links member adjustment acknowledgements. Maximum supported group500 members; larger group returns an explicit unsupported error rather than partially editing.

## Idempotence and rollback

Parent request ID serializes requests and stores pharmacy/session/state/owner, canonical expected members and requested quantity. Exact replay returns original result even after group cancellation; changed payload/scope rejects. Member adjustment requests are generated only during the first transaction and captured in parent results. Failed transaction leaves no parent record or member changes. Retry uses same parent request ID.

Before first approved application, verify exact live dependencies again and transactionally create the new table/RPC/grants. Exposure rollback: revoke authenticated execute, then remove only the new RPC; retain audit table and all historical adjustment/events. Do not undo accepted quantities or delete audit records automatically. There is no existing-data backfill to reverse.

## Verification evidence and pending gates

Local disposable PGlite tests execute the proposal only locally: historical5 plus two serial-distinct captures1+1 =7; group edit4→Inventory9; delete→5; historical capture/raw serial preserved. Exact retry, payload conflict, stale completeness/revisions, pharmacy/session/anon rejection. A deliberately invalid second member after a first member mutation proves transactional rollback of quantities/revisions and no parent audit insertion.

Existing native independent-concurrency test remains skipped; independent connections are not simulated by PGlite. Before enabling UI, separately verify simultaneous group edits, group/new-capture, another-session Inventory recount, stale/new/removed members, retry after network interruption, closed/expired/revoked sessions, different auth owner, historical quantities, maximum group, overflow and no Receiving regression in approved Staging tests. NO live grouped correction or migration was performed in this round.

Approval requested: apply this reviewed SQL to Staging only, then separately wire the UI to one durable group request and verify all acceptance cases. Current Edit/Delete buttons remain disabled until that work is approved and passes.

Primary security reference: https://supabase.com/docs/guides/database/functions
